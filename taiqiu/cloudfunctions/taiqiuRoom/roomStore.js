/**
 * Shared 2P room API: create / join / aim / shot / state.
 * Used by the in-memory client, the HTTP room server, and the cloud function.
 *
 * Turn rules (server-authoritative):
 *   legal pocket of 1–8 → same seat continues
 *   miss / foul          → switch seat
 *   legal 9              → match over, that seat wins
 *   new-game             → full rack, turn 0
 *   shotClock timeout    → foul, switch seat, table stays (no rack)
 * Miss never reracks; the posted ball snapshot is stored as-is.
 *
 * Aim writes only `aim` (dirty, droppable). It never writes balls[].
 * Shot clock is server-authoritative (default 20s); state/aim/shot settle expiry.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuRoomStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_SHOT_CLOCK_SEC = 20;
  var FOUL_SHOT_CLOCK = 'shotClock';
  var AIM_PHASES = { Aim: true, Pull: true, aim: true, pull: true };

  var FOUL_HINTS = {
    shotClock: '超时未击球',
    scratch: '白球入袋',
    whiff: '空杆',
    order: '未先碰到目标球',
    foul: '犯规'
  };

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

  function nickOf(payload) {
    if (!payload) return '';
    if (payload.nick != null && String(payload.nick) !== '') return String(payload.nick);
    if (payload.nickname != null && String(payload.nickname) !== '') return String(payload.nickname);
    return '';
  }

  function openIdOf(payload) {
    if (!payload) return '';
    if (payload.openId) return String(payload.openId);
    if (payload.openid) return String(payload.openid);
    return '';
  }

  function hintFor(code) {
    if (!code) return null;
    return FOUL_HINTS[code] || null;
  }

  function isAimPhase(phase) {
    if (phase == null || phase === '') return true;
    return !!AIM_PHASES[phase];
  }

  function emptyState(roomId, nowMs, clockSec) {
    var shotClockSec = clockSec != null ? clockSec : DEFAULT_SHOT_CLOCK_SEC;
    return {
      roomId: roomId,
      hostSeat: 0,
      guestJoined: false,
      turn: 0,
      turnRole: 'host',
      hostOpenId: 'host:' + roomId,
      guestOpenId: null,
      turnOpenId: 'host:' + roomId,
      nicknames: { host: '', guest: '' },
      stars: { host: 0, guest: 0 },
      winnerOpenId: null,
      foulCode: null,
      foulHint: null,
      pocketScore: null,
      zoneBonus: null,
      aim: null,
      shotClockSec: shotClockSec,
      deadlineAt: nowMs + shotClockSec * 1000,
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
      lastShot: null
    };
  }

  function applyDefaults(state, nowMs, clockSec) {
    if (!state) return state;
    var fallbackClock = clockSec != null ? clockSec : DEFAULT_SHOT_CLOCK_SEC;
    if (!state.nicknames) state.nicknames = { host: '', guest: '' };
    if (state.nicknames.host == null) state.nicknames.host = '';
    if (state.nicknames.guest == null) state.nicknames.guest = '';
    if (!state.stars) state.stars = { host: 0, guest: 0 };
    if (state.stars.host == null) state.stars.host = 0;
    if (state.stars.guest == null) state.stars.guest = 0;
    if (!state.hostOpenId) state.hostOpenId = 'host:' + state.roomId;
    if (state.guestJoined && !state.guestOpenId) state.guestOpenId = 'guest:' + state.roomId;
    if (state.shotClockSec == null) state.shotClockSec = fallbackClock;
    if (state.deadlineAt == null) state.deadlineAt = nowMs + state.shotClockSec * 1000;
    if (state.winnerOpenId === undefined) state.winnerOpenId = null;
    if (state.foulCode === undefined) state.foulCode = null;
    if (state.foulHint === undefined) state.foulHint = null;
    if (state.pocketScore === undefined) state.pocketScore = null;
    if (state.zoneBonus === undefined) state.zoneBonus = null;
    if (state.aim === undefined) state.aim = null;
    state.turnOpenId = state.turn === 1 ? state.guestOpenId : state.hostOpenId;
    return state;
  }

  function refreshDeadline(state, nowMs) {
    var sec = state.shotClockSec != null ? state.shotClockSec : DEFAULT_SHOT_CLOCK_SEC;
    state.shotClockSec = sec;
    state.deadlineAt = nowMs + sec * 1000;
    return state.deadlineAt;
  }

  function openIdOfSeat(seat, state) {
    return seat === 1 ? state.guestOpenId : state.hostOpenId;
  }

  function syncTurnIdentity(state) {
    state.turnRole = roleOfSeat(state.turn);
    state.turnOpenId = openIdOfSeat(state.turn, state);
    return state;
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
      if (t === 'miss') return 'miss';
      if (t === 'new-game') return 'new-game';
      if (t === 'shotClock') return FOUL_SHOT_CLOCK;
    }
    return 'miss';
  }

  function fail(action, reason, roomId, state) {
    var out = { ok: false, action: action, reason: reason, roomId: roomId };
    if (state) out.state = clone(state);
    return out;
  }

  function ok(action, roomId, extra, state) {
    var out = { ok: true, action: action, roomId: roomId, state: clone(state) };
    if (state && state.deadlineAt != null) out.deadlineAt = state.deadlineAt;
    if (extra) {
      var keys = Object.keys(extra);
      var i;
      for (i = 0; i < keys.length; i++) out[keys[i]] = extra[keys[i]];
    }
    return out;
  }

  function applyNicknames(state, payload, seat) {
    if (!payload) return;
    if (payload.nicknames) {
      if (payload.nicknames.host != null) state.nicknames.host = String(payload.nicknames.host);
      if (payload.nicknames.guest != null) state.nicknames.guest = String(payload.nicknames.guest);
    }
    var nick = nickOf(payload);
    if (nick) {
      if (seat === 1) state.nicknames.guest = nick;
      else state.nicknames.host = nick;
    }
  }

  function applyStars(state, payload) {
    if (!payload || !payload.stars) return;
    if (payload.stars.host != null) state.stars.host = payload.stars.host;
    if (payload.stars.guest != null) state.stars.guest = payload.stars.guest;
  }

  function resolveActor(payload, state) {
    payload = payload || {};
    var fromSeat = payload.fromSeat;
    if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
    var openId = openIdOf(payload);
    if (openId && state) {
      if (state.hostOpenId && openId === state.hostOpenId) fromSeat = 0;
      else if (state.guestOpenId && openId === state.guestOpenId) fromSeat = 1;
      else return { error: 'bad-openId', fromSeat: null, openId: openId };
    }
    if (fromSeat !== 0 && fromSeat !== 1) {
      return { error: 'bad-seat', fromSeat: null, openId: openId };
    }
    if (payload.token && payload.token !== tokenFor(state.roomId, fromSeat)) {
      return { error: 'bad-token', fromSeat: fromSeat, openId: openId };
    }
    return {
      error: null,
      fromSeat: fromSeat,
      openId: openId || openIdOfSeat(fromSeat, state),
      role: roleOfSeat(fromSeat)
    };
  }

  function expireShotClock(state, nowMs) {
    if (!state || state.matchOver) return false;
    if (state.deadlineAt == null) return false;
    if (nowMs < state.deadlineAt) return false;
    var fromSeat = state.turn;
    state.foulCode = FOUL_SHOT_CLOCK;
    state.foulHint = hintFor(FOUL_SHOT_CLOCK);
    state.lastReason = FOUL_SHOT_CLOCK;
    state.lastSeat = fromSeat;
    state.lastRole = roleOfSeat(fromSeat);
    state.phase = 'Aim';
    state.aim = null;
    state.shotSeq = (state.shotSeq == null ? 0 : state.shotSeq) + 1;
    state.seq += 1;
    state.turn = fromSeat === 0 ? 1 : 0;
    syncTurnIdentity(state);
    state.lastShot = {
      shotSeq: state.shotSeq,
      reason: FOUL_SHOT_CLOCK,
      events: [{ type: 'foul', reason: FOUL_SHOT_CLOCK }]
    };
    refreshDeadline(state, nowMs);
    return true;
  }

  function createStore(options) {
    options = options || {};
    var rooms = {};
    var nowFn = typeof options.now === 'function' ? options.now : function () { return Date.now(); };
    var defaultClock = options.shotClockSec != null ? options.shotClockSec : DEFAULT_SHOT_CLOCK_SEC;

    function now() {
      return nowFn();
    }

    function write(roomId, state) {
      rooms[roomId] = state;
      return clone(state);
    }

    function load(roomId) {
      var state = rooms[roomId];
      if (!state) return null;
      applyDefaults(state, now(), defaultClock);
      expireShotClock(state, now());
      return state;
    }

    function create(payload) {
      payload = payload || {};
      var roomId = payload.roomId || randomId();
      if (rooms[roomId]) roomId = randomId();
      var clockSec = payload.shotClockSec != null ? payload.shotClockSec : defaultClock;
      var state = emptyState(roomId, now(), clockSec);
      var opening = payload.ballsSnapshot || payload.balls;
      if (opening) {
        state.balls = clone(opening);
        state.ballsSnapshot = clone(opening);
      }
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.targetN != null) state.targetN = payload.targetN;
      var hostOpen = openIdOf(payload) || payload.hostOpenId;
      if (hostOpen) state.hostOpenId = String(hostOpen);
      state.turnOpenId = state.hostOpenId;
      applyNicknames(state, payload, 0);
      applyStars(state, payload);
      write(roomId, state);
      return ok('create', roomId, {
        role: 'host',
        seat: 0,
        token: tokenFor(roomId, 0)
      }, state);
    }

    function join(roomIdOrPayload) {
      var payload = {};
      var roomId;
      if (typeof roomIdOrPayload === 'string') {
        roomId = roomIdOrPayload;
      } else {
        payload = roomIdOrPayload || {};
        roomId = payload.roomId;
      }
      var state = load(roomId);
      if (!state) return fail('join', 'missing', roomId, null);
      state.guestJoined = true;
      var guestOpen = openIdOf(payload) || payload.guestOpenId;
      if (guestOpen) state.guestOpenId = String(guestOpen);
      else if (!state.guestOpenId) state.guestOpenId = 'guest:' + roomId;
      applyNicknames(state, payload, 1);
      applyStars(state, payload);
      state.seq += 1;
      syncTurnIdentity(state);
      refreshDeadline(state, now());
      write(roomId, state);
      return ok('join', roomId, {
        role: 'guest',
        seat: 1,
        token: tokenFor(roomId, 1)
      }, state);
    }

    function aim(roomId, payload) {
      payload = payload || {};
      roomId = roomId || payload.roomId;
      var state = load(roomId);
      if (!state) return fail('aim', 'missing', roomId, null);
      var actor = resolveActor(payload, state);
      if (actor.error) return fail('aim', actor.error, roomId, state);
      if (state.matchOver) return fail('aim', 'match-over', roomId, state);
      if (state.turn !== actor.fromSeat || (state.turnOpenId && actor.openId && state.turnOpenId !== actor.openId)) {
        return fail('aim', 'not-your-turn', roomId, state);
      }
      if (!isAimPhase(state.phase)) return fail('aim', 'not-aim-phase', roomId, state);
      if (payload.shotSeq != null) {
        var cur = state.shotSeq == null ? 0 : state.shotSeq;
        if (payload.shotSeq !== cur && payload.shotSeq !== cur + 1) {
          return fail('aim', 'stale-seq', roomId, state);
        }
      }
      var prev = state.aim || {};
      var angle = payload.angle;
      if (angle == null) angle = payload.aimAngle;
      if (angle == null) angle = prev.angle;
      var power = payload.power;
      if (power == null) power = prev.power;
      var aimLine = payload.aimLine !== undefined ? payload.aimLine : prev.aimLine;
      state.aim = {
        angle: angle,
        power: power,
        aimLine: aimLine,
        updatedAt: now()
      };
      state.seq += 1;
      write(roomId, state);
      return ok('aim', roomId, { aim: clone(state.aim) }, state);
    }

    function shot(roomId, payload) {
      payload = payload || {};
      roomId = roomId || payload.roomId;
      var state = load(roomId);
      if (!state) return fail('shot', 'missing', roomId, null);
      var actor = resolveActor(payload, state);
      if (actor.error) return fail('shot', actor.error, roomId, state);
      var fromSeat = actor.fromSeat;
      var reason = reasonFromEvents(payload.events, payload.reason);
      if (reason !== 'new-game' && !state.matchOver && state.turn !== fromSeat) {
        return fail('shot', 'not-your-turn', roomId, state);
      }
      if (payload.shotSeq != null && reason !== 'new-game') {
        var expected = (state.shotSeq == null ? 0 : state.shotSeq) + 1;
        if (payload.shotSeq !== expected) {
          return fail('shot', 'stale-seq', roomId, state);
        }
      }
      var snap = payload.ballsSnapshot || payload.balls;
      if (snap) {
        state.balls = clone(snap);
        state.ballsSnapshot = clone(snap);
      }
      if (payload.scores) state.scores = payload.scores.slice();
      if (payload.phase) state.phase = payload.phase;
      if (payload.targetN != null) state.targetN = payload.targetN;
      applyStars(state, payload);
      if (payload.pocketScore != null) state.pocketScore = payload.pocketScore;
      else if (reason === 'new-game') state.pocketScore = null;
      if (payload.zoneBonus != null) state.zoneBonus = payload.zoneBonus;
      else if (reason === 'new-game') state.zoneBonus = null;
      if (payload.foulCode != null) {
        state.foulCode = payload.foulCode;
        state.foulHint = payload.foulHint != null ? payload.foulHint : hintFor(payload.foulCode);
      } else if (reason === 'scratch' || reason === 'whiff' || reason === 'order' || reason === 'foul' || reason === FOUL_SHOT_CLOCK) {
        state.foulCode = reason;
        state.foulHint = payload.foulHint != null ? payload.foulHint : hintFor(reason);
      } else {
        state.foulCode = null;
        state.foulHint = payload.foulHint != null ? payload.foulHint : null;
      }
      state.turn = nextTurn(fromSeat, reason);
      syncTurnIdentity(state);
      state.matchOver = reason === 'nine';
      state.winner = reason === 'nine' ? fromSeat : (reason === 'new-game' ? null : state.winner);
      if (reason === 'nine') {
        state.winnerOpenId = payload.winnerOpenId || openIdOfSeat(fromSeat, state);
      } else if (reason === 'new-game') {
        state.winnerOpenId = null;
      }
      if (reason === 'new-game') {
        state.matchOver = false;
        state.winner = null;
        state.scores = payload.scores ? payload.scores.slice() : [0, 0];
        if (!payload.stars) state.stars = { host: 0, guest: 0 };
        state.phase = 'Aim';
        state.targetN = payload.targetN != null ? payload.targetN : 1;
        state.shotSeq = 0;
        state.turn = 0;
        state.foulCode = null;
        state.foulHint = null;
        state.pocketScore = payload.pocketScore != null ? payload.pocketScore : null;
        state.zoneBonus = payload.zoneBonus != null ? payload.zoneBonus : null;
        syncTurnIdentity(state);
      }
      if (reason === 'nine') state.phase = payload.phase || 'Settle';
      else if (!payload.phase) state.phase = 'Aim';
      state.lastReason = reason;
      state.lastSeat = fromSeat;
      state.lastRole = roleOfSeat(fromSeat);
      state.lastShot = {
        shotSeq: payload.shotSeq != null ? payload.shotSeq : state.shotSeq + 1,
        aimAngle: payload.aimAngle != null ? payload.aimAngle : payload.angle,
        power: payload.power,
        spin: payload.spin,
        events: payload.events ? clone(payload.events) : []
      };
      state.aim = null;
      state.guestJoined = !!(state.guestJoined || payload.guestJoined);
      state.seq += 1;
      if (reason !== 'new-game') {
        state.shotSeq = payload.shotSeq != null ? payload.shotSeq : state.seq;
      }
      if (!state.matchOver) refreshDeadline(state, now());
      else state.deadlineAt = null;
      write(roomId, state);
      return ok('shot', roomId, {
        winnerOpenId: state.winnerOpenId,
        foulCode: state.foulCode,
        foulHint: state.foulHint
      }, state);
    }

    function stateOf(roomId) {
      var state = load(roomId);
      if (!state) return fail('state', 'missing', roomId, null);
      write(roomId, state);
      return ok('state', roomId, {
        turn: state.turn,
        turnRole: state.turnRole,
        turnOpenId: state.turnOpenId,
        shotSeq: state.shotSeq,
        ballsSnapshot: state.ballsSnapshot,
        matchOver: state.matchOver,
        winner: state.winner,
        winnerOpenId: state.winnerOpenId,
        guestJoined: state.guestJoined,
        nicknames: clone(state.nicknames),
        stars: clone(state.stars),
        aim: state.aim ? clone(state.aim) : null,
        foulCode: state.foulCode,
        foulHint: state.foulHint,
        pocketScore: state.pocketScore,
        zoneBonus: state.zoneBonus
      }, state);
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
    reasonFromEvents: reasonFromEvents,
    DEFAULT_SHOT_CLOCK_SEC: DEFAULT_SHOT_CLOCK_SEC,
    FOUL_SHOT_CLOCK: FOUL_SHOT_CLOCK
  };
});
