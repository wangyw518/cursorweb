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
      aimSeq: 0,
      aim: null,
      aimDeadlineAt: 0
    };
  }

  function nextTurn(fromSeat, reason) {
    if (reason === 'legal' || reason === 'nine' || reason === 'sync') return fromSeat;
    if (reason === 'new-game') return 0;
    return fromSeat === 0 ? 1 : 0;
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
      rooms[roomId] = state;
      return clone(state);
    }

    function create(payload) {
      payload = payload || {};
      var roomId = payload.roomId || randomId();
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
      if (payload.hostName || payload.name) {
        state.names[0] = String(payload.hostName || payload.name);
      }
      write(roomId, state);
      return {
        ok: true,
        action: 'create',
        roomId: roomId,
        role: 'host',
        seat: 0,
        token: tokenFor(roomId, 0),
        state: clone(state)
      };
    }

    function join(roomIdOrPayload) {
      var roomId = roomIdOrPayload;
      var guestName = null;
      if (roomIdOrPayload && typeof roomIdOrPayload === 'object') {
        roomId = roomIdOrPayload.roomId;
        guestName = roomIdOrPayload.name || roomIdOrPayload.guestName || null;
      }
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'join', reason: 'missing', roomId: roomId };
      state.guestJoined = true;
      if (guestName) state.names[1] = String(guestName);
      state.seq += 1;
      write(roomId, state);
      return {
        ok: true,
        action: 'join',
        roomId: roomId,
        role: 'guest',
        seat: 1,
        token: tokenFor(roomId, 1),
        state: clone(state)
      };
    }

    function shot(roomId, payload) {
      payload = payload || {};
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'shot', reason: 'missing', roomId: roomId };
      var fromSeat = payload.fromSeat;
      if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
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
      if (payload.shotSeq != null && state.shotSeq != null && payload.shotSeq <= state.shotSeq && reason !== 'new-game') {
        return { ok: false, action: 'shot', reason: 'stale-seq', roomId: roomId, state: clone(state) };
      }
      var snap = payload.ballsSnapshot || payload.balls;
      if (snap) {
        state.balls = clone(snap);
        state.ballsSnapshot = clone(snap);
      }
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.phase) state.phase = payload.phase;
      if (payload.targetN != null) state.targetN = payload.targetN;
      state.turn = nextTurn(fromSeat, reason);
      state.turnRole = roleOfSeat(state.turn);
      state.matchOver = reason === 'nine';
      state.winner = reason === 'nine' ? fromSeat : (reason === 'new-game' ? null : state.winner);
      if (reason === 'new-game') {
        state.matchOver = false;
        state.winner = null;
        state.scores = payload.scores ? payload.scores.slice() : [0, 0];
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
      if (payload.names) state.names = payload.names.slice();
      state.lastReason = reason;
      state.lastSeat = fromSeat;
      state.lastRole = roleOfSeat(fromSeat);
      state.lastShot = {
        shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq + 1,
        aimAngle: payload.aimAngle,
        power: payload.power,
        spin: payload.spin,
        events: payload.events ? clone(payload.events) : []
      };
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
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'aim', reason: 'missing', roomId: roomId };
      var fromSeat = payload.fromSeat;
      if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
      if (fromSeat !== 0 && fromSeat !== 1) {
        return { ok: false, action: 'aim', reason: 'bad-seat', roomId: roomId };
      }
      if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
        return { ok: false, action: 'aim', reason: 'bad-token', roomId: roomId };
      }
      if (!state.matchOver && state.turn !== fromSeat) {
        return { ok: false, action: 'aim', reason: 'not-your-turn', roomId: roomId, state: clone(state) };
      }
      var incoming = payload.aimSeq != null ? payload.aimSeq : (state.aimSeq || 0) + 1;
      if (state.aimSeq != null && incoming < state.aimSeq) {
        return { ok: false, action: 'aim', reason: 'stale-aim', roomId: roomId, state: clone(state) };
      }
      state.aimSeq = incoming;
      state.aim = {
        aimSeq: incoming,
        fromSeat: fromSeat,
        kind: payload.kind || 'aim',
        aimAngle: payload.aimAngle,
        power: payload.power || 0,
        ax: payload.ax,
        ay: payload.ay,
        preview: payload.preview || null,
        deadlineAt: payload.deadlineAt || state.aimDeadlineAt || 0
      };
      if (payload.deadlineAt) state.aimDeadlineAt = payload.deadlineAt;
      if (payload.kind === 'firing') state.phase = 'Shot';
      else if (state.phase !== 'Settle') state.phase = 'Aim';
      if (payload.names) state.names = payload.names.slice();
      state.seq += 1;
      write(roomId, state);
      return { ok: true, action: 'aim', roomId: roomId, state: clone(state) };
    }

    function stateOf(roomId) {
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'state', reason: 'missing', roomId: roomId };
      return { ok: true, action: 'state', roomId: roomId, state: clone(state) };
    }

    function dispatch(action, payload) {
      payload = payload || {};
      if (action === 'create') return create(payload);
      if (action === 'join') return join(payload);
      if (action === 'aim') return aim(payload.roomId, payload);
      if (action === 'shot') return shot(payload.roomId, payload);
      if (action === 'state') return stateOf(payload.roomId);
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
      for (i = 0; i < keys.length; i++) rooms[keys[i]] = clone(map[keys[i]]);
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
      randomId: randomId
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
    reasonFromEvents: reasonFromEvents
  };
});
