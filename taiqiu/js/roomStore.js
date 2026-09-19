/**
 * Shared 2P room API: create / join / shot / state.
 * Used by the in-memory client, the HTTP room server, and the cloud function.
 *
 * Turn rules (server-authoritative):
 *   legal pocket of 1–8 → same seat continues
 *   miss / foul          → switch seat
 *   legal 9              → match over, that seat wins
 *   new-game             → full rack, turn 0
 * Miss never reracks; the posted ball snapshot is stored as-is.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuRoomStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  function normalizeRoomId(id) {
    if (id == null) return '';
    return String(id).trim().toUpperCase();
  }

  function shareFor(roomId) {
    var id = normalizeRoomId(roomId);
    return {
      query: 'roomId=' + id,
      path: '?roomId=' + id
    };
  }

  function tokenFor(roomId, seat) {
    return roomId + (seat === 0 ? ':h' : ':g');
  }

  function roleOfSeat(seat) {
    return seat === 1 ? 'guest' : 'host';
  }

  function seatOfRole(role, fallback) {
    if (role === 'guest' || role === 1) return 1;
    if (role === 'host' || role === 0) return 0;
    return fallback;
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
      lastRole: null,
      lastShot: null,
      names: ['房主', '好友'],
      nicknames: { host: '房主', guest: '好友' },
      openIds: ['', ''],
      hostOpenId: '',
      guestOpenId: null,
      turnOpenId: '',
      aimSeq: 0,
      aim: null,
      aimDeadlineAt: 0,
      deadlineAt: 0,
      shotClockSec: 20,
      winnerOpenId: null,
      stars: { host: 0, guest: 0 },
      foulCode: null,
      foulHint: '',
      pocketScore: 0,
      zoneBonus: 0
    };
  }

  function stampTurn(state) {
    if (!state) return state;
    state.turnRole = roleOfSeat(state.turn);
    if (state.turn === 1) {
      state.turnOpenId = state.guestOpenId || (state.openIds && state.openIds[1]) || '';
    } else {
      state.turnOpenId = state.hostOpenId || (state.openIds && state.openIds[0]) || '';
    }
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

  function clipNick(raw) {
    var s = String(raw || '').replace(/^\s+|\s+$/g, '');
    if (s.length > 32) s = s.slice(0, 32);
    return s;
  }

  function numOr(value, fallback) {
    if (value == null || value === '') return fallback || 0;
    var n = Number(value);
    return n === n ? n : (fallback || 0);
  }

  function ensureEconomy(state) {
    if (!state.scores) state.scores = [0, 0];
    if (!state.stars) state.stars = { host: 0, guest: 0 };
    if (state.stars.host == null) state.stars.host = state.scores[0] || 0;
    if (state.stars.guest == null) state.stars.guest = state.scores[1] || 0;
    return state;
  }

  function syncEconomy(state) {
    ensureEconomy(state);
    state.stars.host = Math.max(state.stars.host || 0, state.scores[0] || 0);
    state.stars.guest = Math.max(state.stars.guest || 0, state.scores[1] || 0);
    state.scores[0] = state.stars.host;
    state.scores[1] = state.stars.guest;
    return state;
  }

  /**
   * Host/guest 星币独立累计。legal/nine 把本杆 pocketScore+zoneBonus 加到击球方。
   * 不整表覆盖对方分数。32 = 进袋 24 + 新星落点 8，只是单杆，不是局分常量。
   */
  function applyShotEconomy(state, payload, fromSeat, reason) {
    payload = payload || {};
    ensureEconomy(state);
    if (reason === 'new-game') {
      state.scores = [0, 0];
      state.stars = { host: 0, guest: 0 };
      state.pocketScore = 0;
      state.zoneBonus = 0;
      return state;
    }
    var pocket = payload.pocketScore != null ? numOr(payload.pocketScore, 0)
      : numOr(payload.pocketBonus, 0);
    var zone = payload.zoneBonus != null ? numOr(payload.zoneBonus, 0)
      : numOr(payload.landingBonus, 0);
    state.pocketScore = pocket;
    state.zoneBonus = zone;
    var delta = (reason === 'legal' || reason === 'nine') ? (pocket + zone) : 0;
    if (delta > 0 && (fromSeat === 0 || fromSeat === 1)) {
      state.scores[fromSeat] = (state.scores[fromSeat] || 0) + delta;
    } else if (delta <= 0 && payload.scores && (fromSeat === 0 || fromSeat === 1)) {
      var claimed = numOr(payload.scores[fromSeat], 0);
      if (claimed > (state.scores[fromSeat] || 0)) state.scores[fromSeat] = claimed;
    }
    return syncEconomy(state);
  }

  function nextTurn(fromSeat, reason) {
    if (reason === 'legal' || reason === 'nine' || reason === 'sync' || reason === 'rolling' || reason === 'fire') {
      return fromSeat;
    }
    if (reason === 'new-game') return 0;
    return fromSeat === 0 ? 1 : 0;
  }

  function isRollingStart(payload, reason) {
    if (!payload) return false;
    if (payload.phase === 'rolling' || payload.phase === 'Rolling') return true;
    return reason === 'rolling' || reason === 'fire';
  }

  function impulseOf(payload) {
    payload = payload || {};
    var ang = payload.angle != null ? payload.angle : payload.aimAngle;
    return {
      angle: ang,
      aimAngle: payload.aimAngle != null ? payload.aimAngle : ang,
      power: payload.power,
      spin: payload.spin || 0
    };
  }

  function reasonFromEvents(events, fallback) {
    if (fallback) return fallback;
    events = events || [];
    var i;
    for (i = 0; i < events.length; i++) {
      var e = events[i] || {};
      var t = e.type || e.kind;
      if (t === 'nine' || (t === 'pocket' && (e.n === 9 || e.ball === 9) && e.legal !== false)) {
        return 'nine';
      }
      if (t === 'scratch') return 'scratch';
      if (t === 'foul' || e.foul) return e.reason || 'foul';
      if (t === 'legal' || (t === 'pocket' && e.legal !== false)) return 'legal';
      if (t === 'timeout') return 'timeout';
      if (t === 'miss') return 'miss';
      if (t === 'new-game') return 'new-game';
    }
    return 'miss';
  }

  function createStore() {
    var rooms = {};

    function write(roomId, state) {
      rooms[normalizeRoomId(roomId) || roomId] = state;
      return clone(state);
    }

    function load(roomId) {
      return rooms[normalizeRoomId(roomId)];
    }

    function create(payload) {
      payload = payload || {};
      var roomId = normalizeRoomId(payload.roomId) || randomId();
      if (rooms[roomId]) roomId = randomId();
      var state = emptyState(roomId);
      var opening = payload.ballsSnapshot || payload.balls;
      if (opening) {
        state.balls = clone(opening);
        state.ballsSnapshot = clone(opening);
      }
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.targetN != null) state.targetN = payload.targetN;
      if (payload.names) state.names = payload.names.slice();
      if (payload.hostName || payload.name || payload.nick || payload.displayName) {
        state.names[0] = clipNick(payload.hostName || payload.name || payload.nick || payload.displayName);
      }
      if (payload.shotClockSec > 0) state.shotClockSec = payload.shotClockSec;
      var hostId = payload.openId || payload.openid || '';
      if (hostId) state.openIds[0] = String(hostId);
      state.hostOpenId = state.openIds[0] || ('host:' + roomId);
      state.openIds[0] = state.hostOpenId;
      state.guestOpenId = null;
      state.nicknames = { host: state.names[0], guest: state.names[1] };
      stampTurn(state);
      state.deadlineAt = Date.now() + (state.shotClockSec || 20) * 1000;
      state.aimDeadlineAt = state.deadlineAt;
      write(roomId, state);
      return {
        ok: true,
        action: 'create',
        roomId: roomId,
        role: 'host',
        seat: 0,
        token: tokenFor(roomId, 0),
        share: shareFor(roomId),
        state: clone(state)
      };
    }

    function join(roomIdOrPayload) {
      var payload = {};
      var roomId;
      if (typeof roomIdOrPayload === 'string') {
        roomId = roomIdOrPayload;
        payload = { roomId: roomId };
      } else {
        payload = roomIdOrPayload || {};
        roomId = payload.roomId || payload.room || payload.roomid || payload.room_id || payload.id;
      }
      roomId = normalizeRoomId(roomId);
      if (!roomId) return { ok: false, action: 'join', reason: 'missing', roomId: '' };
      var state = load(roomId);
      if (!state) return { ok: false, action: 'join', reason: 'missing', roomId: roomId };
      if (state.matchOver) {
        return { ok: false, action: 'join', reason: 'ended', roomId: roomId, state: clone(state) };
      }
      var incomingId = payload.openId || payload.openid || payload.guestOpenId || '';
      if (incomingId) incomingId = String(incomingId);
      var hostId = state.hostOpenId || (state.openIds && state.openIds[0]) || '';
      var guestId = state.guestOpenId || (state.openIds && state.openIds[1]) || '';
      if (incomingId && hostId && incomingId === hostId) {
        var hostNick = clipNick(payload.nick || payload.displayName || payload.name || payload.hostName);
        if (hostNick) state.names[0] = hostNick;
        state.hostOpenId = hostId;
        state.openIds[0] = hostId;
        state.nicknames = { host: state.names[0], guest: state.names[1] };
        stampTurn(state);
        write(roomId, state);
        return {
          ok: true,
          action: 'join',
          roomId: roomId,
          role: 'host',
          seat: 0,
          token: tokenFor(roomId, 0),
          share: shareFor(roomId),
          state: clone(state)
        };
      }
      if (state.guestJoined) {
        var sameGuest = !incomingId || !guestId || incomingId === guestId;
        if (!sameGuest) {
          return { ok: false, action: 'join', reason: 'full', roomId: roomId, state: clone(state) };
        }
      }
      var firstGuest = !state.guestJoined;
      state.guestJoined = true;
      var guestName = payload.name || payload.guestName || payload.nick || payload.displayName;
      if (guestName) state.names[1] = clipNick(guestName);
      if (incomingId) {
        state.openIds[1] = incomingId;
        state.guestOpenId = incomingId;
      } else if (!state.guestOpenId) {
        state.guestOpenId = guestId || ('guest:' + roomId);
        state.openIds[1] = state.guestOpenId;
      }
      state.nicknames = { host: state.names[0], guest: state.names[1] };
      stampTurn(state);
      if (firstGuest) state.seq += 1;
      write(roomId, state);
      return {
        ok: true,
        action: 'join',
        roomId: roomId,
        role: 'guest',
        seat: 1,
        token: tokenFor(roomId, 1),
        share: shareFor(roomId),
        state: clone(state)
      };
    }

    function shot(roomId, payload) {
      payload = payload || {};
      roomId = normalizeRoomId(roomId || payload.roomId);
      var state = load(roomId);
      if (!state) return { ok: false, action: 'shot', reason: 'missing', roomId: roomId };
      var fromSeat = payload.fromSeat;
      if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
      if (fromSeat !== 0 && fromSeat !== 1) {
        var shotOpenId = payload.openId || payload.openid || '';
        if (shotOpenId && state.hostOpenId && shotOpenId === state.hostOpenId) fromSeat = 0;
        else if (shotOpenId && state.guestOpenId && shotOpenId === state.guestOpenId) fromSeat = 1;
        else if (shotOpenId && state.openIds && shotOpenId === state.openIds[0]) fromSeat = 0;
        else if (shotOpenId && state.openIds && shotOpenId === state.openIds[1]) fromSeat = 1;
      }
      if (fromSeat !== 0 && fromSeat !== 1) {
        return { ok: false, action: 'shot', reason: 'bad-seat', roomId: roomId };
      }
      var reason = reasonFromEvents(payload.events, payload.reason);
      if (reason === 'timeout') {
        var due = state.aimDeadlineAt;
        if (!due || Date.now() + 250 < due) {
          return { ok: false, action: 'shot', reason: 'too-early', roomId: roomId, state: clone(state) };
        }
        if (payload.token && payload.token !== tokenFor(roomId, 0) && payload.token !== tokenFor(roomId, 1)) {
          return { ok: false, action: 'shot', reason: 'bad-token', roomId: roomId };
        }
        fromSeat = state.turn;
      } else {
        if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
          return { ok: false, action: 'shot', reason: 'bad-token', roomId: roomId };
        }
        if (reason !== 'new-game' && !state.matchOver && state.turn !== fromSeat) {
          return { ok: false, action: 'shot', reason: 'not-your-turn', roomId: roomId, state: clone(state) };
        }
      }
      var sameRolling = (state.phase === 'rolling' || state.phase === 'Shot') &&
        payload.shotSeq != null && payload.shotSeq === state.shotSeq;
      if (payload.shotSeq != null && state.shotSeq != null && payload.shotSeq <= state.shotSeq &&
          reason !== 'new-game' && !sameRolling) {
        return { ok: false, action: 'shot', reason: 'stale-seq', roomId: roomId, state: clone(state) };
      }
      if (isRollingStart(payload, reason) && !sameRolling) {
        var rolling = impulseOf(payload);
        var rollSeq = payload.shotSeq != null ? payload.shotSeq : (state.shotSeq || 0) + 1;
        state.phase = 'rolling';
        state.angle = rolling.angle;
        state.aimAngle = rolling.aimAngle;
        state.power = rolling.power;
        state.spin = rolling.spin;
        state.lastShot = {
          shotSeq: rollSeq,
          angle: rolling.angle,
          aimAngle: rolling.aimAngle,
          power: rolling.power,
          spin: rolling.spin,
          events: []
        };
        state.aim = {
          kind: 'firing',
          aimAngle: rolling.aimAngle,
          angle: rolling.angle,
          power: rolling.power || 0,
          spin: rolling.spin,
          fromSeat: fromSeat,
          shotSeq: rollSeq,
          aimSeq: state.aimSeq || 0,
          updatedAt: Date.now()
        };
        state.lastReason = 'rolling';
        state.lastSeat = fromSeat;
        state.lastRole = roleOfSeat(fromSeat);
        state.shotSeq = rollSeq;
        state.seq += 1;
        write(roomId, state);
        return { ok: true, action: 'shot', roomId: roomId, state: clone(state) };
      }
      var snap = payload.ballsSnapshot || payload.balls;
      if (snap) {
        state.balls = clone(snap);
        state.ballsSnapshot = clone(snap);
      }
      if (payload.phase) state.phase = payload.phase;
      if (payload.targetN != null) state.targetN = payload.targetN;
      applyShotEconomy(state, payload, fromSeat, reason);
      state.turn = nextTurn(fromSeat, reason);
      stampTurn(state);
      state.matchOver = reason === 'nine';
      state.winner = reason === 'nine' ? fromSeat : (reason === 'new-game' ? null : state.winner);
      if (reason === 'new-game') {
        state.matchOver = false;
        state.winner = null;
        state.phase = 'Aim';
        state.targetN = payload.targetN != null ? payload.targetN : 1;
        state.shotSeq = 0;
        state.turn = 0;
        stampTurn(state);
      }
      if (reason === 'nine') {
        state.phase = payload.phase || 'Settle';
        state.winnerOpenId = (state.openIds && state.openIds[fromSeat]) || payload.winnerOpenId || null;
        syncEconomy(state);
      } else if (reason !== 'new-game' && !isRollingStart(payload, reason)) {
        if (!payload.phase || payload.phase === 'rolling' || payload.phase === 'Shot') {
          state.phase = 'Aim';
        }
      }
      state.aim = null;
      state.foulCode = reason === 'timeout' ? 'shotClock' : (reason === 'scratch' || reason === 'whiff' || reason === 'order' || reason === 'foul' ? reason : null);
      state.foulHint = reason === 'timeout' ? '犯规 · 超时' : (payload.foulHint || '');
      state.aimDeadlineAt = Date.now() + (state.shotClockSec || 20) * 1000;
      state.deadlineAt = state.aimDeadlineAt;
      if (reason === 'nine') {
        state.aimDeadlineAt = 0;
        state.deadlineAt = 0;
      }
      if (payload.names) state.names = payload.names.slice();
      state.lastReason = reason;
      state.lastSeat = fromSeat;
      state.lastRole = roleOfSeat(fromSeat);
      var settled = impulseOf(payload);
      state.angle = settled.angle;
      state.aimAngle = settled.aimAngle;
      state.power = settled.power;
      state.spin = settled.spin;
      state.lastShot = {
        shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq + 1,
        angle: settled.angle,
        aimAngle: settled.aimAngle,
        power: settled.power,
        spin: settled.spin,
        ax: payload.ax,
        ay: payload.ay,
        events: payload.events ? clone(payload.events) : []
      };
      if (payload.ax != null || payload.ay != null || settled.angle != null) {
        state.impulse = {
          shotSeq: state.lastShot.shotSeq,
          angle: settled.angle,
          power: settled.power,
          spin: settled.spin,
          ax: payload.ax != null ? payload.ax : (settled.angle != null ? Math.cos(settled.angle) : 0),
          ay: payload.ay != null ? payload.ay : (settled.angle != null ? Math.sin(settled.angle) : 0)
        };
      }
      state.guestJoined = !!(state.guestJoined || payload.guestJoined);
      state.seq += 1;
      if (reason !== 'new-game') {
        state.shotSeq = payload.shotSeq != null ? payload.shotSeq : state.seq;
      }
      write(roomId, state);
      return { ok: true, action: 'shot', roomId: roomId, state: clone(state) };
    }

    function aim(roomId, payload) {
      payload = payload || {};
      roomId = normalizeRoomId(roomId || payload.roomId);
      var state = load(roomId);
      if (!state) return { ok: false, action: 'aim', reason: 'missing', roomId: roomId };
      var fromSeat = payload.fromSeat;
      if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
      if (fromSeat !== 0 && fromSeat !== 1) {
        var aimOpenId = payload.openId || payload.openid || '';
        if (aimOpenId && state.hostOpenId && aimOpenId === state.hostOpenId) fromSeat = 0;
        else if (aimOpenId && state.guestOpenId && aimOpenId === state.guestOpenId) fromSeat = 1;
        else if (aimOpenId && state.openIds && aimOpenId === state.openIds[0]) fromSeat = 0;
        else if (aimOpenId && state.openIds && aimOpenId === state.openIds[1]) fromSeat = 1;
      }
      if (fromSeat !== 0 && fromSeat !== 1) {
        return { ok: false, action: 'aim', reason: 'bad-seat', roomId: roomId };
      }
      if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
        return { ok: false, action: 'aim', reason: 'bad-token', roomId: roomId };
      }
      if (payload.kind === 'name') {
        var nick = clipNick(payload.nick || payload.displayName || payload.name);
        if (nick) {
          state.names = state.names || ['', ''];
          state.names[fromSeat] = nick;
          state.nicknames = {
            host: fromSeat === 0 ? nick : (state.nicknames && state.nicknames.host) || state.names[0],
            guest: fromSeat === 1 ? nick : (state.nicknames && state.nicknames.guest) || state.names[1]
          };
        }
        write(roomId, state);
        return { ok: true, action: 'aim', roomId: roomId, state: clone(state) };
      }
      applyDueTimeout(state);
      stampTurn(state);
      if (payload.openId && state.turnOpenId && payload.openId !== state.turnOpenId) {
        return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: clone(state) };
      }
      if (!state.matchOver && state.turn !== fromSeat) {
        return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: clone(state) };
      }
      if (payload.kind !== 'firing' && !aimingPhase(state.phase) && state.phase !== 'Shot') {
        return { ok: false, action: 'aim', reason: 'bad-phase', roomId: roomId, state: clone(state) };
      }
      var incoming = payload.aimSeq != null ? payload.aimSeq : (state.aimSeq || 0) + 1;
      if (state.aimSeq != null && incoming < state.aimSeq) {
        return { ok: false, action: 'aim', reason: 'stale-aim', roomId: roomId, state: clone(state) };
      }
      state.aimSeq = incoming;
      var ang = payload.aimAngle != null ? payload.aimAngle : payload.angle;
      state.aim = {
        aimSeq: incoming,
        shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq,
        fromSeat: fromSeat,
        kind: payload.kind || (payload.power > 0.03 ? 'Pull' : 'aim'),
        aimAngle: ang,
        angle: ang,
        power: payload.power || 0,
        ax: payload.ax,
        ay: payload.ay,
        preview: payload.preview || null,
        aimLine: payload.aimLine || (payload.preview && payload.preview.points) || [],
        aiming: payload.aiming !== false,
        updatedAt: Date.now()
      };
      if (payload.kind === 'firing') {
        state.phase = 'Shot';
        state.impulse = {
          shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq,
          angle: ang,
          aimAngle: ang,
          power: payload.power || 0,
          spin: payload.spin || 0,
          ax: payload.ax,
          ay: payload.ay
        };
      }
      else if (state.phase !== 'Settle') {
        state.phase = (payload.kind === 'charging' || payload.kind === 'Pull' || (payload.power || 0) > 0.03)
          ? 'Pull'
          : 'Aim';
      }
      if (payload.names) state.names = payload.names.slice();
      if (payload.nicknames) state.nicknames = payload.nicknames;
      state.seq += 1;
      write(roomId, state);
      var out = clone(state);
      out.balls = cueOnly(out.balls);
      out.ballsSnapshot = cueOnly(out.ballsSnapshot);
      return { ok: true, action: 'aim', roomId: roomId, state: out };
    }

    function applyDueTimeout(state) {
      if (!state || state.matchOver || state.phase === 'Settle') return state;
      var due = state.deadlineAt || state.aimDeadlineAt;
      if (!due || Date.now() < due) return state;
      if (!aimingPhase(state.phase)) return state;
      var from = state.turn;
      state.turn = from === 0 ? 1 : 0;
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

    function stateOf(roomId, opts) {
      opts = opts || {};
      roomId = normalizeRoomId(roomId);
      var state = load(roomId);
      if (!state) return { ok: false, action: 'state', reason: 'missing', roomId: roomId };
      applyDueTimeout(state);
      stampTurn(state);
      write(roomId, state);
      var snap = clone(state);
      snap.deadlineAt = snap.deadlineAt || snap.aimDeadlineAt;
      snap.nicknames = snap.nicknames || { host: (snap.names && snap.names[0]) || '房主', guest: (snap.names && snap.names[1]) || '好友' };
      snap.turnOpenId = snap.turnOpenId || '';
      var sinceSeq = opts.sinceSeq != null ? opts.sinceSeq : opts.since;
      if (sinceSeq != null) sinceSeq = parseInt(sinceSeq, 10);
      if (aimingPhase(snap.phase) && sinceSeq === sinceSeq && sinceSeq >= (snap.shotSeq || 0)) {
        snap.balls = cueOnly(snap.balls);
        snap.ballsSnapshot = cueOnly(snap.ballsSnapshot);
        snap.slim = true;
      }
      return { ok: true, action: 'state', roomId: roomId, state: snap };
    }

    function dispatch(action, payload) {
      payload = payload || {};
      if (action === 'create') return create(payload);
      if (action === 'join') return join(payload);
      if (action === 'aim') return aim(payload.roomId, payload);
      if (action === 'shot') return shot(payload.roomId, payload);
      if (action === 'state') return stateOf(payload.roomId, payload);
      return { ok: false, reason: 'unknown-action', action: action };
    }

    function reset() {
      rooms = {};
    }

    function dump() {
      return clone(rooms);
    }

    function hydrate(map) {
      rooms = {};
      if (!map) return;
      var keys = Object.keys(map);
      var i;
      for (i = 0; i < keys.length; i++) {
        rooms[normalizeRoomId(keys[i]) || keys[i]] = clone(map[keys[i]]);
      }
    }

    return {
      create: create,
      join: join,
      aim: aim,
      shot: shot,
      state: stateOf,
      dispatch: dispatch,
      reset: reset,
      dump: dump,
      hydrate: hydrate,
      tokenFor: tokenFor,
      nextTurn: nextTurn,
      randomId: randomId,
      normalizeRoomId: normalizeRoomId,
      shareFor: shareFor,
      applyShotEconomy: applyShotEconomy
    };
  }

  return {
    createStore: createStore,
    randomId: randomId,
    tokenFor: tokenFor,
    nextTurn: nextTurn,
    emptyState: emptyState,
    roleOfSeat: roleOfSeat,
    seatOfRole: seatOfRole,
    reasonFromEvents: reasonFromEvents,
    normalizeRoomId: normalizeRoomId,
    shareFor: shareFor,
    applyShotEconomy: applyShotEconomy
  };
});
