(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.TaiqiuPhysics,
    typeof require === 'function' ? require('./table') : root.TaiqiuTable,
    typeof require === 'function' ? require('./tiles') : root.TaiqiuTiles,
    typeof require === 'function' ? require('./balls') : root.TaiqiuBalls,
    typeof require === 'function' ? require('./cue') : root.TaiqiuCue,
    typeof require === 'function' ? require('./stopDetect') : root.TaiqiuStopDetect,
    typeof require === 'function' ? require('./score') : root.TaiqiuScore,
    typeof require === 'function' ? require('./hud') : root.TaiqiuHud,
    typeof require === 'function' ? require('./fx') : root.TaiqiuFx,
    typeof require === 'function' ? require('./storage') : root.TaiqiuStorage,
    typeof require === 'function' ? require('./render') : root.TaiqiuRender
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  physics,
  table,
  tiles,
  balls,
  cue,
  stopDetect,
  score,
  hud,
  fx,
  storage,
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
    session.phase = 'aim';
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.shot = {
      cushions: 0,
      pocketed: [],
      firstContactId: null,
      targetId: null
    };
    session.particles = [];
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
  }

  function create(viewport, config) {
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      ui: hud.layout(viewport),
      viewMode: '2d',
      phase: 'aim',
      best: saved.best || 0,
      skinProgress: saved.skinProgress || 0,
      award: null,
      settle: null,
      settleIn: 0,
      particles: [],
      pressed: null,
      preview: { points: [], ghost: null, bounces: 0 },
      shot: { cushions: 0, pocketed: [], firstContactId: null, targetId: null }
    };
    resetRound(session);
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
    if (session.phase === 'settle') return;
    resetRound(session);
  }

  function restart(session) {
    resetRound(session);
    return { kind: 'restart' };
  }

  function toggleView(session) {
    session.viewMode = session.viewMode === '2d' ? '3d' : '2d';
    return session.viewMode;
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
  }

  function finishShot(session) {
    var cueBall = findCue(session);
    var scratch = !!(cueBall && cueBall.pocketed);
    var targetId = session.shot.targetId;
    var pocketedLowest = targetId ? session.shot.pocketed.indexOf(targetId) !== -1 : false;
    var zone = null;
    if (cueBall && !scratch) {
      zone = tiles.pickAt(session.tiles, cueBall.x, cueBall.y);
    }
    var award = score.settle({
      pocketedLowest: pocketedLowest,
      scratch: scratch,
      cushions: session.shot.cushions,
      zone: zone,
      firstContactIsTarget: session.shot.firstContactId === targetId
    }, session.config);

    session.award = award;
    session.skinProgress += award.skinProgress || 0;
    var gap = score.gapToBest(award.points, session.best);
    if (gap.isNew) session.best = award.points;
    persist(session);

    session.settle = {
      points: award.points,
      reason: award.reason,
      legal: award.legal,
      zoneLabel: award.zoneLabel,
      quality: award.quality,
      props: award.props,
      skinProgress: award.skinProgress,
      disclaimer: award.disclaimer,
      gap: gap.gap,
      isNew: gap.isNew,
      best: session.best
    };
    session.phase = 'settle';

    var burstX = cueBall ? cueBall.x : session.table.felt.cx;
    var burstY = cueBall ? cueBall.y : session.table.felt.cy;
    fx.spawnBurst(
      session.particles,
      burstX,
      burstY,
      award.legal ? session.config.colors.scorePop : '#94A3B8',
      award.legal ? 22 : 10
    );
    return session.settle;
  }

  function update(session, dt) {
    fx.step(session.particles, dt);
    if (session.phase === 'rolling') {
      var events = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, events);
      var moving = physics.anyMoving(session.balls, session.config.stopSpeed);
      stopDetect.tick(session.stop, moving, dt, session.config.stopHoldMs);
      if (session.stop.stopped) {
        if (session.settleIn <= 0) session.settleIn = session.config.settleDelayMs || 320;
      }
      if (session.settleIn > 0) {
        session.settleIn -= dt * 1000;
        if (session.settleIn <= 0) finishShot(session);
      }
    }
  }

  function handlePointerDown(session, x, y) {
    var hit = hud.hitTest(session.ui, x, y, session.phase);
    session.pressed = hit;
    if (hit === 'mode') {
      toggleView(session);
      return { kind: 'mode', viewMode: session.viewMode };
    }
    if (session.phase === 'settle') {
      if (hit === 'replay') {
        restart(session);
        return { kind: 'replay' };
      }
      return { kind: 'blocked' };
    }
    if (session.phase === 'aim') {
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
    if (session.phase !== 'aim' || !session.cue.dragging) return { kind: 'none' };
    cue.moveDrag(session.cue, x, y, findCue(session));
    refreshPreview(session);
    return { kind: 'aim' };
  }

  function handlePointerUp(session, x, y) {
    session.pressed = null;
    if (session.phase !== 'aim' || !session.cue.dragging) return { kind: 'none' };
    var shot = cue.endDrag(session.cue, session.config);
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (!shot.fired) return { kind: 'cancel' };
    var cueBall = findCue(session);
    cueBall.vx = shot.vx;
    cueBall.vy = shot.vy;
    session.phase = 'rolling';
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    return { kind: 'fire', power: shot.power };
  }

  function getDebugState(session) {
    var cueBall = findCue(session);
    return {
      phase: session.phase,
      viewMode: session.viewMode,
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
      award: session.award,
      settle: session.settle
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
    }
    if (opts.cushions != null) session.shot.cushions = opts.cushions;
    if (opts.firstContact === true && target) session.shot.firstContactId = target.id;
    if (opts.x != null) cueBall.x = opts.x;
    if (opts.y != null) cueBall.y = opts.y;
    session.stop.stopped = true;
    return finishShot(session);
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
    toggleView: toggleView,
    finishShot: finishShot,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound
  };
});
