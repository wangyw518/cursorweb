(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.XingchenPhysics,
    typeof require === 'function' ? require('./table') : root.XingchenTable,
    typeof require === 'function' ? require('./obstacles') : root.XingchenObstacles,
    typeof require === 'function' ? require('./scoreRings') : root.XingchenScoreRings,
    typeof require === 'function' ? require('./launcher') : root.XingchenLauncher,
    typeof require === 'function' ? require('./stopDetect') : root.XingchenStopDetect,
    typeof require === 'function' ? require('./score') : root.XingchenScore,
    typeof require === 'function' ? require('./hud') : root.XingchenHud,
    typeof require === 'function' ? require('./fx') : root.XingchenFx,
    typeof require === 'function' ? require('./storage') : root.XingchenStorage
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  physics,
  table,
  obstacles,
  scoreRings,
  launcher,
  stopDetect,
  score,
  hud,
  fx,
  storage
) {
  'use strict';

  function buildWorld(viewport, config) {
    var ui = hud.layout(viewport);
    var board = table.layout(viewport, config, ui.playRect);
    var rocks = obstacles.create(board, config);
    var rings = scoreRings.create(board, config);
    var gun = launcher.create(board.dock, config);
    var ball = launcher.restBall(gun, config.ballRadius || 9);
    return {
      ui: ui,
      table: board,
      obstacles: rocks,
      rings: rings,
      launcher: gun,
      ball: ball,
      dust: fx.makeDust(board.bounds, 52)
    };
  }

  function create(viewport, config) {
    var saved = storage.load();
    var world = buildWorld(viewport, config);
    var session = {
      viewport: viewport,
      config: config,
      ui: world.ui,
      table: world.table,
      obstacles: world.obstacles,
      rings: world.rings,
      launcher: world.launcher,
      ball: world.ball,
      dust: world.dust,
      stop: stopDetect.create(),
      phase: 'aim',
      now: 0,
      best: saved && saved.best ? saved.best : 0,
      award: null,
      settle: null,
      settleIn: 0,
      particles: [],
      popups: [],
      toast: null,
      flash: 0,
      flashRing: null,
      flashFrames: 0,
      pendingBurst: null,
      preview: { points: [], bounces: 0 },
      pressed: null,
      pressedLeft: 0,
      lastHit: false
    };
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render(session, ctx); };
    session.handlePointerDown = function (x, y) { return handlePointerDown(session, x, y); };
    session.handlePointerMove = function (x, y) { return handlePointerMove(session, x, y); };
    session.handlePointerUp = function (x, y) { return handlePointerUp(session, x, y); };
    session.resize = function (next) { resize(session, next); };
    session.restart = function () { return restart(session); };
    return session;
  }

  function worldOf(session) {
    return {
      ball: session.ball,
      walls: session.table.walls,
      obstacles: session.obstacles
    };
  }

  function refreshPreview(session) {
    if (!session.launcher.dragging || session.launcher.power < 0.04) {
      session.preview = { points: [], bounces: 0 };
      return session.preview;
    }
    session.preview = physics.preview(
      session.ball,
      session.launcher.ax,
      session.launcher.ay,
      worldOf(session),
      session.config
    );
    return session.preview;
  }

  function resize(session, viewport) {
    session.viewport = viewport;
    if (session.phase === 'settle') {
      session.ui = hud.layout(viewport);
      return;
    }
    var world = buildWorld(viewport, session.config);
    session.ui = world.ui;
    session.table = world.table;
    session.obstacles = world.obstacles;
    session.rings = world.rings;
    session.launcher = world.launcher;
    session.ball = world.ball;
    session.dust = world.dust;
    session.phase = 'aim';
    stopDetect.reset(session.stop);
    session.preview = { points: [], bounces: 0 };
  }

  function restart(session) {
    var saved = storage.load();
    var world = buildWorld(session.viewport, session.config);
    session.ui = world.ui;
    session.table = world.table;
    session.obstacles = world.obstacles;
    session.rings = world.rings;
    session.launcher = world.launcher;
    session.ball = world.ball;
    session.dust = world.dust;
    stopDetect.reset(session.stop);
    session.phase = 'aim';
    session.now = 0;
    session.best = saved && saved.best ? saved.best : 0;
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.particles = [];
    session.popups = [];
    session.toast = null;
    session.flash = 0;
    session.flashRing = null;
    session.flashFrames = 0;
    session.pendingBurst = null;
    session.preview = { points: [], bounces: 0 };
    session.pressed = null;
    return { kind: 'restart' };
  }

  function emitScoreFx(session, award) {
    var x = session.ball.x;
    var y = session.ball.y;
    var hex = award.oob
      ? (session.config.colors.ringPurple || '#C084FC')
      : (award.ring ? fx.ringHex(award.ring, session.config.colors) : session.config.colors.scorePop);
    session.flashRing = award.ring || null;
    session.flashFrames = 1;
    session.flash = award.oob ? 0.18 : 0.28;
    session.pendingBurst = { x: x, y: y, hex: hex };
    session.popups = [{
      x: x,
      y: y - 16,
      text: award.oob ? '0' : (award.edge ? '+' + award.score + ' 擦边' : '+' + award.score),
      life: 1,
      hex: hex
    }];
    if (award.oob) {
      session.toast = { text: '偏离星表', ttl: 1.1, hex: session.config.colors.ringPurple };
    } else if (award.edge) {
      session.toast = { text: '擦边 ×1.2', ttl: 0.9, hex: session.config.colors.aim };
    } else if (!award.miss && award.score > 0) {
      var names = session.config.tierNames || [];
      session.toast = {
        text: (names[award.tier] || '') + '  +' + award.score,
        ttl: 0.9,
        hex: hex
      };
    }
  }

  function pushBurst(session) {
    if (!session.pendingBurst) return;
    var pending = session.pendingBurst;
    session.pendingBurst = null;
    var burst = fx.spawnBurst(pending.x, pending.y, session.config, pending.hex, { kind: 'center' });
    var cap = session.config.burstParticleCap || 64;
    var i;
    for (i = 0; i < burst.length; i++) {
      if (session.particles.length >= cap) session.particles.shift();
      session.particles.push(burst[i]);
    }
  }

  function finishFlight(session, award) {
    session.award = award;
    session.ball.vx = 0;
    session.ball.vy = 0;
    emitScoreFx(session, award);
    var prevBest = storage.load().best || 0;
    var isNew = award.score > prevBest;
    var best = isNew ? award.score : prevBest;
    if (isNew) storage.save({ best: award.score });
    session.best = best;
    session.settle = {
      score: award.score,
      best: best,
      gap: isNew ? 0 : prevBest - award.score,
      isNew: isNew,
      oob: !!award.oob,
      edge: !!award.edge,
      tier: award.tier,
      miss: !!award.miss
    };
    session.settleIn = (session.config.settleDelayMs || 280) / 1000;
    session.phase = 'scored';
    return session.settle;
  }

  function settleNow(session, award) {
    if (session.phase === 'settle' || session.phase === 'scored') return session.settle;
    return finishFlight(session, award || score.outOfBounds());
  }

  function handlePointerDown(session, x, y) {
    var action = hud.hitTest(session.ui, x, y, session.phase === 'scored' ? 'settle' : session.phase);
    if (session.phase === 'settle' || session.phase === 'scored') {
      if (action === 'replay' && session.phase === 'settle') {
        session.pressed = 'replay';
        session.pressedLeft = 0.12;
        return restart(session);
      }
      return { kind: 'settle-block' };
    }
    if (session.phase !== 'aim') return { kind: 'busy' };
    var onTable = table.contains(session.table.bounds, x, y);
    var grabbed = launcher.inGrab(
      session.launcher,
      x,
      y,
      session.ball,
      session.config.grabSlopPx
    );
    if (!grabbed && !onTable) {
      return { kind: 'miss-grab' };
    }
    launcher.beginDrag(session.launcher, x, y, session.ball);
    session.phase = 'charging';
    refreshPreview(session);
    return { kind: 'charge', power: session.launcher.power, angle: session.launcher.angle };
  }

  function handlePointerMove(session, x, y) {
    if (session.phase !== 'charging') return { kind: 'idle' };
    launcher.moveDrag(session.launcher, x, y, session.ball);
    refreshPreview(session);
    return { kind: 'aim', power: session.launcher.power, angle: session.launcher.angle };
  }

  function handlePointerUp(session, x, y) {
    if (session.phase !== 'charging') return { kind: 'idle' };
    if (x != null && y != null) launcher.moveDrag(session.launcher, x, y, session.ball);
    var shot = launcher.endDrag(session.launcher, session.config);
    session.preview = { points: [], bounces: 0 };
    if (!shot.fired) {
      session.phase = 'aim';
      return { kind: 'cancel', power: shot.power };
    }
    session.ball.vx = shot.vx;
    session.ball.vy = shot.vy;
    stopDetect.reset(session.stop);
    session.phase = 'flight';
    return { kind: 'fire', power: shot.power, angle: shot.angle, vx: shot.vx, vy: shot.vy };
  }

  function updateParticles(session, dt) {
    var next = [];
    var i;
    for (i = 0; i < session.particles.length; i++) {
      var p = session.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > 0) next.push(p);
    }
    session.particles = next;
  }

  function updatePopups(session, dt) {
    var next = [];
    var i;
    for (i = 0; i < session.popups.length; i++) {
      var p = session.popups[i];
      p.life -= dt * 0.85;
      p.y -= 20 * dt;
      if (p.life > 0) next.push(p);
    }
    session.popups = next;
  }

  function update(session, dt) {
    session.now += dt;
    if (session.flashFrames > 0) {
      session.flashFrames -= 1;
      if (session.flashFrames <= 0) {
        pushBurst(session);
        session.flashRing = null;
      }
    }
    if (session.flash > 0 && session.flashFrames <= 0) {
      session.flash = Math.max(0, session.flash - dt * 2.6);
    }
    updateParticles(session, dt);
    updatePopups(session, dt);
    if (session.toast) {
      session.toast.ttl -= dt;
      if (session.toast.ttl <= 0) session.toast = null;
    }
    if (session.pressedLeft > 0) {
      session.pressedLeft -= dt;
      if (session.pressedLeft <= 0) session.pressed = null;
    }

    if (session.phase === 'scored') {
      session.settleIn -= dt;
      if (session.settleIn <= 0) session.phase = 'settle';
      return;
    }

    if (session.phase !== 'flight') return;

    var result = physics.step(worldOf(session), dt, session.config);
    session.lastHit = !!result.hit;

    if (table.isOutOfBounds(session.table.bounds, session.ball.x, session.ball.y)) {
      finishFlight(session, score.outOfBounds());
      return;
    }

    var spd = stopDetect.speedOf(session.ball);
    stopDetect.tick(session.stop, spd, dt, session.config.stopSpeed, session.config.stopHoldMs);
    if (stopDetect.isStopped(session.stop)) {
      var pick = scoreRings.pick(
        session.rings,
        session.ball.x,
        session.ball.y,
        session.config.edgePx
      );
      finishFlight(session, score.fromPick(pick, session.config));
    }
  }

  function render(session, ctx) {
    var vp = session.viewport;
    var colors = session.config.colors;
    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawTable(ctx, session.table, colors);
    fx.drawDust(ctx, session.dust);
    fx.drawVoids(ctx, session.table, colors);
    fx.drawWalls(ctx, session.table.walls, colors);
    fx.drawRings(ctx, session.rings, colors, session.flashRing);
    fx.drawObstacles(ctx, session.obstacles, colors);
    fx.drawLauncher(ctx, session.launcher, colors);
    if (session.phase === 'charging') {
      fx.drawPreview(ctx, session.preview.points, colors);
      fx.drawAim(ctx, session.ball, session.launcher, colors);
    }
    var pulse = session.phase === 'aim' ? 1 + Math.sin(session.now * 3.2) * 0.04 : 1;
    fx.drawBall(ctx, session.ball, colors, pulse);
    fx.drawParticles(ctx, session.particles);
    var i;
    for (i = 0; i < session.popups.length; i++) fx.drawPopup(ctx, session.popups[i]);
    if (session.flashFrames > 0) {
      fx.drawFlash(ctx, vp.width, vp.height, session.flash || 0.22, '#FFFFFF');
    }
    hud.draw(ctx, session.ui, {
      phase: session.phase === 'scored' ? 'flight' : session.phase,
      best: session.best,
      charging: session.phase === 'charging',
      power: session.launcher.power,
      hint: hud.hintFor(
        session.phase === 'scored' ? 'flight' : session.phase,
        session.phase === 'charging'
      ),
      toast: session.toast,
      settle: session.settle,
      pressed: session.pressed
    }, colors, vp);
  }

  function getDebugState(session) {
    return {
      phase: session.phase,
      ball: { x: session.ball.x, y: session.ball.y, vx: session.ball.vx, vy: session.ball.vy, r: session.ball.r },
      power: session.launcher.power,
      angle: session.launcher.angle,
      dragging: session.launcher.dragging,
      previewBounces: session.preview.bounces,
      previewPoints: session.preview.points.length,
      award: session.award,
      settle: session.settle,
      best: session.best,
      flashFrames: session.flashFrames,
      particleCount: session.particles.length,
      stop: { holdMs: session.stop.holdMs, stopped: session.stop.stopped }
    };
  }

  function debugPlace(session, x, y, vx, vy) {
    session.ball.x = x;
    session.ball.y = y;
    session.ball.vx = vx || 0;
    session.ball.vy = vy || 0;
    session.phase = 'flight';
    stopDetect.reset(session.stop);
    session.award = null;
    session.settle = null;
    return session;
  }

  function debugFire(session, vx, vy) {
    session.ball.vx = vx;
    session.ball.vy = vy;
    session.phase = 'flight';
    stopDetect.reset(session.stop);
    return session;
  }

  return {
    create: create,
    resize: resize,
    update: update,
    render: render,
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    restart: restart,
    settleNow: settleNow,
    getDebugState: getDebugState,
    debugPlace: debugPlace,
    debugFire: debugFire,
    worldOf: worldOf
  };
});
