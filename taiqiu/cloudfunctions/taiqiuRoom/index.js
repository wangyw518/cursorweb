/**
 * WeChat cloud function `taiqiuRoom`.
 * event.action = create | join | aim | shot | state
 * Persists to collection `taiqiu_rooms` when cloud DB is available.
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

function nextTurn(fromSeat, reason) {
  if (reason === 'legal' || reason === 'nine' || reason === 'sync') return fromSeat;
  if (reason === 'new-game') return 0;
  return fromSeat === 0 ? 1 : 0;
}

function emptyState(roomId) {
  return {
    roomId: roomId,
    hostSeat: 0,
    guestJoined: false,
    turn: 0,
    turnRole: 'host',
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
    aimSeq: 0,
    aim: null,
    aimDeadlineAt: 0
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

async function create(payload) {
  payload = payload || {};
  var roomId = payload.roomId || randomId();
  var state = emptyState(roomId);
  if (payload.balls) state.balls = payload.balls;
  if (payload.scores) state.scores = payload.scores;
  if (payload.targetN != null) state.targetN = payload.targetN;
  if (payload.names) state.names = payload.names;
  if (payload.hostName || payload.name) state.names[0] = String(payload.hostName || payload.name);
  await write(roomId, state);
  return { ok: true, action: 'create', roomId: roomId, role: 'host', seat: 0, token: tokenFor(roomId, 0), state: state };
}

async function join(roomIdOrPayload) {
  var roomId = roomIdOrPayload;
  var guestName = null;
  if (roomIdOrPayload && typeof roomIdOrPayload === 'object') {
    roomId = roomIdOrPayload.roomId;
    guestName = roomIdOrPayload.name || roomIdOrPayload.guestName;
  }
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'join', reason: 'missing', roomId: roomId };
  state.guestJoined = true;
  if (guestName) {
    state.names = state.names || ['房主', '好友'];
    state.names[1] = String(guestName);
  }
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
    var due = state.aimDeadlineAt;
    if (!due || Date.now() + 250 < due) {
      return { ok: false, action: 'shot', reason: 'too-early', roomId: roomId, state: state };
    }
    if (payload.token && payload.token !== tokenFor(roomId, 0) && payload.token !== tokenFor(roomId, 1)) {
      return { ok: false, action: 'shot', reason: 'bad-token', roomId: roomId };
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
  state.turnRole = state.turn === 1 ? 'guest' : 'host';
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
    state.turnRole = 'host';
  }
  if (reason === 'nine') state.phase = payload.phase || 'Settle';
  state.aim = null;
  state.aimDeadlineAt = reason === 'timeout'
    ? (payload.nextDeadlineAt || (Date.now() + 25000))
    : 0;
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
  if (!state.matchOver && state.turn !== fromSeat) {
    return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: state };
  }
  var incoming = payload.aimSeq != null ? payload.aimSeq : (state.aimSeq || 0) + 1;
  if (state.aimSeq != null && incoming < state.aimSeq) {
    return { ok: false, action: 'aim', reason: 'stale-aim', roomId: roomId, state: state };
  }
  state.aimSeq = incoming;
  state.aim = {
    aimSeq: incoming,
    fromSeat: fromSeat,
    kind: payload.kind || 'aim',
    aimAngle: payload.aimAngle,
    power: payload.power || 0,
    preview: payload.preview || null,
    deadlineAt: payload.deadlineAt || state.aimDeadlineAt || 0
  };
  if (payload.deadlineAt) state.aimDeadlineAt = payload.deadlineAt;
  if (payload.kind === 'firing') state.phase = 'Shot';
  else if (state.phase !== 'Settle') state.phase = 'Aim';
  state.seq += 1;
  await write(roomId, state);
  return { ok: true, action: 'aim', roomId: roomId, state: state };
}

async function stateOf(roomId) {
  var state = await read(roomId);
  if (!state) return { ok: false, action: 'state', reason: 'missing', roomId: roomId };
  return { ok: true, action: 'state', roomId: roomId, state: state };
}

exports.main = async function (event) {
  event = event || {};
  var action = event.action;
  if (action === 'create') return create(event);
  if (action === 'join') return join(event);
  if (action === 'aim') return aim(event);
  if (action === 'shot') return shot(event);
  if (action === 'state') return stateOf(event.roomId);
  return { ok: false, reason: 'unknown-action', action: action };
};
