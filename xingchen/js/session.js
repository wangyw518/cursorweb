(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.XingchenPhysics,
    typeof require === 'function' ? require('./table') : root.XingchenTable,
    typeof require === 'function' ? require('./obstacles') : root.XingchenObstacles,
    typeof require === 'function' ? require('./scoreRings') : root.XingchenScoreRings,
    typeof require === 'function' ? require('./cells') : root.XingchenCells,
    typeof require === 'function' ? require('./targets') : root.XingchenTargets,
    typeof require === 'function' ? require('./skills') : root.XingchenSkills,
    typeof require === 'function' ? require('./stamina') : root.XingchenStamina,
    typeof require === 'function' ? require('./level') : root.XingchenLevel,
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
  cells,
  targets,
  skills,
  stamina,
  level,
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
    var grid = cells.create(board, config);
    var orbs = targets.create(board, config, rocks);
    var gun = launcher.create(board.dock, config);
    var ball = launcher.restBall(gun, config.ballRadius || 9);
    return {
      ui: ui,
      table: board,
      obstacles: rocks,
      rings: rings,
      cells: grid,
      targets: orbs,
      launcher: gun,
      ball: ball,
      dust: fx.makeDust(board.bounds, 52)
    };
  }

  function persistMeta(session) {
    storage.save({ best: session.best, stamina: session.stamina });
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
      cells: world.cells,
      targets: world.targets,
      launcher: world.launcher,
      ball: world.ball,
      balls: [world.ball],
      dust: world.dust,
      stop: stopDetect.create(),
      stops: [stopDetect.create()],
      phase: 'aim',
      now: 0,
      best: saved && saved.best ? saved.best : 0,
      stamina: saved && saved.stamina != null ? saved.stamina : stamina.maxOf(config),
      level: level.create(config),
      skill: null,
      activeSkill: null,
      shotPlan: null,
      shotConfig: config,
      shotBonus: 0,
      shotCommitted: false,
      fireArmed: false,
      modal: null,
      award: null,
      settle: null,
      settleIn: 0,
      particles: [],
      popups: [],
      toast: null,
      flash: 0,
      flashRing: null,
      flashCell: null,
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

  function aliveObstacles(session) {
    return obstacles.alive(session.obstacles);
  }

  function worldOf(session, ball) {
    return {
      ball: ball || session.ball,
      walls: session.table.walls,
      obstacles: aliveObstacles(session)
    };
  }

  function resetCue(session) {
    session.ball = launcher.restBall(session.launcher, session.config.ballRadius || 9);
    session.balls = [session.ball];
    session.stop = stopDetect.create();
    session.stops = [session.stop];
    session.shotPlan = null;
    session.shotConfig = session.config;
    session.shotBonus = 0;
    session.activeSkill = null;
    session.fireArmed = false;
    session.shotCommitted = false;
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

  function restoreBoard(session, keepProgress) {
    var world = buildWorld(session.viewport, session.config);
    session.ui = world.ui;
    session.table = world.table;
    session.obstacles = world.obstacles;
    session.rings = world.rings;
    session.cells = world.cells;
    session.targets = world.targets;
    session.launcher = world.launcher;
    session.dust = world.dust;
    resetCue(session);
    if (!keepProgress) {
      session.level = level.create(session.config);
    }
    session.preview = { points: [], bounces: 0 };
  }

  function resize(session, viewport) {
    session.viewport = viewport;
    if (session.phase === 'settle' || session.modal === 'empty') {
      session.ui = hud.layout(viewport);
      return;
    }
    restoreBoard(session, true);
    session.phase = 'aim';
  }

  function restart(session) {
    var saved = storage.load();
    session.best = saved && saved.best ? saved.best : 0;
    session.stamina = saved && saved.stamina != null ? saved.stamina : stamina.maxOf(session.config);
    restoreBoard(session, false);
    session.phase = session.stamina > 0 ? 'aim' : 'aim';
    session.modal = session.stamina > 0 ? null : 'empty';
    session.now = 0;
    session.skill = null;
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.particles = [];
    session.popups = [];
    session.toast = null;
    session.flash = 0;
    session.flashRing = null;
    session.flashCell = null;
    session.flashFrames = 0;
    session.pendingBurst = null;
    session.pressed = null;
    return { kind: 'restart' };
  }

  function emitScoreFx(session, award) {
    var x = session.ball.x;
    var y = session.ball.y;
    var hex = award.oob
      ? (session.config.colors.ringPurple || '#C084FC')
      : (award.cell
        ? (session.config.colors[award.cell.key] || session.config.colors.scorePop)
        : session.config.colors.scorePop);
    session.flashCell = award.cell || null;
    session.flashRing = award.cell || award.ring || null;
    session.flashFrames = 1;
    session.flash = award.oob ? 0.18 : 0.28;
    session.pendingBurst = { x: x, y: y, hex: hex };
    session.popups = [{
      x: x,
      y: y - 16,
      text: award.oob && award.score === 0 ? '0' : '+' + award.score,
      life: 1,
      hex: hex
    }];
    if (award.oob && award.score === 0) {
      session.toast = { text: '偏离奇境', ttl: 1.1, hex: session.config.colors.ringPurple };
    } else if (award.cell) {
      session.toast = {
        text: award.cell.name + '  +' + award.cellScore + (award.bonus ? '  辉+' + award.bonus : ''),
        ttl: 0.95,
        hex: hex
      };
    } else if (award.bonus) {
      session.toast = { text: '辉球  +' + award.bonus, ttl: 0.9, hex: hex };
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

  function openSettle(session) {
    var prevBest = storage.load().best || 0;
    var isNew = session.level.score > prevBest;
    var best = isNew ? session.level.score : prevBest;
    if (isNew) {
      session.best = best;
      persistMeta(session);
    }
    session.best = best;
    session.settle = {
      score: session.level.score,
      best: best,
      gap: isNew ? 0 : Math.max(0, prevBest - session.level.score),
      isNew: isNew,
      oob: !!(session.award && session.award.oob),
      edge: false,
      tier: session.award ? session.award.tier : -1,
      miss: !!(session.award && session.award.miss),
      won: !!session.level.won,
      target: session.level.target
    };
    session.settleIn = (session.config.settleDelayMs || 280) / 1000;
    session.phase = 'scored';
    return session.settle;
  }

  function finishShot(session, award) {
    session.award = award;
    if (!session.shotCommitted) {
      level.consumeShot(session.level);
    }
    session.shotCommitted = false;
    level.applyScore(session.level, award.score);
    emitScoreFx(session, award);
    if (session.level.over) {
      return openSettle(session);
    }
    session.settle = null;
    session.settleIn = (session.config.settleDelayMs || 280) / 1000;
    session.phase = 'scored';
    return session.award;
  }

  function settleNow(session, award) {
    if (session.phase === 'settle' || session.phase === 'scored') return session.settle;
    var extra = session.shotBonus || 0;
    return finishShot(session, award || score.outOfBounds(extra));
  }

  function applyRestore(session, result) {
    session.stamina = result.stamina;
    persistMeta(session);
    session.pressed = result.kind;
    session.pressedLeft = 0.16;
    session.toast = {
      text: result.kind === 'share' ? '分享助力 +' + result.gained + ' 星力' : '星辉注入 +' + result.gained,
      ttl: 1.1,
      hex: session.config.colors.stamina
    };
    if (session.stamina > 0 && session.modal === 'empty') {
      session.modal = null;
    }
    return result;
  }

  function handleShare(session) {
    stamina.tryPlatformShare();
    return applyRestore(session, stamina.shareAssist(session.stamina, session.config));
  }

  function handleAd(session) {
    stamina.tryPlatformAd();
    return applyRestore(session, stamina.watchAd(session.stamina, session.config));
  }

  function handlePointerDown(session, x, y) {
    var phaseForHit = session.phase === 'scored' ? 'settle' : session.phase;
    var action = hud.hitTest(session.ui, x, y, phaseForHit, session.modal, session.stamina);

    if ((action === 'share' || action === 'ad') && (session.modal === 'empty' || session.stamina <= 0)) {
      return action === 'share' ? handleShare(session) : handleAd(session);
    }

    if (session.modal === 'empty') return { kind: 'empty-block' };

    if (session.phase === 'settle' || session.phase === 'scored') {
      if (action === 'replay' && session.phase === 'settle') {
        if (session.stamina <= 0) {
          session.modal = 'empty';
          return { kind: 'empty' };
        }
        session.pressed = 'replay';
        session.pressedLeft = 0.12;
        return restart(session);
      }
      return { kind: 'settle-block' };
    }

    if (session.phase === 'aim' && action && action.indexOf('skill:') === 0) {
      session.skill = skills.toggle(session.skill, action.slice(6));
      return { kind: 'skill', skill: session.skill };
    }

    if (session.phase !== 'aim') return { kind: 'busy' };

    if (!stamina.canShoot(session.stamina)) {
      session.modal = 'empty';
      return { kind: 'empty' };
    }
    if (session.level.shotsLeft <= 0) {
      return { kind: 'busy' };
    }

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

  function spawnFlightBalls(session, plan, origin) {
    var list = [];
    var stops = [];
    var i;
    for (i = 0; i < plan.balls.length; i++) {
      var spec = plan.balls[i];
      list.push({
        x: origin.x,
        y: origin.y,
        vx: spec.vx,
        vy: spec.vy,
        r: origin.r,
        done: false,
        award: null,
        kind: spec.kind
      });
      stops.push(stopDetect.create());
    }
    session.balls = list;
    session.ball = list[0];
    session.stops = stops;
    session.stop = stops[0];
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
    if (!stamina.canShoot(session.stamina)) {
      session.phase = 'aim';
      session.modal = 'empty';
      return { kind: 'empty' };
    }
    var spent = stamina.spend(session.stamina, session.config);
    session.stamina = spent.stamina;
    persistMeta(session);
    var plan = skills.plan(session.skill, shot, session.config);
    session.shotPlan = plan;
    session.activeSkill = plan.skill;
    session.fireArmed = !!plan.breakOnHit;
    session.shotConfig = skills.shotConfig(session.config, plan.frictionMul);
    session.shotBonus = 0;
    session.shotCommitted = true;
    level.consumeShot(session.level);
    spawnFlightBalls(session, plan, session.ball);
    session.phase = 'flight';
    return { kind: 'fire', power: shot.power, angle: shot.angle, vx: shot.vx, vy: shot.vy, skill: plan.skill };
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

  function collectHits(session, ball) {
    var hits = targets.collect(session.targets, ball);
    var i;
    for (i = 0; i < hits.length; i++) {
      session.shotBonus += hits[i].bonus;
      session.popups.push({
        x: hits[i].x,
        y: hits[i].y - 10,
        text: '+' + hits[i].bonus,
        life: 0.9,
        hex: session.config.colors[hits[i].colorKey] || session.config.colors.scorePop
      });
      var burst = fx.spawnBurst(hits[i].x, hits[i].y, session.config, session.config.colors[hits[i].colorKey], { count: 14 });
      var j;
      for (j = 0; j < burst.length; j++) {
        if (session.particles.length >= (session.config.burstParticleCap || 64)) session.particles.shift();
        session.particles.push(burst[j]);
      }
    }
  }

  function awardForBall(session, ball) {
    if (table.isOutOfBounds(session.table.bounds, ball.x, ball.y)) {
      return score.outOfBounds(0);
    }
    return score.fromCell(cells.pick(session.cells, ball.x, ball.y), session.config, 0);
  }

  function maybeBreak(session, hitObstacles) {
    if (!session.fireArmed || !hitObstacles || !hitObstacles.length) return;
    var broken = obstacles.breakFirst(session.obstacles, hitObstacles);
    if (!broken) return;
    session.fireArmed = false;
    var hex = session.config.colors.fire || '#FB923C';
    var burst = fx.spawnBurst(broken.x, broken.y, session.config, hex, { count: 22 });
    var i;
    for (i = 0; i < burst.length; i++) {
      if (session.particles.length >= (session.config.burstParticleCap || 64)) session.particles.shift();
      session.particles.push(burst[i]);
    }
    session.toast = { text: '炎破', ttl: 0.7, hex: hex };
  }

  function updateFlight(session, dt) {
    var live = 0;
    var i;
    session.lastHit = false;
    for (i = 0; i < session.balls.length; i++) {
      var ball = session.balls[i];
      if (ball.done) continue;
      var result = physics.step(worldOf(session, ball), dt, session.shotConfig || session.config);
      if (result.hit) session.lastHit = true;
      maybeBreak(session, result.hitObstacles);
      collectHits(session, ball);
      if (table.isOutOfBounds(session.table.bounds, ball.x, ball.y)) {
        ball.done = true;
        ball.award = score.outOfBounds(0);
        continue;
      }
      var spd = stopDetect.speedOf(ball);
      stopDetect.tick(session.stops[i], spd, dt, session.config.stopSpeed, session.config.stopHoldMs);
      if (stopDetect.isStopped(session.stops[i])) {
        ball.done = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.award = awardForBall(session, ball);
      } else {
        live += 1;
      }
    }
    session.ball = session.balls[0];
    session.stop = session.stops[0];
    if (live > 0) return;

    var awards = [];
    for (i = 0; i < session.balls.length; i++) {
      awards.push(session.balls[i].award || score.fromCell({ cell: null }, session.config, 0));
    }
    finishShot(session, score.mergeBallAwards(awards, session.shotBonus));
  }

  function update(session, dt) {
    session.now += dt;
    if (session.flashFrames > 0) {
      session.flashFrames -= 1;
      if (session.flashFrames <= 0) {
        pushBurst(session);
        session.flashRing = null;
        session.flashCell = null;
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
      if (session.settleIn <= 0) {
        if (session.level.over) {
          session.phase = 'settle';
          if (session.stamina <= 0) session.modal = 'empty';
        } else {
          resetCue(session);
          session.phase = 'aim';
        }
      }
      return;
    }

    if (session.phase !== 'flight') return;
    updateFlight(session, dt);
  }

  function render(session, ctx) {
    var vp = session.viewport;
    var colors = session.config.colors;
    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawTable(ctx, session.table, colors);
    fx.drawDust(ctx, session.dust);
    fx.drawCells(ctx, session.cells, colors, session.flashCell);
    fx.drawVoids(ctx, session.table, colors);
    fx.drawWalls(ctx, session.table.walls, colors);
    fx.drawObstacles(ctx, session.obstacles, colors);
    fx.drawTargets(ctx, session.targets, colors, session.now);
    fx.drawLauncher(ctx, session.launcher, colors);
    if (session.phase === 'charging') {
      fx.drawPreview(ctx, session.preview.points, colors);
      fx.drawAim(ctx, session.ball, session.launcher, colors);
    }
    var pulse = session.phase === 'aim' ? 1 + Math.sin(session.now * 3.2) * 0.04 : 1;
    var i;
    if (session.phase === 'flight' || session.phase === 'scored') {
      for (i = 0; i < session.balls.length; i++) {
        if (session.balls[i] && (!session.balls[i].done || session.phase === 'scored')) {
          fx.drawBall(ctx, session.balls[i], colors, pulse, session.activeSkill || session.skill);
        }
      }
    } else {
      fx.drawBall(ctx, session.ball, colors, pulse, session.skill);
    }
    fx.drawParticles(ctx, session.particles);
    for (i = 0; i < session.popups.length; i++) fx.drawPopup(ctx, session.popups[i]);
    if (session.flashFrames > 0) {
      fx.drawFlash(ctx, vp.width, vp.height, session.flash || 0.22, '#FFFFFF');
    }
    var showPhase = session.phase === 'scored'
      ? (session.level.over ? 'flight' : 'flight')
      : session.phase;
    hud.draw(ctx, session.ui, {
      title: session.config.displayName || '奇境弹球',
      phase: showPhase,
      best: session.best,
      charging: session.phase === 'charging',
      power: session.launcher.power,
      hint: hud.hintFor(
        showPhase,
        session.phase === 'charging',
        session.skill
      ),
      toast: session.toast,
      settle: session.settle,
      pressed: session.pressed,
      skill: session.skill,
      stamina: session.stamina,
      level: session.level,
      modal: session.modal
    }, colors, vp);
  }

  function getDebugState(session) {
    return {
      phase: session.phase,
      ball: { x: session.ball.x, y: session.ball.y, vx: session.ball.vx, vy: session.ball.vy, r: session.ball.r },
      balls: session.balls.length,
      power: session.launcher.power,
      angle: session.launcher.angle,
      dragging: session.launcher.dragging,
      previewBounces: session.preview.bounces,
      previewPoints: session.preview.points.length,
      award: session.award,
      settle: session.settle,
      best: session.best,
      stamina: session.stamina,
      skill: session.skill,
      level: session.level,
      modal: session.modal,
      flashFrames: session.flashFrames,
      particleCount: session.particles.length,
      stop: { holdMs: session.stop.holdMs, stopped: session.stop.stopped }
    };
  }

  function debugPlace(session, x, y, vx, vy) {
    session.ball = {
      x: x,
      y: y,
      vx: vx || 0,
      vy: vy || 0,
      r: session.config.ballRadius || 9,
      done: false,
      award: null,
      kind: 'main'
    };
    session.balls = [session.ball];
    session.stop = stopDetect.create();
    session.stops = [session.stop];
    session.phase = 'flight';
    session.award = null;
    session.settle = null;
    session.shotBonus = 0;
    session.shotCommitted = false;
    session.shotConfig = session.skill === 'ice'
      ? skills.shotConfig(session.config, session.config.iceFrictionMul)
      : session.config;
    session.activeSkill = session.skill;
    session.fireArmed = session.skill === 'fire';
    session.modal = null;
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
