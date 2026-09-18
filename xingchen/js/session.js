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
    typeof require === 'function' ? require('./storage') : root.XingchenStorage,
    typeof require === 'function' ? require('./grid') : root.XingchenGrid,
    typeof require === 'function' ? require('./skills') : root.XingchenSkills,
    typeof require === 'function' ? require('./level') : root.XingchenLevel,
    typeof require === 'function' ? require('./stamina') : root.XingchenStamina,
    typeof require === 'function' ? require('./share') : root.XingchenShare,
    typeof require === 'function' ? require('./ads') : root.XingchenAds
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
  storage,
  grid,
  skills,
  level,
  stamina,
  share,
  ads
) {
  'use strict';

  function nowMs() {
    return Date.now();
  }

  function persistMeta(session) {
    storage.save({
      best: session.best,
      stamina: session.stamina.value,
      lastRegenAt: session.stamina.lastRegenAt,
      levelId: session.levelId
    });
  }

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
      grid: grid.create(board, config),
      dust: fx.makeDust(board.bounds, 52)
    };
  }

  function applyWorld(session, world) {
    session.ui = world.ui;
    session.table = world.table;
    session.obstacles = world.obstacles;
    session.rings = world.rings;
    session.launcher = world.launcher;
    session.ball = world.ball;
    session.grid = world.grid;
    session.dust = world.dust;
    session.balls = [world.ball];
    session.stops = [stopDetect.create()];
  }

  function resetDock(session) {
    var rest = launcher.restBall(session.launcher, session.config.ballRadius || 9);
    session.ball.x = rest.x;
    session.ball.y = rest.y;
    session.ball.vx = 0;
    session.ball.vy = 0;
    session.ball.r = rest.r;
    session.ball.done = false;
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    session.preview = { points: [], bounces: 0 };
    session.shotSkill = null;
    session.shotConfig = session.config;
  }

  function beginLevel(session, levelId, override) {
    var world = buildWorld(session.viewport, session.config);
    applyWorld(session, world);
    session.levelId = levelId || 1;
    session.level = level.create(session.config, session.levelId, override);
    skills.reset(session.skills);
    resetDock(session);
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
    session.phase = 'aim';
  }

  function showNeedStamina(session) {
    session.phase = 'need-stamina';
    session.settle = {
      score: session.level ? session.level.score : 0,
      best: session.best,
      gap: 0,
      isNew: false,
      needStamina: true,
      won: false,
      lost: false,
      target: session.level ? session.level.target : 0,
      hasNext: false
    };
  }

  function tryStartLevel(session, levelId, override) {
    stamina.regen(session.stamina, nowMs(), session.config);
    var cost = session.config.staminaCost == null ? 1 : session.config.staminaCost;
    if (!stamina.canStart(session.stamina, cost)) {
      showNeedStamina(session);
      persistMeta(session);
      return { kind: 'need-stamina' };
    }
    beginLevel(session, levelId, override);
    persistMeta(session);
    return { kind: 'start', levelId: session.levelId };
  }

  function create(viewport, config, opts) {
    opts = opts || {};
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      skills: skills.create(),
      stamina: stamina.create(saved, config),
      levelId: opts.levelId || saved.levelId || 1,
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
      flashCell: null,
      flashFrames: 0,
      pendingBurst: null,
      preview: { points: [], bounces: 0 },
      pressed: null,
      pressedLeft: 0,
      lastHit: false,
      lastShare: null,
      lastAd: null,
      shotSkill: null,
      shotConfig: config
    };
    stamina.regen(session.stamina, nowMs(), config);
    applyWorld(session, buildWorld(viewport, config));
    session.stop = session.stops[0];
    tryStartLevel(session, session.levelId, opts.level);
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
      balls: session.balls,
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
    session.ui = hud.layout(viewport);
    if (session.phase === 'settle' || session.phase === 'need-stamina') return;
    var world = buildWorld(viewport, session.config);
    applyWorld(session, world);
    session.stop = session.stops[0];
    session.phase = 'aim';
  }

  function restart(session, next) {
    var id = session.levelId || 1;
    if (next) id = level.nextId(session.config, id);
    session.levelId = id;
    return tryStartLevel(session, id);
  }

  function emitScoreFx(session, award) {
    var landed = (award.harvested && award.harvested[0]) || award.cell || null;
    var x = landed ? landed.x + landed.w * 0.5 : session.ball.x;
    var y = landed ? landed.y + landed.h * 0.5 : session.ball.y;
    var hex = award.oob
      ? (session.config.colors.ringPurple || '#C084FC')
      : (landed && landed.kind ? fx.cellHex(landed.kind, session.config.colors) : session.config.colors.scorePop);
    session.flashRing = award.ring || null;
    session.flashCell = landed;
    session.flashFrames = 1;
    session.flash = award.oob ? 0.18 : 0.28;
    session.pendingBurst = { x: x, y: y, hex: hex };
    var cellLabel = award.cellName || (landed && landed.name) || '';
    var label = award.oob
      ? '0'
      : (cellLabel
        ? (cellLabel + '  +' + award.score)
        : ((award.score > 0 ? '+' + award.score : '+0') + (award.edge ? ' 擦边' : '')));
    session.popups = [{
      x: x,
      y: y - 16,
      text: label,
      life: 1,
      hex: hex
    }];
    if (award.oob) {
      session.toast = { text: '偏离星表', ttl: 1.0, hex: session.config.colors.ringPurple };
    } else if (cellLabel) {
      var skillPrefix = award.skill ? (skills.label(award.skill) + ' · ') : '';
      session.toast = {
        text: skillPrefix + '落在哪一格  ' + cellLabel + '  +' + award.score,
        ttl: 0.95,
        hex: hex
      };
    } else if (award.edge) {
      session.toast = { text: '擦边 ×1.2', ttl: 0.9, hex: session.config.colors.aim };
    } else if (!award.miss && award.score > 0) {
      session.toast = { text: '拾取  +' + award.score, ttl: 0.85, hex: hex };
    } else {
      session.toast = { text: '落在哪一格  空', ttl: 0.75, hex: session.config.colors.hudDim };
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

  function landingCandidates(session) {
    var out = [];
    var i;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (b.done) continue;
      if (table.isOutOfBounds(session.table.bounds, b.x, b.y)) continue;
      out.push({
        ball: b,
        cell: grid.cellAt(session.grid, b.x, b.y)
      });
    }
    return out;
  }

  /**
   * Primary settle reads the grid cell under the ball center (grid.cellAt).
   * Split (2 balls) scores only the higher-tier of those two cells.
   */
  function harvestBalls(session) {
    var skill = session.shotSkill;
    var landings = landingCandidates(session);
    if (!landings.length) {
      return { points: 0, cells: [], names: [], cell: null };
    }
    var chosen = landings[0];
    var i;
    for (i = 1; i < landings.length; i++) {
      if (grid.higherTier(landings[i].cell, chosen.cell) === landings[i].cell) {
        chosen = landings[i];
      }
    }
    return grid.harvest(session.grid, chosen.ball.x, chosen.ball.y, {
      skill: skill,
      config: session.config
    });
  }

  function optionalRingAward(session) {
    if (!session.config.ringBonus) return score.fromPick(null, session.config);
    var best = score.fromPick(null, session.config);
    var i;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (b.done || table.isOutOfBounds(session.table.bounds, b.x, b.y)) continue;
      var pick = scoreRings.pick(session.rings, b.x, b.y, session.config.edgePx);
      var award = score.fromPick(pick, session.config);
      if (award.score > best.score) best = award;
    }
    return best;
  }

  function settleLevel(session, verdict) {
    var prevBest = storage.load().best || 0;
    var isNew = session.level.score > prevBest;
    var best = isNew ? session.level.score : prevBest;
    if (isNew) session.best = best;
    else session.best = prevBest;
    var last = session.award || {};
    session.settle = {
      score: session.level.score,
      best: best,
      gap: isNew ? 0 : Math.max(0, prevBest - session.level.score),
      isNew: isNew,
      oob: !!(last.oob && session.level.score === 0),
      lastOob: !!last.oob,
      edge: !!last.edge,
      tier: last.tier,
      miss: session.level.score === 0,
      won: verdict === 'win',
      lost: verdict === 'lose',
      target: session.level.target,
      hasNext: verdict === 'win' && level.hasNext(session.config, session.level.id),
      needStamina: false,
      cellName: last.cellName || '',
      cellKind: last.cellKind || '',
      cell: last.cell || null
    };
    persistMeta(session);
    session.settleIn = (session.config.settleDelayMs || 280) / 1000;
    session.phase = 'scored';
    return session.settle;
  }

  function resolveShot(session, award) {
    session.award = award;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      session.balls[i].vx = 0;
      session.balls[i].vy = 0;
    }
    emitScoreFx(session, award);
    level.addScore(session.level, award.score);
    level.spendShot(session.level);
    var verdict = level.evaluate(session.level);
    if (verdict === 'win' || verdict === 'lose') {
      return settleLevel(session, verdict);
    }
    resetDock(session);
    session.phase = 'aim';
    session.stop = session.stops[0];
    return session.award;
  }

  function allBallsResolved(session) {
    var i;
    var live = 0;
    var stopped = 0;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (b.done) continue;
      if (table.isOutOfBounds(session.table.bounds, b.x, b.y)) {
        b.done = true;
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      live += 1;
      if (stopDetect.isStopped(session.stops[i])) stopped += 1;
    }
    if (live === 0) return { done: true, allOob: true };
    if (stopped === live) return { done: true, allOob: false };
    return { done: false, allOob: false };
  }

  function settleNow(session, award) {
    if (session.phase === 'settle' || session.phase === 'scored') return session.settle;
    return resolveShot(session, award || score.outOfBounds());
  }

  function grantStub(session, kind) {
    var n = kind === 'ad'
      ? (session.config.adGrant || 5)
      : (session.config.shareGrant || 1);
    var result = kind === 'ad'
      ? ads.watch({ grant: n, title: '星尘弹射' })
      : share.share({ grant: n, title: '星尘弹射' });
    stamina.grant(session.stamina, result.grant || n);
    persistMeta(session);
    if (kind === 'ad') session.lastAd = result;
    else session.lastShare = result;
    session.toast = {
      text: kind === 'ad' ? ('补给 +' + (result.grant || n)) : ('分享 +' + (result.grant || n)),
      ttl: 0.9,
      hex: session.config.colors.aim
    };
    if (session.phase === 'need-stamina' && stamina.canStart(session.stamina, session.config.staminaCost || 1)) {
      session.settle.needStamina = false;
    }
    return result;
  }

  function handlePointerDown(session, x, y) {
    var uiPhase = session.phase === 'scored' ? 'settle' : session.phase;
    var action = hud.hitTest(session.ui, x, y, uiPhase, session.settle);
    if (session.phase === 'settle' || session.phase === 'scored' || session.phase === 'need-stamina') {
      if (session.phase === 'scored') return { kind: 'settle-block' };
      if (action === 'next' && session.settle && session.settle.won) {
        session.pressed = 'next';
        session.pressedLeft = 0.12;
        return restart(session, true);
      }
      if (action === 'replay') {
        session.pressed = 'replay';
        session.pressedLeft = 0.12;
        return restart(session, false);
      }
      if (action === 'share') {
        session.pressed = 'share';
        session.pressedLeft = 0.12;
        return { kind: 'share', share: grantStub(session, 'share') };
      }
      if (action === 'ad') {
        session.pressed = 'ad';
        session.pressedLeft = 0.12;
        return { kind: 'ad', ad: grantStub(session, 'ad') };
      }
      return { kind: 'settle-block' };
    }
    if (session.phase !== 'aim') return { kind: 'busy' };
    if (action === 'skill-fire' || action === 'skill-ice' || action === 'skill-split') {
      var skill = action.replace('skill-', '');
      var armed = skills.arm(session.skills, skill);
      session.pressed = action;
      session.pressedLeft = 0.12;
      if (!armed.ok && armed.reason === 'used') {
        session.toast = { text: '本关已用过', ttl: 0.7, hex: session.config.colors.hudDim };
      }
      return { kind: 'skill', skill: skill, result: armed };
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
    stamina.regen(session.stamina, nowMs(), session.config);
    var aimCost = session.config.staminaCost == null ? 1 : session.config.staminaCost;
    if (!stamina.canStart(session.stamina, aimCost)) {
      session.toast = { text: '星尘不足', ttl: 0.8, hex: session.config.colors.hudDim };
      return { kind: 'need-stamina' };
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
    stamina.regen(session.stamina, nowMs(), session.config);
    var shotCost = session.config.staminaCost == null ? 1 : session.config.staminaCost;
    if (!stamina.canStart(session.stamina, shotCost)) {
      session.phase = 'aim';
      session.toast = { text: '星尘不足', ttl: 0.8, hex: session.config.colors.hudDim };
      return { kind: 'need-stamina' };
    }
    stamina.spend(session.stamina, shotCost);
    persistMeta(session);
    var skill = skills.consume(session.skills);
    session.shotSkill = skill;
    session.shotConfig = session.config;
    if (skill === 'ice') {
      session.shotConfig = {
        fixedDt: session.config.fixedDt,
        stopSpeed: session.config.stopSpeed,
        stopHoldMs: session.config.stopHoldMs,
        friction: skills.iceFriction(session.config),
        restitution: session.config.restitution,
        maxSpeed: session.config.maxSpeed,
        ballRadius: session.config.ballRadius,
        previewBounces: session.config.previewBounces,
        previewLength: session.config.previewLength
      };
    }
    session.ball.vx = shot.vx;
    session.ball.vy = shot.vy;
    session.ball.done = false;
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    if (skill === 'split') {
      var extras = skills.splitVelocities(shot.vx, shot.vy, session.config);
      var maxBalls = skills.splitMax(session.config);
      var i;
      for (i = 1; i < extras.length && session.balls.length < maxBalls; i++) {
        session.balls.push({
          x: session.ball.x,
          y: session.ball.y,
          vx: extras[i].vx,
          vy: extras[i].vy,
          r: Math.max(6, (session.ball.r || 9) * 0.78),
          done: false
        });
        session.stops.push(stopDetect.create());
      }
      session.ball.vx = extras[0].vx;
      session.ball.vy = extras[0].vy;
    }
    session.stop = session.stops[0];
    session.phase = 'flight';
    return { kind: 'fire', power: shot.power, angle: shot.angle, vx: shot.vx, vy: shot.vy, skill: skill };
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
      if (session.settleIn <= 0) session.phase = 'settle';
      return;
    }

    if (session.phase !== 'flight') return;

    var result = physics.step(worldOf(session), dt, session.shotConfig || session.config);
    session.lastHit = !!result.hit;

    var i;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (b.done) continue;
      if (table.isOutOfBounds(session.table.bounds, b.x, b.y)) continue;
      stopDetect.tick(
        session.stops[i],
        stopDetect.speedOf(b),
        dt,
        session.config.stopSpeed,
        session.config.stopHoldMs
      );
    }
    session.stop = session.stops[0];

    var resolved = allBallsResolved(session);
    if (!resolved.done) return;
    if (resolved.allOob) {
      resolveShot(session, score.combine(
        score.outOfBounds(),
        { points: 0, cells: [], names: [], cell: null },
        session.shotSkill,
        session.config
      ));
      return;
    }
    var ringAward = optionalRingAward(session);
    var gridAward = harvestBalls(session);
    resolveShot(session, score.combine(ringAward, gridAward, session.shotSkill, session.config));
  }

  function render(session, ctx) {
    var vp = session.viewport;
    var colors = session.config.colors;
    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawTable(ctx, session.table, colors);
    fx.drawGrid(ctx, session.grid, colors, session.flashCell);
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
    var i;
    for (i = 0; i < session.balls.length; i++) {
      if (!session.balls[i].done) fx.drawBall(ctx, session.balls[i], colors, i === 0 ? pulse : 1);
    }
    fx.drawParticles(ctx, session.particles);
    for (i = 0; i < session.popups.length; i++) fx.drawPopup(ctx, session.popups[i]);
    if (session.flashFrames > 0) {
      fx.drawFlash(ctx, vp.width, vp.height, session.flash || 0.22, '#FFFFFF');
    }
    var drawPhase = session.phase === 'scored' ? 'flight' : session.phase;
    hud.draw(ctx, session.ui, {
      phase: drawPhase,
      best: session.best,
      charging: session.phase === 'charging',
      power: session.launcher.power,
      hint: hud.hintFor(drawPhase, session.phase === 'charging'),
      toast: session.toast,
      settle: session.settle,
      pressed: session.pressed,
      stamina: session.stamina.value,
      staminaMax: session.stamina.max,
      level: session.level,
      skills: session.skills
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
      flashFrames: session.flashFrames,
      flashCell: session.flashCell,
      particleCount: session.particles.length,
      stop: { holdMs: session.stop.holdMs, stopped: session.stop.stopped },
      level: session.level,
      stamina: session.stamina.value,
      skills: { armed: session.skills.armed, used: session.skills.used },
      shotSkill: session.shotSkill
    };
  }

  function debugPlace(session, x, y, vx, vy) {
    session.ball.x = x;
    session.ball.y = y;
    session.ball.vx = vx || 0;
    session.ball.vy = vy || 0;
    session.ball.done = false;
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    session.stop = session.stops[0];
    session.phase = 'flight';
    session.award = null;
    session.settle = null;
    return session;
  }

  function debugFire(session, vx, vy) {
    session.ball.vx = vx;
    session.ball.vy = vy;
    session.phase = 'flight';
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    session.stop = session.stops[0];
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
    worldOf: worldOf,
    grantStub: grantStub
  };
});
