/**
 * WeChat cloud function `taiqiuRoom`.
 * event.action = create | join | aim | shot | state
 * Persists to collection `taiqiu_rooms` when cloud DB is available.
 *
 * Locked contracts match js/roomStore.js:
 *   POST aim {roomId, shotSeq, angle, power, aimLine?} — Aim|Pull only, no balls[] mutate
 *   GET state?sinceSeq= — Aim/Pull + sinceSeq>=shotSeq strips object-ball coords
 *   create/join/shot return deadlineAt; shotClock foul swaps turn, no rerack
 */
'use strict';

var cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (err) {
  cloud = null;
}

var memory = {};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomId() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var id = '';
  var i;
  for (i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function tokenFor(roomId, seat) {
  return roomId + (seat === 0 ? ':h' : ':g');
}

function roleOfSeat(seat) {
  return seat === 1 ? 'guest' : 'host';
}

function nextTurn(fromSeat, reason) {
  if (reason === 'legal' || reason === 'nine' || reason === 'sync') return fromSeat;
  if (reason === 'new-game') return 0;
  return fromSeat === 0 ? 1 : 0;
}

function clipNick(raw) {
  var s = String(raw || '').replace(/^\s+|\s+$/g, '');
  if (s.length > 32) s = s.slice(0, 32);
  return s;
}

function stampTurn(state) {
  state.turnRole = roleOfSeat(state.turn);
  state.turnOpenId = (state.openIds && state.openIds[state.turn]) || '';
  return state;
}

function cueOnly(list) {
  if (!list) return list;
  return list.filter(function (b) {
    return b && (b.id === 'cue' || b.n === 0);
  });
}

function aimingPhase(phase) {
  return phase === 'Aim' || phase === 'Pull';
}

function emptyState(roomId) {
  return {
    roomId: roomId,
    hostSeat: 0,
    guestJoined: false,
    turn: 0,
    turnRole: 'host',
    turnOpenId: '',
    seq: 0,
    shotSeq: 0,
    balls: null,
    ballsSnapshot: null,
    phase: 'Aim',
    scores: [0, 0],
    winner: null,
    targetN: 1,
    matchOver: false,
    lastReason: null,
    lastSeat: null,
    names: ['房主', '好友'],
    nicknames: { host: '房主', guest: '好友' },
    openIds: ['', ''],
    aimSeq: 0,
    aim: null,
    aimDeadlineAt: 0,
    deadlineAt: 0,
    shotClockSec: 20,
    winnerOpenId: null,
    stars: null,
    foulCode: null,
    foulHint: '',
    pocketScore: 0,
    zoneBonus: 0
  };
}

function col() {
  if (!cloud || !cloud.database) return null;
  try { return cloud.database().collection('taiqiu_rooms'); } catch (err) { return null; }
}

async function read(roomId) {
  var c = col();
  if (c) {
    try {
      var res = await c.doc(roomId).get();
      if (res && res.data) return res.data;
    } catch (err) {}
  }
  return memory[roomId] ? clone(memory[roomId]) : null;
}

async function write(roomId, state) {
  memory[roomId] = clone(state);
  var c = col();
  if (c) {
    try { await c.doc(roomId).set({ data: state }); } catch (err) {}
  }
  return clone(state);
}

function applyDueTimeout(state) {
  if (!state || state.matchOver || state.phase === 'Settle') return state;
  var due = state.deadlineAt || state.aimDeadlineAt;
  if (!due || Date.now() < due) return state;
  if (!aimingPhase(state.phase)) return state;
  state.turn = state.turn === 0 ? 1 : 0;
  stampTurn(state);
  state.lastReason = 'timeout';
  state.foulCode = 'shotClock';
  state.foulHint = '犯规 · 超时';
  state.aim = null;
  state.phase = 'Aim';
  state.shotSeq = (state.shotSeq || 0) + 1;
  state.seq += 1;
  state.deadlineAt = Date.now() + (state.shotClockSec || 20) * 1000;
  state.aimDeadlineAt = state.deadlineAt;
  return state;
}

async function create(payload) {
  payload = payload || {};
  var roomId = payload.roomId || randomId();
  var state = emptyState(roomId);
  if (payload.balls) state.balls = payload.balls;
  if (payload.ballsSnapshot) {
    state.balls = payload.ballsSnapshot;
    state.ballsSnapshot = payload.ballsSnapshot;
  }
  if (payload.scores) state.scores = payload.scores;
  if (payload.targetN != null) state.targetN = payload.targetN;
  if (payload.names) state.names = payload.names;
  if (payload.hostName || payload.name || payload.nick || payload.displayName) {
    state.names[0] = clipNick(payload.hostName || payload.name || payload.nick || payload.displayName);
  }
  if (payload.shotClockSec > 0) state.shotClockSec = payload.shotClockSec;
  if (payload.openId) state.openIds[0] = String(payload.openId);
  state.nicknames = { host: state.names[0], guest: state.names[1] };
  stampTurn(state);
  state.deadlineAt = Date.now() + (state.shotClockSec || 20) * 1000;
  state.aimDeadlineAt = state.deadlineAt;
  await write(roomId, state);
  return { ok: true, action: 'create', roomId: roomId, role: 'host', seat: 0, token: tokenFor(roomId, 0), state: state };
}

async function join(roomIdOrPayload) {
  var roomId = roomIdOrPayload;
  var guestName = null;
  if (roomIdOrPayload && typeof roomIdOrPayload === 'object') {
    roomId = roomIdOrPayload.roomId;
    guestName = roomIdOrPayload.nick || roomIdOrPayload.displayName || roomIdOrPayload.name || roomIdOrPayload.guestName;
  }
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'join', reason: 'missing', roomId: roomId };
  var incomingId = roomIdOrPayload && roomIdOrPayload.openId ? String(roomIdOrPayload.openId) : '';
  var existingId = state.openIds && state.openIds[1] ? String(state.openIds[1]) : '';
  if (state.guestJoined && existingId && incomingId && existingId !== incomingId) {
    return { ok: false, action: 'join', reason: 'full', roomId: roomId };
  }
  state.guestJoined = true;
  if (guestName) {
    state.names = state.names || ['房主', '好友'];
    state.names[1] = clipNick(guestName);
  }
  if (roomIdOrPayload && roomIdOrPayload.openId) {
    state.openIds = state.openIds || ['', ''];
    state.openIds[1] = String(roomIdOrPayload.openId);
  }
  state.nicknames = { host: state.names[0], guest: state.names[1] };
  stampTurn(state);
  state.seq += 1;
  await write(roomId, state);
  return { ok: true, action: 'join', roomId: roomId, role: 'guest', seat: 1, token: tokenFor(roomId, 1), state: state };
}

