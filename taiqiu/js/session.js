(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.TaiqiuPhysics,
    typeof require === 'function' ? require('./table') : root.TaiqiuTable,
    typeof require === 'function' ? require('./fsm') : root.TaiqiuFsm,
    typeof require === 'function' ? require('./tiles') : root.TaiqiuTiles,
    typeof require === 'function' ? require('./balls') : root.TaiqiuBalls,
    typeof require === 'function' ? require('./cue') : root.TaiqiuCue,
    typeof require === 'function' ? require('./stopDetect') : root.TaiqiuStopDetect,
    typeof require === 'function' ? require('./score') : root.TaiqiuScore,
    typeof require === 'function' ? require('./hud') : root.TaiqiuHud,
    typeof require === 'function' ? require('./fx') : root.TaiqiuFx,
    typeof require === 'function' ? require('./storage') : root.TaiqiuStorage,
    typeof require === 'function' ? require('./share') : root.TaiqiuShare,
    typeof require === 'function' ? require('./sfx') : root.TaiqiuSfx,
    typeof require === 'function' ? require('./ai') : root.TaiqiuAi,
    typeof require === 'function' ? require('./render') : root.TaiqiuRender,
    typeof require === 'function' ? require('./roomApi') : (root.TaiqiuRoomApi || root.TaiqiuNet)
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  physics,
  table,
  fsm,
  tiles,
  balls,
  cue,
  stopDetect,
  score,
  hud,
  fx,
  storage,
  share,
  sfx,
  ai,
  render,
  roomApi
) {
  'use strict';

  function persist(session) {
    storage.save({
      best: session.best,
      skinProgress: session.skinProgress
    });
  }

  function worldOf(session) {
    return {
      balls: session.balls,
      walls: session.table.walls,
      pockets: session.table.pockets,
      frozen: session.phase === fsm.PHASE.Aim,
      lockObjects: session.phase === fsm.PHASE.Shot && !session.shot.firstContactId
    };
  }

  function dragBounds(session) {
    var v = session.viewport || {};
    return {
      x: 0,
      y: 0,
      w: v.width || 375,
      h: v.height || 667,
      pad: 12
    };
  }

  function lockObjectBalls(session) {
    session.aimLock = balls.snapshotObjectBalls(session.balls);
    return session.aimLock;
  }

  function guardObjectBalls(session) {
    if (session.phase !== fsm.PHASE.Aim) return session;
    balls.haltBalls(session.balls);
    if (session.aimLock) balls.restoreObjectBalls(session.balls, session.aimLock);
    return session;
  }

  function incomingShotSeq(state) {
    if (!state) return null;
    if (state.shotSeq != null) return state.shotSeq;
    if (state.seq != null) return state.seq;
    return null;
  }

  function isRollingPhase(phase) {
    return phase === 'rolling' || phase === fsm.PHASE.Shot || phase === 'shot';
  }

  function isSettledPhase(phase) {
    return phase === fsm.PHASE.Aim || phase === fsm.PHASE.Settle || phase === 'aim' || phase === 'settle';
  }

  function pickImpulse(state) {
    if (!state) return null;
    var src = state.impulse || state.lastShot || state;
    var angle = src.angle;
    if (angle == null) angle = src.aimAngle;
    if (angle == null && state.angle != null) angle = state.angle;
    var power = src.power;
    if (power == null && state.power != null) power = state.power;
    if (angle == null || power == null) return null;
    return {
      angle: angle,
      power: power,
      spin: src.spin != null ? src.spin : state.spin
    };
  }

  function isAuthoritativeBalls(session, state, opts) {
    opts = opts || {};
    if (opts.forceBalls || opts.join) return true;
    if (isRollingPhase(state.phase)) return false;
    if (state.ballsSeq != null) {
      var lastBalls = session.room && session.room.lastBallsSeq != null ? session.room.lastBallsSeq : -1;
      return state.ballsSeq > lastBalls;
    }
    var incoming = incomingShotSeq(state);
    var last = session.room && session.room.lastSeq != null ? session.room.lastSeq : -1;
    return incoming != null && incoming > last;
  }

  function applyRemoteAim(session, aim) {
    if (!aim || aim.angle == null) return session;
    if (canAim(session) && session.cue.dragging) return session;
    session.cue.angle = aim.angle;
    session.cue.ax = Math.cos(aim.angle);
    session.cue.ay = Math.sin(aim.angle);
    session.cue.power = aim.power != null ? aim.power : 0;
    session.watchAim = true;
    refreshPreview(session);
    return session;
  }

  function shouldStartRemoteReplay(session, state) {
    if (!state || !session.room) return false;
    if (!isRollingPhase(state.phase)) return false;
    var incoming = incomingShotSeq(state);
    if (incoming == null) return false;
    if (session.room.replaySeq === incoming) return false;
    if (session.room.firedSeq === incoming) return false;
    return !!pickImpulse(state);
  }

  function startRemoteReplay(session, state) {
    var impulse = pickImpulse(state);
    if (!impulse) return false;
    var felt = session.table && session.table.felt;
    var snap = state.ballsSnapshot || state.balls;
    if (snap) {
      roomApi.applyBalls(session.balls, snap, felt);
      lockObjectBalls(session);
    }
    var cueBall = findCue(session);
    if (!cueBall || cueBall.pocketed) return false;
    var spd = ((session.config && session.config.powerSpeed) || 1280) * impulse.power;
    cueBall.vx = Math.cos(impulse.angle) * spd;
    cueBall.vy = Math.sin(impulse.angle) * spd;
    session.lastShotInput = {
      aimAngle: impulse.angle,
      power: impulse.power,
      spin: impulse.spin || 0
    };
    session.phase = fsm.PHASE.Shot;
    session.cue.dragging = false;
    session.cue.power = 0;
    session.watchAim = false;
    session.pendingSnap = null;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    session.shot = emptyShot();
    session.preview = { points: [], ghost: null, bounces: 0 };
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    if (session.room) {
      if (state.shotSeq != null) session.room.lastSeq = state.shotSeq;
      session.room.replaySeq = incomingShotSeq(state);
    }
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    if (sfx && sfx.cue) sfx.cue();
    return true;
  }

  function applyPendingSnap(session) {
    if (!session.pendingSnap) return false;
    var pending = session.pendingSnap;
    session.pendingSnap = null;
    applyRoomState(session, pending, { forceBalls: true });
    return true;
  }

  function findCue(session) {
    return balls.cueBall(session.balls);
  }

  function refreshTarget(session) {
    session.target = balls.lowestNumbered(session.balls);
    return session.target;
  }

  function emptyShot() {
    return {
      cushions: 0,
      pocketed: [],
      firstContactId: null,
      targetId: null,
      scratch: false,
      pocketedLowest: false,
      pocketedNine: false
    };
  }

  function refreshPreview(session) {
    var cueBall = findCue(session);
    var aiming = session.cue.dragging || session.watchAim;
    if (!aiming || session.cue.power < 0.04 || !cueBall) {
      session.preview = { points: [], ghost: null, bounces: 0 };
      return session.preview;
    }
    session.preview = physics.preview(
      cueBall,
      session.cue.ax,
      session.cue.ay,
      worldOf(session),
      session.config
    );
    guardObjectBalls(session);
    return session.preview;
  }

  function eventsFromResolution(session, reason) {
    var events = [];
    var res = session.resolution || {};
    var shot = session.shot || {};
    var i;
    if (shot.pocketed && shot.pocketed.length) {
      for (i = 0; i < shot.pocketed.length; i++) {
        var id = shot.pocketed[i];
        var n = id === 'cue' ? 0 : parseInt(String(id).replace('b', ''), 10);
        events.push({
          type: 'pocket',
          n: n,
          legal: !!(res.legal) && n !== 0
        });
      }
    }
    if (reason === 'nine' || res.win) {
      var nineEv = { type: 'nine', legal: true };
      if (session.award) {
        nineEv.pocketScore = session.award.pocketBonus || 0;
        nineEv.zoneBonus = session.award.landingBonus || 0;
      }
      events.push(nineEv);
    } else if (reason === 'legal') {
      var legalEv = { type: 'legal' };
      if (session.award) {
        legalEv.pocketScore = session.award.pocketBonus || 0;
        legalEv.zoneBonus = session.award.landingBonus || 0;
      }
      events.push(legalEv);
    } else if (reason === 'scratch' || shot.scratch) events.push({ type: 'scratch' });
    else if (res.foul) events.push({ type: 'foul', reason: res.reason || reason });
    else if (reason === 'new-game') events.push({ type: 'new-game' });
    else events.push({ type: 'miss' });
    return events;
  }

  function shotPayload(session, reason, fromSeat) {
    var felt = session.table && session.table.felt;
    var snap = roomApi.snapshotBalls(session.balls, felt);
    var seat = fromSeat != null ? fromSeat : session.mySeat;
    var last = session.lastShotInput || {};
    var lastSeq = session.room && session.room.lastSeq != null ? session.room.lastSeq : 0;
    var shotSeq = session.room && session.room.impulseSent
      ? lastSeq
      : lastSeq + 1;
    return {
      roomId: session.room ? session.room.roomId : null,
      shotSeq: shotSeq,
      angle: last.aimAngle,
      aimAngle: last.aimAngle,
      power: last.power,
      spin: last.spin,
      events: session.lastShotEvents || eventsFromResolution(session, reason),
      ballsSnapshot: snap,
      fromSeat: seat,
      role: seat === 1 ? 'guest' : 'host',
      token: session.room ? session.room.token : null,
      openId: session.openId || undefined,
      reason: reason || 'miss',
      balls: snap,
      scores: session.scores.slice(),
      stars: session.stars
        ? { host: session.stars.host || 0, guest: session.stars.guest || 0 }
        : { host: (session.scores[0] || 0), guest: (session.scores[1] || 0) },
      pocketScore: session.award && session.award.pocketBonus != null ? session.award.pocketBonus : 0,
      zoneBonus: session.award && session.award.landingBonus != null ? session.award.landingBonus : 0,
      phase: session.phase,
      settled: true,
      targetN: session.target ? session.target.n : 0,
      matchOver: !!session.matchOver,
      winner: session.winner,
      guestJoined: !!(session.room && session.room.guestJoined)
    };
  }

  function applyRoomState(session, state, opts) {
    if (!state) return session;
    opts = opts || {};
    var felt = session.table && session.table.felt;
    var snap = state.ballsSnapshot || state.balls;
    var applyBallsNow = !!snap && (
      session.phase !== fsm.PHASE.Aim || isAuthoritativeBalls(session, state, opts)
    );
    if (applyBallsNow) {
      roomApi.applyBalls(session.balls, snap, felt);
      lockObjectBalls(session);
      if (session.room && state.ballsSeq != null) session.room.lastBallsSeq = state.ballsSeq;
    }
    if (state.stars) {
      session.stars = {
        host: state.stars.host || 0,
        guest: state.stars.guest || 0
      };
      session.scores = [session.stars.host, session.stars.guest];
    } else if (state.scores) {
      session.scores = state.scores.slice();
      session.stars = session.stars || { host: 0, guest: 0 };
      if (state.scores[0] != null) session.stars.host = state.scores[0];
      if (state.scores[1] != null) session.stars.guest = state.scores[1];
    }
    if (state.pocketScore !== undefined) session.pocketScore = state.pocketScore;
    if (state.zoneBonus !== undefined) session.zoneBonus = state.zoneBonus;
    if (state.turnRole === 'guest') session.turn = 1;
    else if (state.turnRole === 'host') session.turn = 0;
    else if (state.turn != null) session.turn = state.turn;
    session.winner = state.winner;
    session.matchOver = !!state.matchOver;
    if (session.room) {
      if (state.shotSeq != null) session.room.lastSeq = state.shotSeq;
      else if (state.seq != null) session.room.lastSeq = state.seq;
    }
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    if (state.nicknames) {
      session.nicknames = {
        host: state.nicknames.host || '',
        guest: state.nicknames.guest || ''
      };
    }
    if (state.phase === fsm.PHASE.Aim || state.phase === fsm.PHASE.Settle) {
      session.phase = state.phase;
      session.watchAim = false;
      if (session.room) session.room.replaySeq = null;
    }
    if (state.matchOver && state.phase === fsm.PHASE.Settle) {
      session.phase = fsm.PHASE.Settle;
    }
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    if (session.phase === fsm.PHASE.Aim) {
      guardObjectBalls(session);
      if (state.aim && !canAim(session)) applyRemoteAim(session, state.aim);
      else if (!state.aim && session.watchAim) session.watchAim = false;
    }
    return session;
  }

  function ingestState(session, res, opts) {
    var state = res && res.state ? res.state : res;
    if (!state || !state.roomId) return null;
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    var inFlight = session.phase === fsm.PHASE.Shot ||
      session.phase === fsm.PHASE.ResolvePocket ||
      session.phase === fsm.PHASE.WaitCueStop ||
      session.phase === fsm.PHASE.StarZone;
    if (inFlight) {
      if (isSettledPhase(state.phase) && (state.ballsSnapshot || state.balls)) {
        session.pendingSnap = state;
      }
      return state;
    }
    if (shouldStartRemoteReplay(session, state)) {
      startRemoteReplay(session, state);
      return state;
    }
    applyRoomState(session, state, opts);
    return state;
  }

  function shouldSubmitShot(session, fromSeat) {
    if (!session.room || !session.room.roomId) return false;
    if (!session.versus) return false;
    var seat = fromSeat != null ? fromSeat : session.mySeat;
    if (session.hotseat && !(session.room.guestJoined)) return session.mySeat === 0;
    return seat === session.mySeat;
  }

  function pushRoom(session, reason, fromSeat) {
    if (!shouldSubmitShot(session, fromSeat)) return null;
    return roomApi.shot(session.room.roomId, shotPayload(session, reason, fromSeat), function (res) {
      if (session.room) session.room.impulseSent = false;
      if (res && res.state) ingestState(session, res);
    });
  }

  function pushImpulse(session) {
    if (!shouldSubmitShot(session)) return null;
    var last = session.lastShotInput || {};
    var shotSeq = ((session.room && (session.room.lastSeq || 0)) || 0) + 1;
    if (session.room) session.room.firedSeq = shotSeq;
    var payload = {
      roomId: session.room.roomId,
      shotSeq: shotSeq,
      angle: last.aimAngle,
      aimAngle: last.aimAngle,
      power: last.power,
      spin: last.spin,
      reason: 'rolling',
      phase: 'rolling',
      fromSeat: session.mySeat,
      role: session.mySeat === 1 ? 'guest' : 'host',
      token: session.room.token,
      openId: session.openId || undefined
    };
    return roomApi.shot(session.room.roomId, payload, function (res) {
      if (res && res.ok && res.state && session.room) {
        if (res.state.shotSeq != null) session.room.lastSeq = res.state.shotSeq;
        session.room.impulseSent = true;
      }
    });
  }

  function pushAim(session) {
    if (!session.room || !session.room.roomId) return null;
    if (!canAim(session) || !session.cue.dragging) return null;
    var now = Date.now();
    var min = (session.config.room && session.config.room.aimMinIntervalMs) || 180;
    if (session.lastAimAt && now - session.lastAimAt < min) return null;
    session.lastAimAt = now;
    return roomApi.aim(session.room.roomId, {
      roomId: session.room.roomId,
      shotSeq: ((session.room.lastSeq || 0) || 0) + 1,
      angle: session.cue.angle,
      power: session.cue.power,
      fromSeat: session.mySeat,
      role: session.mySeat === 1 ? 'guest' : 'host',
      token: session.room.token,
      openId: session.openId || undefined
    });
  }

  function pullRoom(session) {
    if (!session.room || !session.room.roomId) return null;
    return roomApi.state(session.room.roomId, function (res) {
      ingestState(session, res);
    });
  }

  /**
   * Full re-rack. GATED: only 「新开一局 / 再来一局」 / newGame.
   * Miss, foul, and legal 1–8 must never call this.
   */
  function rack(session) {
    session.table = table.layout(session.viewport, session.config, session.ui.playRect);
    session.tiles = tiles.create(session.table, session.config);
    session.balls = balls.create(session.table, session.config);
    session.cue = cue.create(session.config);
    session.stop = stopDetect.create();
    session.phase = fsm.PHASE.Aim;
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.resolution = null;
    session.shot = emptyShot();
    session.particles = [];
    session.landFlash = null;
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.matchOver = false;
    session.winner = null;
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    balls.haltBalls(session.balls);
    lockObjectBalls(session);
    return session;
  }

  function resetRound(session) {
    return rack(session);
  }

  function newGame(session) {
    session.scores = [0, 0];
    session.stars = { host: 0, guest: 0 };
    session.pocketScore = null;
    session.zoneBonus = null;
    session.turn = 0;
    session.matchOver = false;
    session.winner = null;
    rack(session);
    pushRoom(session, 'new-game', session.mySeat || 0);
    return { kind: 'new-game' };
  }

  function create(viewport, config, opts) {
    opts = opts || {};
    if (config && config.room) roomApi.configure(config.room);
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      ui: hud.layout(viewport),
      viewMode: 'top',
      aim3d: false,
      toast: null,
      lastShare: null,
      phase: fsm.PHASE.Aim,
      best: saved.best || 0,
      skinProgress: saved.skinProgress || 0,
      award: null,
      settle: null,
      settleIn: 0,
      resolution: null,
      particles: [],
      landFlash: null,
      pressed: null,
      preview: { points: [], ghost: null, bounces: 0 },
      shot: emptyShot(),
      turn: 0,
      versus: false,
      hotseat: true,
      mySeat: 0,
      room: null,
      nick: opts.nick || '',
      openId: opts.openId || '',
      nicknames: { host: '', guest: '' },
      joiningRoomId: null,
      scores: [0, 0],
      stars: { host: 0, guest: 0 },
      pocketScore: null,
      zoneBonus: null,
      matchOver: false,
      winner: null,
      syncAcc: 0,
      roomPanel: null,
      watchAim: false,
      pendingSnap: null,
      lastAimAt: 0
    };
    resetRound(session);
    if (!opts.skipSplash) session.phase = fsm.PHASE.Splash;
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render.draw(session, ctx); };
    session.handlePointerDown = function (x, y) { return handlePointerDown(session, x, y); };
    session.handlePointerMove = function (x, y) { return handlePointerMove(session, x, y); };
    session.handlePointerUp = function (x, y) { return handlePointerUp(session, x, y); };
    session.resize = function (next) { resize(session, next); };
    session.restart = function () { return newGame(session); };
    return session;
  }

  function resize(session, viewport) {
    var old = session.table && session.table.felt;
    session.viewport = viewport;
    session.ui = hud.layout(viewport);
    var nextTable = table.layout(session.viewport, session.config, session.ui.playRect);
    if (old && session.balls) {
      var sx = nextTable.felt.w / old.w;
      var sy = nextTable.felt.h / old.h;
      var i;
      for (i = 0; i < session.balls.length; i++) {
        session.balls[i].x = nextTable.felt.x + (session.balls[i].x - old.x) * sx;
        session.balls[i].y = nextTable.felt.y + (session.balls[i].y - old.y) * sy;
      }
    }
    session.table = nextTable;
    session.tiles = tiles.create(session.table, session.config);
    if (session.phase === fsm.PHASE.Aim) lockObjectBalls(session);
  }

  function canAim(session) {
    if (session.phase !== fsm.PHASE.Aim) return false;
    if (session.matchOver) return false;
    if (!session.versus) return true;
    if (session.hotseat && !(session.room && session.room.guestJoined)) return true;
    return session.turn === session.mySeat;
  }

  function beginNextAim(session) {
    session.cue = cue.create(session.config);
    session.stop = stopDetect.create();
    session.settleIn = 0;
    session.shot = emptyShot();
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.settle = null;
    session.matchOver = false;
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    session.phase = fsm.PHASE.Aim;
    balls.haltBalls(session.balls);
    lockObjectBalls(session);
  }

  /**
   * 「再来一杆」 / post-miss continue. Keeps every object-ball position.
   * Only respots the cue on a scratch (kitchen / head spot).
   */
  function continueShot(session) {
    applySpotRules(session);
    beginNextAim(session);
    return session;
  }

  function applySpotRules(session) {
    var resolution = session.resolution || {};
    var nine = balls.findByN(session.balls, 9);
    var cueBall = findCue(session);
    if (nine && nine.pocketed && !resolution.win) {
      balls.spotNine(session.balls, session.table);
    }
    if (cueBall && cueBall.pocketed) {
      balls.respotCue(session.balls, session.table);
    }
  }

  function shouldSwitchTurn(session) {
    if (!session.versus) return false;
    if (session.resolution && session.resolution.legal && !session.resolution.win) return false;
    return true;
  }

  function switchTurn(session) {
    session.turn = session.turn === 0 ? 1 : 0;
    return session.turn;
  }

  function toastFor(session, award) {
    if (award && award.legal && award.reason === 'nine') {
      return { text: '打进9号 · 胜', life: 1.6 };
    }
    if (award && award.legal) {
      return { text: '+' + award.coins + ' 星币', life: 1.2 };
    }
    if (award && award.foul) {
      return { text: session.versus ? '犯规 · 换人' : '犯规', life: 1.4 };
    }
    return { text: session.versus ? '未进 · 换人' : '未进', life: 1.2 };
  }

  function concludeShot(session, applyStar) {
    if (session.pendingSnap) {
      var pending = session.pendingSnap;
      session.pendingSnap = null;
      applyRoomState(session, pending, { forceBalls: true });
      return session.settle || session.award;
    }
    if (session.room && session.room.replaySeq != null &&
        session.room.firedSeq !== session.room.replaySeq) {
      beginNextAim(session);
      return session.award;
    }
    var shooter = session.turn;
    var cueBall = findCue(session);
    var landed = null;
    if (applyStar && cueBall && !cueBall.pocketed) {
      landed = tiles.pickAt(session.tiles, cueBall.x, cueBall.y);
    }
    var zone = applyStar && cueBall && !cueBall.pocketed ? landed : null;
    var award = score.settle({
      pocketedLowest: session.shot.pocketedLowest,
      scratch: session.shot.scratch,
      foul: session.resolution ? session.resolution.foul : session.shot.scratch,
      resolution: session.resolution,
      cushions: session.shot.cushions,
      zone: zone,
      applyStar: !!applyStar,
      firstContactIsTarget: session.shot.firstContactId === session.shot.targetId
    }, session.config);

    session.award = award;
    var gap = score.gapToBest(award.coins, session.best);
    if (gap.isNew) session.best = award.coins;
    persist(session);
    session.stars = session.stars || { host: 0, guest: 0 };
    var shooterRole = shooter === 1 ? 'guest' : 'host';
    session.stars[shooterRole] = (session.stars[shooterRole] || 0) + award.coins;
    session.scores[0] = session.stars.host || 0;
    session.scores[1] = session.stars.guest || 0;
    session.pocketScore = award.pocketBonus || 0;
    session.zoneBonus = award.landingBonus || 0;

    var burstX = cueBall ? cueBall.x : session.table.felt.cx;
    var burstY = cueBall ? cueBall.y : session.table.felt.cy;
    if (award.legal) {
      fx.spawnBurst(
        session.particles,
        burstX,
        burstY,
        session.config.colors.scorePop,
        8
      );
    }

    session.landFlash = null;
    if (applyStar && award.legal && !award.foul && landed) {
      session.landFlash = { tileId: landed.id, frames: 1 };
    }

    var win = !!(session.resolution && session.resolution.win);
    session.lastShotEvents = eventsFromResolution(session, win ? 'nine' : (award.reason || (session.resolution && session.resolution.reason) || 'miss'));
    if (win) {
      applySpotRules(session);
      session.matchOver = true;
      session.winner = session.turn;
      session.settle = {
        coins: award.coins,
        points: award.coins,
        unit: award.unit,
        reason: award.reason,
        legal: award.legal,
        foul: award.foul,
        win: true,
        versus: !!session.versus,
        winner: session.winner,
        starApplied: award.starApplied,
        pocketBonus: award.pocketBonus,
        landingBonus: award.landingBonus,
        zoneLabel: award.zoneLabel,
        quality: award.quality,
        props: award.props,
        skinProgress: 0,
        disclaimer: award.disclaimer,
        gap: gap.gap,
        isNew: gap.isNew,
        best: session.best
      };
      session.phase = fsm.PHASE.Settle;
      session.toast = toastFor(session, award);
      pushRoom(session, 'nine', shooter);
      return session.settle;
    }

    // Miss / foul / legal 1–8: continueShot, never rack.
    session.toast = toastFor(session, award);
    if (shouldSwitchTurn(session)) switchTurn(session);
    continueShot(session);
    pushRoom(session, award.reason || (session.resolution && session.resolution.reason) || 'miss', shooter);
    return award;
  }

  function finishSettle(session, applyStar) {
    return concludeShot(session, applyStar);
  }

  function noteContacts(session, events) {
    var cueBall = findCue(session);
    var i;
    for (i = 0; i < events.contacts.length; i++) {
      var c = events.contacts[i];
      if (c.kind === 'cushion') {
        if (c.ball && c.ball.id === 'cue') session.shot.cushions += 1;
        if (sfx && sfx.cushion) sfx.cushion();
      }
      if (c.kind === 'ball') {
        if (sfx && sfx.ball) sfx.ball();
      }
      if (c.kind === 'ball' && !session.shot.firstContactId) {
        var other = null;
        if (c.a === cueBall) other = c.b;
        if (c.b === cueBall) other = c.a;
        if (other && other.id !== 'cue') session.shot.firstContactId = other.id;
      }
    }
    for (i = 0; i < events.pockets.length; i++) {
      session.shot.pocketed.push(events.pockets[i].ball.id);
      if (sfx && sfx.pocket) sfx.pocket();
    }
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
    session.shot.pocketedNine = session.shot.pocketed.indexOf('b9') !== -1;
  }

  function resolvePocket(session) {
    session.phase = fsm.PHASE.ResolvePocket;
    session.resolution = fsm.classify(session.shot);
    if (fsm.skipsStarMultiplier(session.resolution)) {
      return concludeShot(session, false);
    }
    session.phase = fsm.PHASE.WaitCueStop;
    stopDetect.reset(session.stop);
    return session.resolution;
  }

  function enterStarZone(session) {
    session.phase = fsm.PHASE.StarZone;
    return concludeShot(session, true);
  }

  function shotReadyToResolve(session) {
    if (session.shot.scratch) return true;
    if (session.shot.pocketedLowest) return true;
    if (session.shot.pocketedNine) return true;
    return !!session.stop.stopped;
  }

  function update(session, dt) {
    fx.step(session.particles, dt);
    if (session.toast) {
      session.toast.life -= dt;
      if (session.toast.life <= 0) session.toast = null;
    }
    if (session.room && session.phase !== fsm.PHASE.Splash) {
      session.syncAcc += dt;
      var pollSec = ((roomApi.configOf && roomApi.configOf().pollMs) || 450) / 1000;
      if (session.syncAcc > pollSec) {
        session.syncAcc = 0;
        pullRoom(session);
        if (session.phase === fsm.PHASE.Aim) guardObjectBalls(session);
      }
    }
    if (session.phase === fsm.PHASE.Aim) {
      // P0-A: freeze the table while aiming / charging. Never step physics.
      balls.haltBalls(session.balls);
      guardObjectBalls(session);
      if (session.cue.dragging) pushAim(session);
      return;
    }
    if (session.phase === fsm.PHASE.Shot) {
      var shotEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, shotEv);
      stopDetect.tick(
        session.stop,
        physics.anyMoving(session.balls, session.config.stopSpeed),
        dt,
        session.config.stopHoldMs
      );
      if (shotReadyToResolve(session)) resolvePocket(session);
      return;
    }
    if (session.phase === fsm.PHASE.WaitCueStop) {
      var waitEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, waitEv);
      if (session.shot.scratch) {
        session.resolution = fsm.classify(session.shot);
        concludeShot(session, false);
        return;
      }
      var cueBall = findCue(session);
      var cueMoving = cueBall && physics.hypot(cueBall.vx, cueBall.vy) >= (session.config.stopSpeed || 10);
      stopDetect.tick(session.stop, !!cueMoving, dt, session.config.stopHoldMs);
      if (session.stop.stopped) {
        if (session.settleIn <= 0) session.settleIn = session.config.settleDelayMs || 240;
      }
      if (session.settleIn > 0) {
        session.settleIn -= dt * 1000;
        if (session.settleIn <= 0) enterStarZone(session);
      }
    }
  }

  function roomIdentity(session, fallbackNick) {
    return {
      nick: session.nick || fallbackNick || '',
      openId: session.openId || undefined
    };
  }

  function joinFailToast(res) {
    var reason = res && res.reason;
    if (reason === 'full') return '房间已满';
    if (reason === 'ended' || reason === 'match-over') return '对局已结束';
    if (reason === 'missing' || reason === 'bad-roomId') return '房间无效';
    if (reason === 'cloud-fail' || reason === 'http-fail') return '加入失败';
    return '加入失败';
  }

  function attachHostRoom(session, made) {
    session.versus = true;
    session.hotseat = true;
    session.mySeat = 0;
    session.turn = 0;
    session.scores = [0, 0];
    session.stars = { host: 0, guest: 0 };
    session.role = 'host';
    session.room = {
      roomId: made.roomId,
      guestJoined: false,
      token: made.token,
      role: 'host',
      lastSeq: made.state ? (made.state.shotSeq != null ? made.state.shotSeq : made.state.seq) : 0,
      lastBallsSeq: made.state && made.state.ballsSeq != null ? made.state.ballsSeq : 0,
      firedSeq: null,
      replaySeq: null,
      impulseSent: false
    };
    session.roomPanel = {
      roomId: made.roomId,
      hint: '分享给好友，加入后同步台面。第二页打开 ?roomId=' + made.roomId
    };
    if (made.state) {
      applyRoomState(session, made.state, { join: true });
      if (shouldStartRemoteReplay(session, made.state)) startRemoteReplay(session, made.state);
    }
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    session.joiningRoomId = null;
    session.toast = { text: '房间 ' + made.roomId, life: 1.8 };
    return { kind: 'room', roomId: made.roomId, seat: 0, token: made.token };
  }

  function createRoom(session) {
    if (session.room && session.room.roomId) {
      session.roomPanel = {
        roomId: session.room.roomId,
        hint: session.room.guestJoined
          ? '好友已加入 · 轮流击球'
          : '分享给好友，加入后同步台面。第二页打开 ?roomId=' + session.room.roomId
      };
      session.toast = { text: '房间 ' + session.room.roomId, life: 1.4 };
      return { kind: 'room', roomId: session.room.roomId, existing: true };
    }
    var felt = session.table && session.table.felt;
    var ident = roomIdentity(session, '房主');
    var made = roomApi.create({
      balls: roomApi.snapshotBalls(session.balls, felt),
      scores: [0, 0],
      targetN: session.target ? session.target.n : 1,
      nick: ident.nick,
      openId: ident.openId
    }, function (res) {
      if (res && res.ok && res.roomId && !(session.room && session.room.roomId)) {
        attachHostRoom(session, res);
        return;
      }
      if (res && !res.ok && !(session.room && session.room.roomId)) {
        session.toast = { text: '开房间失败', life: 1.6 };
      }
    });
    if (made && made.ok && made.roomId) return attachHostRoom(session, made);
    if (made && made.pending) {
      session.toast = { text: '正在开房间…', life: 1.4 };
      return { kind: 'room-pending' };
    }
    session.toast = { text: '开房间失败', life: 1.4 };
    return { kind: 'room-fail' };
  }

  function attachGuestRoom(session, joined, roomId) {
    session.versus = true;
    session.hotseat = false;
    session.mySeat = joined.seat != null ? joined.seat : 1;
    session.role = joined.role || 'guest';
    session.room = {
      roomId: joined.roomId,
      guestJoined: true,
      token: joined.token,
      role: session.role,
      lastSeq: joined.state
        ? (joined.state.shotSeq != null ? joined.state.shotSeq : joined.state.seq)
        : 0,
      lastBallsSeq: joined.state && joined.state.ballsSeq != null ? joined.state.ballsSeq : 0,
      firedSeq: null,
      replaySeq: null,
      impulseSent: false
    };
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    if (joined.state) {
      applyRoomState(session, joined.state, { join: true, forceBalls: true });
      if (shouldStartRemoteReplay(session, joined.state)) startRemoteReplay(session, joined.state);
    }
    session.joiningRoomId = null;
    session.toast = { text: '已加入 ' + roomId, life: 1.4 };
    return { kind: 'join', roomId: joined.roomId, seat: joined.seat };
  }

  function attachJoined(session, joined, roomId) {
    if (joined && (joined.role === 'host' || joined.seat === 0)) {
      return attachHostRoom(session, joined);
    }
    return attachGuestRoom(session, joined, roomId);
  }

  function joinRoom(session, roomId) {
    var ident = roomIdentity(session, '好友');
    var payload = {
      roomId: roomId,
      nick: ident.nick,
      openId: ident.openId
    };
    session.joiningRoomId = roomId;
    var joined = roomApi.join(payload, function (res) {
      if (res && res.ok) {
        var already = session.room && session.room.roomId === (res.roomId || roomId) &&
          session.mySeat === (res.seat != null ? res.seat : 1);
        if (!already) attachJoined(session, res, roomId);
        else session.joiningRoomId = null;
        return;
      }
      session.joiningRoomId = null;
      session.toast = { text: joinFailToast(res), life: 1.8 };
    });
    if (joined && joined.ok) return attachJoined(session, joined, roomId);
    if (joined && joined.pending) {
      session.toast = { text: '正在加入…', life: 1.4 };
      return { kind: 'join-pending', roomId: roomId };
    }
    session.joiningRoomId = null;
    session.toast = { text: joinFailToast(joined), life: 1.8 };
    return { kind: 'join-fail', roomId: roomId, reason: joined && joined.reason };
  }

  function inviteRoom(session) {
    if (!session.room || !session.room.roomId) return createRoom(session);
    session.roomPanel = {
      roomId: session.room.roomId,
      hint: session.room.guestJoined
        ? '好友已加入 · 轮流击球'
        : '分享给好友，加入后同步台面。第二页打开 ?roomId=' + session.room.roomId
    };
    session.lastShare = share.shareRoom(session.room.roomId);
    session.toast = { text: '邀请房间 ' + session.room.roomId, life: 1.6 };
    return { kind: 'invite', payload: session.lastShare, roomId: session.room.roomId };
  }

  function handleRoomTap(session) {
    if (session.room && session.room.roomId) return inviteRoom(session);
    return createRoom(session);
  }

  function handlePointerDown(session, x, y) {
    var hit = hud.hitTest(session.ui, x, y, session.phase, session);
    session.pressed = hit;
    if (hit === 'room-close') {
      session.roomPanel = null;
      return { kind: 'room-close' };
    }
    if (hit === 'rerack') {
      newGame(session);
      return { kind: 'rerack' };
    }
    if (session.roomPanel && hit !== 'room-close' && hit !== 'room') {
      return { kind: 'room-block' };
    }
    if (hit === 'room') return handleRoomTap(session);
    if (session.phase === fsm.PHASE.Splash) {
      session.phase = fsm.PHASE.Aim;
      return { kind: 'start' };
    }
    if (hit === 'aim3d') {
      toggleAim3d(session);
      return { kind: 'aim3d', aim3d: session.aim3d, viewMode: session.viewMode };
    }
    if (hit === 'ai' && session.phase === fsm.PHASE.Aim) {
      return fireAi(session);
    }
    if (session.phase === fsm.PHASE.Settle) {
      if (hit === 'replay') {
        newGame(session);
        return { kind: 'replay' };
      }
      if (hit === 'share') {
        session.lastShare = share.share(session.settle, session.best);
        session.toast = { text: '已生成成绩分享', life: 1.4 };
        return { kind: 'share', payload: session.lastShare };
      }
      return { kind: 'blocked' };
    }
    if (session.phase === fsm.PHASE.Aim) {
      if (!canAim(session)) {
        session.toast = { text: '对方击球', life: 1.1 };
        return { kind: 'wait-turn' };
      }
      var cueBall = findCue(session);
      if (cue.inGrab(cueBall, x, y, session.config.grabSlopPx) ||
          table.contains(session.table.felt, x, y)) {
        cue.beginDrag(session.cue, x, y, cueBall, dragBounds(session));
        refreshPreview(session);
        guardObjectBalls(session);
        return { kind: 'aim' };
      }
    }
    return { kind: 'none' };
  }

  function handlePointerMove(session, x, y) {
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    cue.moveDrag(session.cue, x, y, findCue(session), dragBounds(session));
    refreshPreview(session);
    guardObjectBalls(session);
    pushAim(session);
    return { kind: 'aim' };
  }

  function handlePointerUp(session, x, y) {
    session.pressed = null;
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    var shot = cue.endDrag(session.cue, session.config);
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (!shot.fired) return { kind: 'cancel' };
    if (!canAim(session)) return { kind: 'wait-turn' };
    guardObjectBalls(session);
    session.lastShotInput = {
      aimAngle: shot.angle,
      power: shot.power,
      spin: shot.spin || 0
    };
    var cueBall = findCue(session);
    cueBall.vx = shot.vx;
    cueBall.vy = shot.vy;
    session.phase = fsm.PHASE.Shot;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    if (sfx && sfx.cue) sfx.cue();
    pushImpulse(session);
    return { kind: 'fire', power: shot.power, phase: session.phase };
  }

  function fireAi(session) {
    if (session.phase !== fsm.PHASE.Aim) return { kind: 'none' };
    if (!canAim(session)) {
      session.toast = { text: '对方击球', life: 1.1 };
      return { kind: 'wait-turn' };
    }
    var cueBall = findCue(session);
    var target = session.target;
    var plan = ai.plan(cueBall, target, session.config);
    if (!plan.ok) {
      session.toast = { text: '弱AI无目标', life: 1.2 };
      return { kind: 'ai-skip' };
    }
    guardObjectBalls(session);
    session.lastShotInput = {
      aimAngle: Math.atan2(plan.vy, plan.vx),
      power: plan.power,
      spin: 0
    };
    cueBall.vx = plan.vx;
    cueBall.vy = plan.vy;
    session.phase = fsm.PHASE.Shot;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (sfx && sfx.cue) sfx.cue();
    session.toast = { text: '弱AI试杆', life: 1.0 };
    pushImpulse(session);
    return { kind: 'ai', power: plan.power, phase: session.phase };
  }

  function toggleAim3d(session) {
    session.aim3d = !session.aim3d;
    session.viewMode = 'top';
    session.toast = {
      text: session.aim3d ? '瞄准3D 占位' : '俯视瞄准',
      life: 1.2
    };
    return session.aim3d;
  }

  function getDebugState(session) {
    var cueBall = findCue(session);
    return {
      phase: session.phase,
      viewMode: session.viewMode,
      aim3d: session.aim3d,
      best: session.best,
      skinProgress: session.skinProgress,
      power: session.cue.power,
      dragging: session.cue.dragging,
      previewPoints: session.preview.points.length,
      previewBounces: session.preview.bounces,
      target: session.target ? session.target.n : 0,
      cue: cueBall ? { x: cueBall.x, y: cueBall.y, vx: cueBall.vx, vy: cueBall.vy, pocketed: cueBall.pocketed } : null,
      cushions: session.shot.cushions,
      pocketed: session.shot.pocketed.slice(),
      resolution: session.resolution,
      award: session.award,
      settle: session.settle,
      turn: session.turn,
      versus: session.versus,
      roomId: session.room ? session.room.roomId : null,
      winner: session.winner,
      scores: session.scores.slice(),
      stars: session.stars
        ? { host: session.stars.host || 0, guest: session.stars.guest || 0 }
        : { host: 0, guest: 0 },
      pocketScore: session.pocketScore,
      zoneBonus: session.zoneBonus,
      landFlash: session.landFlash
        ? { tileId: session.landFlash.tileId, frames: session.landFlash.frames }
        : null
    };
  }

  function debugForceStop(session, opts) {
    opts = opts || {};
    var cueBall = findCue(session);
    var target = session.target;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      session.balls[i].vx = 0;
      session.balls[i].vy = 0;
    }
    if (opts.scratch) {
      cueBall.pocketed = true;
    }
    if (opts.pocketTarget && target) {
      target.pocketed = true;
      session.shot.pocketed.push(target.id);
      if (!opts.whiff && opts.firstContact !== false) {
        session.shot.firstContactId = target.id;
      }
    }
    if (opts.pocketNine) {
      var nine = balls.findByN(session.balls, 9);
      if (nine) {
        nine.pocketed = true;
        session.shot.pocketed.push(nine.id);
      }
    }
    if (opts.cushions != null) session.shot.cushions = opts.cushions;
    if (opts.firstContact === true && target) session.shot.firstContactId = target.id;
    if (opts.firstContact === false) session.shot.firstContactId = 'b9';
    if (opts.whiff) session.shot.firstContactId = null;
    if (opts.x != null) cueBall.x = opts.x;
    if (opts.y != null) cueBall.y = opts.y;
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
    session.shot.pocketedNine = session.shot.pocketed.indexOf('b9') !== -1;
    session.stop.stopped = true;
    resolvePocket(session);
    if (session.phase === fsm.PHASE.WaitCueStop) enterStarZone(session);
    return session.settle || session.award;
  }

  return {
    create: create,
    update: update,
    render: function (session, ctx) { render.draw(session, ctx); },
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    resize: resize,
    restart: newGame,
    newGame: newGame,
    rack: rack,
    continueShot: continueShot,
    createRoom: createRoom,
    joinRoom: joinRoom,
    inviteRoom: inviteRoom,
    pullRoom: pullRoom,
    pushRoom: pushRoom,
    pushImpulse: pushImpulse,
    pushAim: pushAim,
    startRemoteReplay: startRemoteReplay,
    pickImpulse: pickImpulse,
    canAim: canAim,
    ingestState: ingestState,
    applyRoomState: applyRoomState,
    lockObjectBalls: lockObjectBalls,
    toggleAim3d: toggleAim3d,
    fireAi: fireAi,
    resolvePocket: resolvePocket,
    enterStarZone: enterStarZone,
    finishSettle: finishSettle,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound,
    PHASE: fsm.PHASE
  };
});
