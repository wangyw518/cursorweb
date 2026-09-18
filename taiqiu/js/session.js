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
    typeof require === 'function' ? require('./render') : root.TaiqiuRender
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
  render
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
      pockets: session.table.pockets
    };
  }

  function findCue(session) {
    return balls.cueBall(session.balls);
  }

  function refreshTarget(session) {
    session.target = balls.lowestNumbered(session.balls);
    return session.target;
  }

  function refreshPreview(session) {
    var cueBall = findCue(session);
    if (!session.cue.dragging || session.cue.power < 0.04 || !cueBall) {
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
    return session.preview;
  }

  function resetRound(session) {
    session.table = table.layout(session.viewport, session.config, session.ui.playRect);
    session.tiles = tiles.create(session.table, session.config);
    session.balls = balls.create(session.table, session.config);
    session.cue = cue.create(session.config);
    session.stop = stopDetect.create();
    session.phase = session.skipSplash ? fsm.PHASE.Aim : fsm.PHASE.Aim;
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.resolution = null;
    session.shot = {
      cushions: 0,
      pocketed: [],
      firstContactId: null,
      targetId: null,
      scratch: false,
      pocketedLowest: false
    };
    session.particles = [];
    session.landFlash = null;
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
  }

  function create(viewport, config, opts) {
    opts = opts || {};
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
      shot: { cushions: 0, pocketed: [], firstContactId: null, targetId: null, scratch: false, pocketedLowest: false }
    };
    resetRound(session);
    if (!opts.skipSplash) session.phase = fsm.PHASE.Splash;
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render.draw(session, ctx); };
    session.handlePointerDown = function (x, y) { return handlePointerDown(session, x, y); };
    session.handlePointerMove = function (x, y) { return handlePointerMove(session, x, y); };
    session.handlePointerUp = function (x, y) { return handlePointerUp(session, x, y); };
    session.resize = function (next) { resize(session, next); };
    session.restart = function () { return restart(session); };
    return session;
  }

  function resize(session, viewport) {
    session.viewport = viewport;
    session.ui = hud.layout(viewport);
    if (session.phase === fsm.PHASE.Settle) return;
    resetRound(session);
  }

  function restart(session) {
    resetRound(session);
    return { kind: 'restart' };
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

  function noteContacts(session, events) {
    var cueBall = findCue(session);
    var i;
    for (i = 0; i < events.contacts.length; i++) {
      var c = events.contacts[i];
      if (c.kind === 'cushion' && c.ball && c.ball.id === 'cue') {
        session.shot.cushions += 1;
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
    }
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
  }

  function finishSettle(session, applyStar) {
    var cueBall = findCue(session);
    var landed = null;
    if (applyStar && cueBall && !cueBall.pocketed) {
      landed = tiles.pickAt(session.tiles, cueBall.x, cueBall.y);
    }
    var zone = applyStar && cueBall && !cueBall.pocketed
      ? (landed || tiles.defaultZone())
      : null;
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

    session.settle = {
      coins: award.coins,
      points: award.coins,
      unit: award.unit,
      reason: award.reason,
      legal: award.legal,
      foul: award.foul,
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
    session.landFlash = null;
    if (applyStar && award.legal && !award.foul && landed) {
      session.landFlash = { tileId: landed.id, frames: 1 };
    }

    var burstX = cueBall ? cueBall.x : session.table.felt.cx;
    var burstY = cueBall ? cueBall.y : session.table.felt.cy;
    fx.spawnBurst(
      session.particles,
      burstX,
      burstY,
      award.legal ? session.config.colors.scorePop : '#94A3B8',
      8
    );
    return session.settle;
  }

  function resolvePocket(session) {
    session.phase = fsm.PHASE.ResolvePocket;
    session.resolution = fsm.classify(session.shot);
    if (fsm.skipsStarMultiplier(session.resolution)) {
      return finishSettle(session, false);
    }
    session.phase = fsm.PHASE.WaitCueStop;
    stopDetect.reset(session.stop);
    return session.resolution;
  }

  function enterStarZone(session) {
    session.phase = fsm.PHASE.StarZone;
    return finishSettle(session, true);
  }

  function shotReadyToResolve(session) {
    if (session.shot.scratch) return true;
    if (session.shot.pocketedLowest) return true;
    return !!session.stop.stopped;
  }

  function update(session, dt) {
    fx.step(session.particles, dt);
    if (session.toast) {
      session.toast.life -= dt;
      if (session.toast.life <= 0) session.toast = null;
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
        finishSettle(session, false);
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

  function handlePointerDown(session, x, y) {
    var hit = hud.hitTest(session.ui, x, y, session.phase);
    session.pressed = hit;
    if (session.phase === fsm.PHASE.Splash) {
      session.phase = fsm.PHASE.Aim;
      return { kind: 'start' };
    }
    if (hit === 'aim3d') {
      toggleAim3d(session);
      return { kind: 'aim3d', aim3d: session.aim3d, viewMode: session.viewMode };
    }
    if (session.phase === fsm.PHASE.Settle) {
      if (hit === 'replay') {
        restart(session);
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
      var cueBall = findCue(session);
      if (cue.inGrab(cueBall, x, y, session.config.grabSlopPx) ||
          table.contains(session.table.felt, x, y)) {
        cue.beginDrag(session.cue, x, y, cueBall);
        refreshPreview(session);
        return { kind: 'aim' };
      }
    }
    return { kind: 'none' };
  }

  function handlePointerMove(session, x, y) {
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    cue.moveDrag(session.cue, x, y, findCue(session));
    refreshPreview(session);
    return { kind: 'aim' };
  }

  function handlePointerUp(session, x, y) {
    session.pressed = null;
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    var shot = cue.endDrag(session.cue, session.config);
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (!shot.fired) return { kind: 'cancel' };
    var cueBall = findCue(session);
    cueBall.vx = shot.vx;
    cueBall.vy = shot.vy;
    session.phase = fsm.PHASE.Shot;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    return { kind: 'fire', power: shot.power, phase: session.phase };
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
    session.stop.stopped = true;
    resolvePocket(session);
    if (session.phase === fsm.PHASE.WaitCueStop) enterStarZone(session);
    return session.settle;
  }

  return {
    create: create,
    update: update,
    render: function (session, ctx) { render.draw(session, ctx); },
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    resize: resize,
    restart: restart,
    toggleAim3d: toggleAim3d,
    resolvePocket: resolvePocket,
    enterStarZone: enterStarZone,
    finishSettle: finishSettle,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound,
    PHASE: fsm.PHASE
  };
});
