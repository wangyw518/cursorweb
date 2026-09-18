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

  function emptyState(roomId) {
    return {
      roomId: roomId,
      hostSeat: 0,
      guestJoined: false,
      turn: 0,
      seq: 0,
      balls: null,
      phase: 'Aim',
      scores: [0, 0],
      winner: null,
      targetN: 1,
      matchOver: false,
      lastReason: null,
      lastSeat: null
    };
  }

  function nextTurn(fromSeat, reason) {
    if (reason === 'legal' || reason === 'nine' || reason === 'sync') return fromSeat;
    if (reason === 'new-game') return 0;
    return fromSeat === 0 ? 1 : 0;
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
      if (payload.balls) state.balls = clone(payload.balls);
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.targetN != null) state.targetN = payload.targetN;
      write(roomId, state);
      return {
        ok: true,
        action: 'create',
        roomId: roomId,
        seat: 0,
        token: tokenFor(roomId, 0),
        state: clone(state)
      };
    }

    function join(roomId) {
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'join', reason: 'missing', roomId: roomId };
      state.guestJoined = true;
      state.seq += 1;
      write(roomId, state);
      return {
        ok: true,
        action: 'join',
        roomId: roomId,
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
      if (fromSeat !== 0 && fromSeat !== 1) {
        return { ok: false, action: 'shot', reason: 'bad-seat', roomId: roomId };
      }
      if (payload.token && payload.token !== tokenFor(roomId, fromSeat)) {
        return { ok: false, action: 'shot', reason: 'bad-token', roomId: roomId };
      }
      var reason = payload.reason || 'miss';
      if (reason !== 'new-game' && !state.matchOver && state.turn !== fromSeat) {
        return { ok: false, action: 'shot', reason: 'not-your-turn', roomId: roomId, state: clone(state) };
      }
      if (payload.balls) state.balls = clone(payload.balls);
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.phase) state.phase = payload.phase;
      if (payload.targetN != null) state.targetN = payload.targetN;
      state.turn = nextTurn(fromSeat, reason);
      state.matchOver = reason === 'nine';
      state.winner = reason === 'nine' ? fromSeat : (reason === 'new-game' ? null : state.winner);
      if (reason === 'new-game') {
        state.matchOver = false;
        state.winner = null;
        state.scores = payload.scores ? payload.scores.slice() : [0, 0];
        state.phase = 'Aim';
        state.targetN = payload.targetN != null ? payload.targetN : 1;
      }
      if (reason === 'nine') state.phase = payload.phase || 'Settle';
      state.lastReason = reason;
      state.lastSeat = fromSeat;
      state.guestJoined = !!(state.guestJoined || payload.guestJoined);
      state.seq += 1;
      write(roomId, state);
      return { ok: true, action: 'shot', roomId: roomId, state: clone(state) };
    }

    function stateOf(roomId) {
      var state = rooms[roomId];
      if (!state) return { ok: false, action: 'state', reason: 'missing', roomId: roomId };
      return { ok: true, action: 'state', roomId: roomId, state: clone(state) };
    }

    function dispatch(action, payload) {
      payload = payload || {};
      if (action === 'create') return create(payload);
      if (action === 'join') return join(payload.roomId);
      if (action === 'shot') return shot(payload.roomId, payload);
      if (action === 'state') return stateOf(payload.roomId);
      return { ok: false, reason: 'unknown-action', action: action };
    }

    function reset() {
      rooms = {};
    }

    return {
      create: create,
      join: join,
      shot: shot,
      state: stateOf,
      dispatch: dispatch,
      reset: reset,
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
    emptyState: emptyState
  };
});