async function shot(payload) {
  payload = payload || {};
  var roomId = payload.roomId;
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'shot', reason: 'missing', roomId: roomId };
  var fromSeat = payload.fromSeat;
  if (fromSeat !== 0 && fromSeat !== 1) {
    if (payload.role === 'guest') fromSeat = 1;
    else if (payload.role === 'host') fromSeat = 0;
  }
  if (fromSeat !== 0 && fromSeat !== 1) {
    return { ok: false, action: 'shot', reason: 'bad-seat', roomId: roomId };
  }
  if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
    return { ok: false, action: 'shot', reason: 'bad-token', roomId: roomId };
  }
  var reason = payload.reason;
  if (!reason && payload.events && payload.events.length) {
    var ev = payload.events;
    var i;
    for (i = 0; i < ev.length; i++) {
      var t = ev[i] && (ev[i].type || ev[i].kind);
      if (t === 'nine') { reason = 'nine'; break; }
      if (t === 'legal' || (t === 'pocket' && ev[i].legal)) { reason = 'legal'; break; }
      if (t === 'scratch' || t === 'foul') { reason = t; break; }
      if (t === 'timeout') { reason = 'timeout'; break; }
      if (t === 'miss') reason = 'miss';
    }
  }
  if (!reason) reason = 'miss';
  if (reason === 'timeout') {
    var due = state.deadlineAt || state.aimDeadlineAt;
    if (!due || Date.now() + 250 < due) {
      return { ok: false, action: 'shot', reason: 'too-early', roomId: roomId, state: state };
    }
    fromSeat = state.turn;
  } else if (reason !== 'new-game' && !state.matchOver && state.turn !== fromSeat) {
    return { ok: false, action: 'shot', reason: 'not-your-turn', roomId: roomId, state: state };
  }
  var snap = payload.ballsSnapshot || payload.balls;
  if (snap) {
    state.balls = snap;
    state.ballsSnapshot = snap;
  }
  if (payload.scores) state.scores = payload.scores;
  if (payload.phase) state.phase = payload.phase;
  if (payload.targetN != null) state.targetN = payload.targetN;
  state.turn = nextTurn(fromSeat, reason);
  stampTurn(state);
  state.matchOver = reason === 'nine';
  state.winner = reason === 'nine' ? fromSeat : (reason === 'new-game' ? null : state.winner);
  if (reason === 'new-game') {
    state.matchOver = false;
    state.winner = null;
    state.scores = payload.scores || [0, 0];
    state.phase = 'Aim';
    state.targetN = payload.targetN != null ? payload.targetN : 1;
    state.shotSeq = 0;
    state.turn = 0;
    stampTurn(state);
  }
  if (reason === 'nine') {
    state.phase = payload.phase || 'Settle';
    state.winnerOpenId = (state.openIds && state.openIds[fromSeat]) || payload.winnerOpenId || null;
    state.stars = { host: state.scores[0] || 0, guest: state.scores[1] || 0 };
  }
  state.aim = null;
  state.foulCode = reason === 'timeout' ? 'shotClock' : (reason === 'scratch' || reason === 'whiff' || reason === 'order' || reason === 'foul' ? reason : null);
  state.foulHint = reason === 'timeout' ? '犯规 · 超时' : '';
  state.pocketScore = payload.pocketScore || 0;
  state.zoneBonus = payload.zoneBonus || 0;
  state.deadlineAt = Date.now() + (state.shotClockSec || 20) * 1000;
  state.aimDeadlineAt = state.deadlineAt;
  if (reason === 'nine') {
    state.aimDeadlineAt = 0;
    state.deadlineAt = 0;
  }
  if (payload.names) state.names = payload.names;
  state.lastReason = reason;
  state.lastSeat = fromSeat;
  state.guestJoined = !!(state.guestJoined || payload.guestJoined);
  state.seq += 1;
  if (reason !== 'new-game') {
    state.shotSeq = payload.shotSeq != null ? payload.shotSeq : state.seq;
  }
  await write(roomId, state);
  return { ok: true, action: 'shot', roomId: roomId, state: state };
}

