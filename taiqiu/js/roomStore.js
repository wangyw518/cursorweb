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
 *
 * Spectate path (no frame sync):
 *   aim dirty sync → POST /room/shot impulse (phase=rolling) →
 *   opponent local replay → settle snapshot corrects balls.
 *   Impulse-first must not wait on ballsSnapshot. A later shot with the
 *   same stroke's snapshot still applies authoritative correction.
 *
 * Shot scoring (server-authoritative attribution):
 *   Trust this-shot `pocketScore` + `zoneBonus` (or the same fields on events).
 *   Always add that total to the current turn seat — `turnOpenId` →
 *   `stars.host` or `stars.guest`. Never apply client `stars` wholesale.
 *   Reject if the payload increments the waiting seat (`not-your-score`).
 *   Do not invent a constant (especially 32). Miss / foul → 0 this shot.
 *   shot / state responses echo `pocketScore`, `zoneBonus`, `stars:{host,guest}`.
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
  var ROLLING_PHASES = { rolling: true, Shot: true, shot: true };
  var IMPULSE_REASONS = { rolling: true, shot: true, fire: true };

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

  function roomIdOf(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string' || typeof payload === 'number') {
      return normalizeRoomId(payload);
    }
    return normalizeRoomId(payload.roomId || payload.roomid || payload.room_id);
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

  function isRollingPhase(phase) {
    return !!ROLLING_PHASES[phase];
  }

  function impulseOf(payload, prev) {
    payload = payload || {};
    prev = prev || {};
    var angle = payload.angle;
    if (angle == null) angle = payload.aimAngle;
    if (angle == null) angle = prev.angle;
    if (angle == null) angle = prev.aimAngle;
    var power = payload.power;
    if (power == null) power = prev.power;
    var spin = payload.spin;
    if (spin == null) spin = prev.spin;
    return { angle: angle, power: power, spin: spin };
  }

  function isImpulseFirst(payload, reason) {
    payload = payload || {};
    if (payload.settled === true) return false;
    if (payload.settled === false) return true;
    var explicit = payload.reason || '';
    var phase = payload.phase || '';
    var ev = payload.events || [];
    if (IMPULSE_REASONS[explicit] || IMPULSE_REASONS[reason]) return true;
    if (isRollingPhase(phase) && (!explicit || IMPULSE_REASONS[explicit]) && !ev.length) {
      return true;
    }
    var hasImpulse = (payload.angle != null || payload.aimAngle != null) && payload.power != null;
    var hasSnap = !!(payload.ballsSnapshot || payload.balls);
    if (hasImpulse && !explicit && !ev.length && !hasSnap) return true;
    return false;
  }

  function writeImpulse(state, impulse, shotSeq, extra) {
    extra = extra || {};
    state.angle = impulse.angle;
    state.power = impulse.power;
    state.spin = impulse.spin;
    state.impulse = {
      angle: impulse.angle,
      power: impulse.power,
      spin: impulse.spin,
      shotSeq: shotSeq
    };
    state.lastShot = {
      shotSeq: shotSeq,
      angle: impulse.angle,
      aimAngle: impulse.angle,
      power: impulse.power,
      spin: impulse.spin,
      reason: extra.reason || 'rolling',
      events: extra.events ? clone(extra.events) : []
    };
    return state.impulse;
  }

  function shotEcho(state) {
    return {
      winnerOpenId: state.winnerOpenId,
      foulCode: state.foulCode,
      foulHint: state.foulHint,
      pocketScore: state.pocketScore,
      zoneBonus: state.zoneBonus,
      stars: clone(state.stars),
      angle: state.angle,
      power: state.power,
      spin: state.spin,
      shotSeq: state.shotSeq,
      phase: state.phase,
      impulse: state.impulse ? clone(state.impulse) : null
    };
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
      angle: null,
      power: null,
      spin: null,
      impulse: null,
      ballsSeq: 0,
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
    if (state.angle === undefined) state.angle = null;
    if (state.power === undefined) state.power = null;
    if (state.spin === undefined) state.spin = null;
    if (state.impulse === undefined) state.impulse = null;
    if (state.ballsSeq == null) state.ballsSeq = 0;
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

  function asNum(value, fallback) {
    if (value == null || value === '') return fallback;
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function amountsFromEvents(events) {
    var pocket = null;
    var zone = null;
    var i;
    events = events || [];
    for (i = 0; i < events.length; i++) {
      var e = events[i] || {};
      if (e.pocketScore != null) pocket = asNum(e.pocketScore, 0);
      if (e.pocketBonus != null && pocket == null) pocket = asNum(e.pocketBonus, 0);
      if (e.zoneBonus != null) zone = asNum(e.zoneBonus, 0);
      if (e.landingBonus != null && zone == null) zone = asNum(e.landingBonus, 0);
    }
    return { pocketScore: pocket, zoneBonus: zone };
  }

  function thisShotAmounts(state, payload, fromSeat, reason) {
    payload = payload || {};
    if (reason !== 'legal' && reason !== 'nine') {
      return { pocketScore: 0, zoneBonus: 0 };
    }
    var role = roleOfSeat(fromSeat);
    var pocket = payload.pocketScore != null ? asNum(payload.pocketScore, 0) : null;
    var zone = payload.zoneBonus != null ? asNum(payload.zoneBonus, 0) : null;
    if (pocket == null || zone == null) {
      var ev = amountsFromEvents(payload.events);
      if (pocket == null) pocket = ev.pocketScore;
      if (zone == null) zone = ev.zoneBonus;
    }
    if (pocket == null && zone == null) {
      var delta = 0;
      if (payload.stars && payload.stars[role] != null) {
        delta = asNum(payload.stars[role], 0) - asNum(state.stars[role], 0);
      } else if (payload.scores && payload.scores[fromSeat] != null) {
        delta = asNum(payload.scores[fromSeat], 0) - asNum(state.scores[fromSeat], 0);
      }
      if (delta < 0) delta = 0;
      return { pocketScore: delta, zoneBonus: 0 };
    }
    return {
      pocketScore: pocket == null ? 0 : pocket,
      zoneBonus: zone == null ? 0 : zone
    };
  }

  function incrementsOtherSide(state, payload, fromSeat) {
    payload = payload || {};
    var otherRole = fromSeat === 1 ? 'host' : 'guest';
    var otherSeat = fromSeat === 1 ? 0 : 1;
    if (payload.stars && payload.stars[otherRole] != null) {
      if (asNum(payload.stars[otherRole], 0) > asNum(state.stars[otherRole], 0)) return true;
    }
    if (payload.scores && payload.scores[otherSeat] != null) {
      if (asNum(payload.scores[otherSeat], 0) > asNum(state.scores[otherSeat], 0)) return true;
    }
    return false;
  }

  function creditTurnStars(state, payload, fromSeat, reason) {
    var role = roleOfSeat(fromSeat);
    var amt = thisShotAmounts(state, payload, fromSeat, reason);
    state.pocketScore = amt.pocketScore;
    state.zoneBonus = amt.zoneBonus;
    state.stars[role] = asNum(state.stars[role], 0) + amt.pocketScore + amt.zoneBonus;
    state.scores[0] = asNum(state.stars.host, 0);
    state.scores[1] = asNum(state.stars.guest, 0);
    return amt;
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
    if (isRollingPhase(state.phase)) return false;
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
      var id = normalizeRoomId(roomId);
      if (!id) return null;
      var state = rooms[id];
      if (!state) {
        var raw = roomId != null ? String(roomId).trim() : '';
        if (raw && rooms[raw]) state = rooms[raw];
      }
      if (!state) return null;
      applyDefaults(state, now(), defaultClock);
      expireShotClock(state, now());
      return state;
    }

    function create(payload) {
      payload = payload || {};
      var roomId = roomIdOf(payload) || randomId();
      if (rooms[roomId]) roomId = randomId();
      var clockSec = payload.shotClockSec != null ? payload.shotClockSec : defaultClock;
      var state = emptyState(roomId, now(), clockSec);
      var opening = payload.ballsSnapshot || payload.balls;
      if (opening) {
        state.balls = clone(opening);
        state.ballsSnapshot = clone(opening);
      }
      if (payload.targetN != null) state.targetN = payload.targetN;
      var hostOpen = openIdOf(payload) || payload.hostOpenId;
      if (hostOpen) state.hostOpenId = String(hostOpen);
      state.turnOpenId = state.hostOpenId;
      applyNicknames(state, payload, 0);
      state.stars = { host: 0, guest: 0 };
      state.scores = [0, 0];
      state.pocketScore = null;
      state.zoneBonus = null;
      write(roomId, state);
      return ok('create', roomId, {
        role: 'host',
        seat: 0,
        token: tokenFor(roomId, 0),
        share: shareFor(roomId)
      }, state);
    }

    function join(roomIdOrPayload) {
      var payload = {};
      var roomId;
      if (typeof roomIdOrPayload === 'string') {
        roomId = roomIdOrPayload;
      } else {
        payload = roomIdOrPayload || {};
        roomId = payload.roomId || payload.roomid || payload.room_id;
      }
      roomId = normalizeRoomId(roomId);
      if (!roomId) return fail('join', 'missing', '', null);
      var state = load(roomId);
      if (!state) return fail('join', 'missing', roomId, null);
      if (state.matchOver) return fail('join', 'ended', roomId, state);

      var incoming = openIdOf(payload) || payload.guestOpenId || '';
      if (incoming) incoming = String(incoming);

      if (incoming && state.hostOpenId && incoming === state.hostOpenId) {
        applyNicknames(state, payload, 0);
        write(roomId, state);
        return ok('join', roomId, {
          role: 'host',
          seat: 0,
          token: tokenFor(roomId, 0),
          share: shareFor(roomId)
        }, state);
      }

      var firstGuest = !state.guestJoined;
      if (state.guestJoined) {
        var sameGuest = !incoming || !state.guestOpenId || incoming === state.guestOpenId;
        if (!sameGuest) return fail('join', 'full', roomId, state);
      }

      state.guestJoined = true;
      if (incoming) state.guestOpenId = incoming;
      else if (!state.guestOpenId) state.guestOpenId = 'guest:' + roomId;
      applyNicknames(state, payload, 1);
      if (firstGuest) {
        state.seq += 1;
        refreshDeadline(state, now());
      }
      syncTurnIdentity(state);
      write(roomId, state);
      return ok('join', roomId, {
        role: 'guest',
        seat: 1,
        token: tokenFor(roomId, 1),
        share: shareFor(roomId)
      }, state);
    }

    function aim(roomId, payload) {
      payload = payload || {};
      roomId = normalizeRoomId(roomId || payload.roomId || payload.roomid);
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
      roomId = normalizeRoomId(roomId || payload.roomId || payload.roomid);
      var state = load(roomId);
      if (!state) return fail('shot', 'missing', roomId, null);
      var actor = resolveActor(payload, state);
      if (actor.error) return fail('shot', actor.error, roomId, state);
      var fromSeat = actor.fromSeat;
      var reason = reasonFromEvents(payload.events, payload.reason);
      var impulseFirst = isImpulseFirst(payload, reason);
      if (reason !== 'new-game' && !state.matchOver) {
        if (state.turn !== fromSeat || (state.turnOpenId && actor.openId && state.turnOpenId !== actor.openId)) {
          return fail('shot', 'not-your-turn', roomId, state);
        }
        if (!impulseFirst && incrementsOtherSide(state, payload, fromSeat)) {
          return fail('shot', 'not-your-score', roomId, state);
        }
      }
      if (payload.shotSeq != null && reason !== 'new-game') {
        var curSeq = state.shotSeq == null ? 0 : state.shotSeq;
        var expected = curSeq + 1;
        var sameStrokeSettle = isRollingPhase(state.phase) && !impulseFirst && payload.shotSeq === curSeq;
        if (payload.shotSeq !== expected && !sameStrokeSettle) {
          return fail('shot', 'stale-seq', roomId, state);
        }
      }
      var impulse = impulseOf(payload, state.impulse || state.lastShot);

      if (impulseFirst && reason !== 'new-game') {
        if (impulse.angle == null || impulse.power == null) {
          return fail('shot', 'missing-impulse', roomId, state);
        }
        var fireSeq = payload.shotSeq != null ? payload.shotSeq : (state.shotSeq == null ? 0 : state.shotSeq) + 1;
        state.phase = 'rolling';
        state.shotSeq = fireSeq;
        state.seq += 1;
        writeImpulse(state, impulse, fireSeq, { reason: 'rolling' });
        state.lastReason = 'rolling';
        state.lastSeat = fromSeat;
        state.lastRole = roleOfSeat(fromSeat);
        state.aim = null;
        state.guestJoined = !!(state.guestJoined || payload.guestJoined);
        write(roomId, state);
        return ok('shot', roomId, shotEcho(state), state);
      }

      var snap = payload.ballsSnapshot || payload.balls;
      if (snap) {
        state.balls = clone(snap);
        state.ballsSnapshot = clone(snap);
        state.ballsSeq = (state.ballsSeq == null ? 0 : state.ballsSeq) + 1;
      }
      if (payload.phase) state.phase = payload.phase;
      if (payload.targetN != null) state.targetN = payload.targetN;
      if (reason === 'new-game') {
        state.stars = { host: 0, guest: 0 };
        state.scores = [0, 0];
        state.pocketScore = null;
        state.zoneBonus = null;
      } else {
        creditTurnStars(state, payload, fromSeat, reason);
      }
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
        state.scores = [0, 0];
        state.stars = { host: 0, guest: 0 };
        state.phase = 'Aim';
        state.targetN = payload.targetN != null ? payload.targetN : 1;
        state.shotSeq = 0;
        state.turn = 0;
        state.foulCode = null;
        state.foulHint = null;
        state.pocketScore = null;
        state.zoneBonus = null;
        state.angle = null;
        state.power = null;
        state.spin = null;
        state.impulse = null;
        state.ballsSeq = snap ? state.ballsSeq : 0;
        syncTurnIdentity(state);
      }
      if (reason === 'nine') state.phase = payload.phase || 'Settle';
      else if (!payload.phase || isRollingPhase(payload.phase)) state.phase = 'Aim';
      state.lastReason = reason;
      state.lastSeat = fromSeat;
      state.lastRole = roleOfSeat(fromSeat);
      var settleSeq = payload.shotSeq != null ? payload.shotSeq : (state.shotSeq == null ? 0 : state.shotSeq) + 1;
      if (impulse.angle != null || impulse.power != null) {
        writeImpulse(state, impulse, settleSeq, {
          reason: reason,
          events: payload.events
        });
      } else {
        state.lastShot = {
          shotSeq: settleSeq,
          aimAngle: payload.aimAngle != null ? payload.aimAngle : payload.angle,
          angle: payload.angle != null ? payload.angle : payload.aimAngle,
          power: payload.power,
          spin: payload.spin,
          events: payload.events ? clone(payload.events) : []
        };
      }
      state.aim = null;
      state.guestJoined = !!(state.guestJoined || payload.guestJoined);
      state.seq += 1;
      if (reason !== 'new-game') {
        state.shotSeq = settleSeq;
      }
      if (!state.matchOver) refreshDeadline(state, now());
      else state.deadlineAt = null;
      write(roomId, state);
      return ok('shot', roomId, shotEcho(state), state);
    }

    function stateOf(roomId) {
      roomId = normalizeRoomId(roomId);
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
        zoneBonus: state.zoneBonus,
        angle: state.angle,
        power: state.power,
        spin: state.spin,
        phase: state.phase,
        impulse: state.impulse ? clone(state.impulse) : null,
        ballsSeq: state.ballsSeq
      }, state);
    }

    function dispatch(action, payload) {
      payload = payload || {};
      if (action === 'create') return create(payload);
      if (action === 'join') return join(payload);
      if (action === 'aim') return aim(roomIdOf(payload), payload);
      if (action === 'shot') return shot(roomIdOf(payload), payload);
      if (action === 'state') return stateOf(roomIdOf(payload));
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
      randomId: randomId,
      normalizeRoomId: normalizeRoomId,
      shareFor: shareFor
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
    thisShotAmounts: thisShotAmounts,
    creditTurnStars: creditTurnStars,
    impulseOf: impulseOf,
    isImpulseFirst: isImpulseFirst,
    isRollingPhase: isRollingPhase,
    DEFAULT_SHOT_CLOCK_SEC: DEFAULT_SHOT_CLOCK_SEC,
    FOUL_SHOT_CLOCK: FOUL_SHOT_CLOCK
  };
});