async function aim(payload) {
  payload = payload || {};
  var roomId = payload.roomId;
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'aim', reason: 'missing', roomId: roomId };
  var fromSeat = payload.fromSeat;
  if (fromSeat !== 0 && fromSeat !== 1) {
    if (payload.role === 'guest') fromSeat = 1;
    else if (payload.role === 'host') fromSeat = 0;
  }
  if (fromSeat !== 0 && fromSeat !== 1) {
    return { ok: false, action: 'aim', reason: 'bad-seat', roomId: roomId };
  }
  if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
    return { ok: false, action: 'aim', reason: 'bad-token', roomId: roomId };
  }
  applyDueTimeout(state);
  stampTurn(state);
  if (payload.openId && state.turnOpenId && payload.openId !== state.turnOpenId) {
    return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: state };
  }
  if (!state.matchOver && state.turn !== fromSeat) {
    return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: state };
  }
  if (payload.kind !== 'firing' && !aimingPhase(state.phase) && state.phase !== 'Shot') {
    return { ok: false, action: 'aim', reason: 'bad-phase', roomId: roomId, state: state };
  }
  var incoming = payload.aimSeq != null ? payload.aimSeq : (state.aimSeq || 0) + 1;
  if (state.aimSeq != null && incoming < state.aimSeq) {
    return { ok: false, action: 'aim', reason: 'stale-aim', roomId: roomId, state: state };
  }
  var ang = payload.aimAngle != null ? payload.aimAngle : payload.angle;
  state.aimSeq = incoming;
  state.aim = {
    aimSeq: incoming,
    shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq,
    fromSeat: fromSeat,
    kind: payload.kind || 'aim',
    aimAngle: ang,
    angle: ang,
    power: payload.power || 0,
    aimLine: payload.aimLine || [],
    preview: payload.preview || null,
    aiming: true,
    updatedAt: Date.now()
  };
  if (payload.kind === 'firing') state.phase = 'Shot';
  else if (state.phase !== 'Settle') {
    state.phase = (payload.kind === 'charging' || payload.kind === 'Pull' || (payload.power || 0) > 0.03) ? 'Pull' : 'Aim';
  }
  state.seq += 1;
  await write(roomId, state);
  var out = clone(state);
  out.balls = cueOnly(out.balls);
  out.ballsSnapshot = cueOnly(out.ballsSnapshot);
  return { ok: true, action: 'aim', roomId: roomId, state: out };
}

async function stateOf(payload) {
  var roomId = payload && typeof payload === 'object' ? payload.roomId : payload;
  var sinceSeq = payload && typeof payload === 'object' ? payload.sinceSeq : null;
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'state', reason: 'missing', roomId: roomId };
  applyDueTimeout(state);
  stampTurn(state);
  await write(roomId, state);
  var snap = clone(state);
  snap.deadlineAt = snap.deadlineAt || snap.aimDeadlineAt;
  snap.nicknames = snap.nicknames || { host: (snap.names && snap.names[0]) || '房主', guest: (snap.names && snap.names[1]) || '好友' };
  if (sinceSeq != null) sinceSeq = parseInt(sinceSeq, 10);
  if (aimingPhase(snap.phase) && sinceSeq === sinceSeq && sinceSeq >= (snap.shotSeq || 0)) {
    snap.balls = cueOnly(snap.balls);
    snap.ballsSnapshot = cueOnly(snap.ballsSnapshot);
    snap.slim = true;
  }
  return { ok: true, action: 'state', roomId: roomId, state: snap };
}

exports.main = async function (event) {
  event = event || {};
  var action = event.action;
  if (action === 'create') return create(event);
  if (action === 'join') return join(event);
  if (action === 'aim') return aim(event);
  if (action === 'shot') return shot(event);
  if (action === 'state') return stateOf(event);
  return { ok: false, reason: 'unknown-action', action: action };
};
