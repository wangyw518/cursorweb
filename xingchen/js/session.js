(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.XingchenPhysics,
    typeof require === 'function' ? require('./table') : root.XingchenTable,
    typeof require === 'function' ? require('./obstacles') : root.XingchenObstacles,
    typeof require === 'function' ? require('./cells') : root.XingchenCells,
    typeof require === 'function' ? require('./targets') : root.XingchenTargets,
    typeof require === 'function' ? require('./skills') : root.XingchenSkills,
    typeof require === 'function' ? require('./economy') : root.XingchenEconomy,
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
  cells,
  targets,
  skills,
  economy,
  launcher,
  stopDetect,
  score,
  hud,
  fx,
  storage
) {
  'use strict';

  function persist(session) {
    storage.save({
      best: session.best || 0,
      stamina: session.wallet.stamina,
      crystals: session.wallet.crystals,
      bestLevel: session.bestLevel || 1
    });
  }

  function levelSpec(config, index) {
    var list = (config && config.levels) || [{ id: 1, name: '初入奇境', shots: 5, target: 160 }];
    var i = index == null ? 0 : index;
    if (i < 0) i = 0;
    if (i >= list.length) i = list.length - 1;
    return { spec: list[i], index: i, hasNext: i + 1 < list.length };
  }

  function buildWorld(viewport, config) {
    var ui = hud.layout(viewport);
    var board = table.layout(viewport, config, ui.playRect);
    var rocks = obstacles.create(board, config);
    var grid = cells.create(board, config);
    var orbs = targets.create(board, config);
    var gun = launcher.create(board.dock, config);
    var ball = launcher.restBall(gun, config.ballRadius || 9);
    return {
      ui: ui,
      table: board,
      obstacles: rocks,
      cells: grid,
      targets: orbs,
      launcher: gun,
      ball: ball,
      dust: fx.makeDust(board.bounds, 52)
    };
  }

  function applyWorld(session, world) {
    session.ui = world.ui;
    session.table = world.table;
    session.obstacles = world.obstacles;
    session.cells = world.cells;
    session.targets = world.targets;
    session.launcher = world.launcher;
    session.ball = world.ball;
    session.balls = [world.ball];
    session.dust = world.dust;
  }

  function resetShotFx(session) {
    session.stop = stopDetect.create();
    session.stops = [session.stop];
    session.award = null;
    session.preview = { points: [], bounces: 0 };
    session.armedSkill = null;
    session.shotBonus = 0;
    session.shotConfig = session.config;
    session.lastHit = false;
    session.flashCell = null;
    session.flashRing = null;
  }

  function startLevel(session, index) {
    var packed = levelSpec(session.config, index);
    var world = buildWorld(session.viewport, session.config);
    applyWorld(session, world);
    resetShotFx(session);
    session.level = packed.spec;
    session.levelIndex = packed.index;
    session.hasNext = packed.hasNext;
    session.levelScore = 0;
    session.levelCrystals = 0;
    session.shotsLeft = packed.spec.shots;
    session.skillUses = skills.freshUses(session.config);
    session.selectedSkill = null;
    session.phase = 'aim';
    session.settle = null;
    session.settleIn = 0;
    session.resumeIn = 0;
    session.particles = [];
    session.popups = [];
    session.toast = null;
    session.flash = 0;
    session.flashFrames = 0;
    session.pendingBurst = null;
    session.pressed = null;
    return session;
  }

  function create(viewport, config) {
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      now: 0,
      best: saved.best || 0,
      bestLevel: saved.bestLevel || 1,
      wallet: {
        stamina: saved.stamina == null ? 30 : saved.stamina,
        crystals: saved.crystals || 0
      },
      phase: 'aim',
      pressed: null,
      pressedLeft: 0
    };
    startLevel(session, 0);
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
      obstacles: session.obstacles,
      targets: session.targets
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
    if (session.phase === 'settle' || session.phase === 'stamina') {
      session.ui = hud.layout(viewport);
      return;
    }
    var keep = {
      levelIndex: session.levelIndex,
      levelScore: session.levelScore,
      levelCrystals: session.levelCrystals,
      shotsLeft: session.shotsLeft,
      skillUses: session.skillUses,
      selectedSkill: session.selectedSkill,
      best: session.best,
      wallet: session.wallet
    };
    startLevel(session, keep.levelIndex);
    session.levelScore = keep.levelScore;
    session.levelCrystals = keep.levelCrystals;
    session.shotsLeft = keep.shotsLeft;
    session.skillUses = keep.skillUses;
    session.selectedSkill = keep.selectedSkill;
    session.best = keep.best;
    session.wallet = keep.wallet;
    session.phase = 'aim';
  }

  function restart(session) {
    startLevel(session, session.levelIndex || 0);
    return { kind: 'restart' };
  }

  function nextLevel(session) {
    if (!session.hasNext) return restart(session);
    startLevel(session, session.levelIndex + 1);
    return { kind: 'next' };
  }

  function emitScoreFx(session, award) {
    var live = session.balls.filter(function (b) { return !b.oob; })[0] || session.ball;
    var x = live.x;
    var y = live.y;
    var hex = award.oob && award.score === 0
      ? (session.config.colors.cellEpic || '#E879F9')
      : (award.rarity === 'epic'
        ? session.config.colors.cellEpic
        : award.rarity === 'gold'
          ? session.config.colors.cellGold
          : award.rarity === 'silver'
            ? session.config.colors.cellSilver
            : session.config.colors.cellBronze);
    session.flashCell = award.cell || null;
    session.flashRing = award.cell || null;
    session.flashFrames = 1;
    session.flash = award.oob && award.score === 0 ? 0.18 : 0.28;
    session.pendingBurst = { x: x, y: y, hex: hex || session.config.colors.scorePop };
    session.popups = [{
      x: x,
      y: y - 16,
      text: award.oob && award.score === 0 ? '0' : ('+' + award.score),
      life: 1,
      hex: hex || session.config.colors.scorePop
    }];
    if (award.oob && award.score === 0) {
      session.toast = { text: '偏离星表', ttl: 1.1, hex: session.config.colors.cellEpic };
    } else if (award.bonus > 0 && award.name) {
      session.toast = { text: award.name + '  +' + award.score, ttl: 0.95, hex: hex };
    } else if (award.name) {
      session.toast = { text: award.name + '  +' + award.score, ttl: 0.9, hex: hex };
    } else if (award.score > 0) {
      session.toast = { text: '+' + award.score, ttl: 0.8, hex: hex };
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

  function finishLevel(session, won) {
    var prevBest = session.best || 0;
    var isNew = session.levelScore > prevBest;
    var best = isNew ? session.levelScore : prevBest;
    if (isNew) session.best = best;
    if (won && session.level.id > (session.bestLevel || 1)) session.bestLevel = session.level.id;
    persist(session);
    session.settle = {
      score: session.levelScore,
      best: best,
      gap: isNew ? 0 : prevBest - session.levelScore,
      isNew: isNew,
      won: !!won,
      target: session.level.target,
      crystals: session.levelCrystals,
      oob: !!(session.award && session.award.oob),
      hasNext: !!session.hasNext,
      levelId: session.level.id
    };
    session.settleIn = (session.config.settleDelayMs || 280) / 1000;
    session.phase = 'scored';
    return session.settle;
  }

  function prepareNextShot(session) {
    session.ball = launcher.restBall(session.launcher, session.config.ballRadius || 9);
    session.balls = [session.ball];
    resetShotFx(session);
    session.selectedSkill = null;
    session.phase = 'aim';
  }

  function resolveShot(session, award) {
    session.award = award;
    session.levelScore += award.score;
    session.levelCrystals += award.crystals || 0;
    economy.addCrystals(session.wallet, award.crystals || 0);
    persist(session);
    emitScoreFx(session, award);
    if (session.levelScore >= session.level.target) {
      return finishLevel(session, true);
    }
    if (session.shotsLeft <= 0) {
      return finishLevel(session, false);
    }
    session.resumeIn = (session.config.betweenDelayMs || 520) / 1000;
    session.phase = 'between';
    return award;
  }

  function finishFlight(session, award) {
    var i;
    for (i = 0; i < session.balls.length; i++) {
      session.balls[i].vx = 0;
      session.balls[i].vy = 0;
    }
    return resolveShot(session, award || score.outOfBounds(session.shotBonus));
  }

  function settleNow(session, award) {
    if (session.phase === 'settle' || session.phase === 'scored') return session.settle;
    return finishFlight(session, award || score.outOfBounds(session.shotBonus));
  }

  function selectSkill(session, id) {
    session.selectedSkill = skills.toggle(session.selectedSkill, session.skillUses, id);
    return { kind: 'skill', id: session.selectedSkill };
  }

  function showStamina(session) {
    session.phase = 'stamina';
    session.toast = { text: '星力耗尽', ttl: 1.2, hex: session.config.colors.crystal };
    return { kind: 'stamina' };
  }

  function restoreStamina(session, kind) {
    var result = kind === 'ad'
      ? economy.rewardedAd(session.wallet, session.config)
      : economy.shareAssist(session.wallet, session.config);
    persist(session);
    session.phase = 'aim';
    session.toast = {
      text: kind === 'ad' ? '演示：星辉回充 +' + result.amount : '演示：分享助力 +' + result.amount,
      ttl: 1.1,
      hex: session.config.colors.crystal
    };
    return result;
  }

  function handlePointerDown(session, x, y) {
    var phase = session.phase;
    var action = hud.hitTest(session.ui, x, y, phase === 'scored' ? 'settle' : phase);

    if (phase === 'stamina') {
      if (action === 'share' || action === 'ad') {
        session.pressed = action;
        session.pressedLeft = 0.12;
        restoreStamina(session, action);
        return { kind: action };
      }
      return { kind: 'stamina-block' };
    }

    if (phase === 'settle' || phase === 'scored') {
      if (phase === 'settle' && action === 'replay') {
        session.pressed = 'replay';
        session.pressedLeft = 0.12;
        return restart(session);
      }
      if (phase === 'settle' && action === 'next' && session.settle && session.settle.won && session.settle.hasNext) {
        session.pressed = 'next';
        session.pressedLeft = 0.12;
        return nextLevel(session);
      }
      return { kind: 'settle-block' };
    }

    if (phase === 'between') return { kind: 'busy' };

    if (phase === 'aim' && action && action.indexOf('skill:') === 0) {
      var id = action.slice(6);
      session.pressed = action;
      session.pressedLeft = 0.1;
      return selectSkill(session, id);
    }

    if (phase !== 'aim') return { kind: 'busy' };

    if (session.wallet.stamina <= 0) return showStamina(session);

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
    if (session.wallet.stamina <= 0) {
      session.phase = 'aim';
      return showStamina(session);
    }
    var spent = economy.spend(session.wallet, session.config);
    if (!spent.ok) {
      session.phase = 'aim';
      return showStamina(session);
    }
    session.shotsLeft = Math.max(0, session.shotsLeft - 1);
    var picked = session.selectedSkill;
    if (picked && skills.consume(session.skillUses, picked)) {
      session.armedSkill = picked;
    } else {
      session.armedSkill = null;
    }
    session.shotConfig = skills.shotConfig(session.config, session.armedSkill);
    session.ball.vx = shot.vx;
    session.ball.vy = shot.vy;
    session.balls = [session.ball];
    if (session.armedSkill === 'split') {
      session.balls.push(skills.splitTwin(session.ball, shot.vx, shot.vy, session.config));
    }
    session.stops = [];
    var i;
    for (i = 0; i < session.balls.length; i++) {
      session.stops.push(stopDetect.create());
    }
    session.stop = session.stops[0];
    session.shotBonus = 0;
    persist(session);
    session.phase = 'flight';
    return {
      kind: 'fire',
      power: shot.power,
      angle: shot.angle,
      vx: shot.vx,
      vy: shot.vy,
      skill: session.armedSkill,
      stamina: session.wallet.stamina
    };
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

  function handleFlightEvents(session, result) {
    var i;
    var events = result.events || [];
    if (!events.length) {
      if (result.obstacle) events.push({ kind: 'obstacle', obstacle: result.obstacle });
      if (result.target) events.push({ kind: 'target', target: result.target });
    }
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.kind === 'obstacle' && ev.obstacle && session.armedSkill === 'fire' && !ev.obstacle.broken) {
        ev.obstacle.broken = true;
        session.armedSkill = null;
        session.pendingBurst = {
          x: ev.obstacle.x,
          y: ev.obstacle.y,
          hex: session.config.colors.skillFire || '#FB7185'
        };
        pushBurst(session);
        session.toast = { text: '炎破', ttl: 0.7, hex: session.config.colors.skillFire };
      }
      if (ev.kind === 'target' && ev.target && !ev.target.collected) {
        var bonus = targets.collect(ev.target);
        session.shotBonus += bonus;
        session.popups.push({
          x: ev.target.x,
          y: ev.target.y - 10,
          text: '+' + bonus,
          life: 0.9,
          hex: ev.target.hex
        });
        var burst = fx.spawnBurst(ev.target.x, ev.target.y, session.config, ev.target.hex, { count: 14 });
        var cap = session.config.burstParticleCap || 64;
        var p;
        for (p = 0; p < burst.length; p++) {
          if (session.particles.length >= cap) session.particles.shift();
          session.particles.push(burst[p]);
        }
      }
    }
  }

  function allBallsResolved(session, dt) {
    var live = 0;
    var stopped = 0;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (table.isOutOfBounds(session.table.bounds, b.x, b.y)) {
        b.oob = true;
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      live += 1;
      var spd = stopDetect.speedOf(b);
      var st = session.stops[i] || stopDetect.create();
      session.stops[i] = st;
      stopDetect.tick(st, spd, dt, session.config.stopSpeed, session.config.stopHoldMs);
      if (stopDetect.isStopped(st)) stopped += 1;
    }
    if (live === 0) return { done: true, oob: true };
    if (stopped === live) return { done: true, oob: false };
    return { done: false };
  }

  function scoreStoppedBalls(session) {
    var picks = [];
    var i;
    for (i = 0; i < session.balls.length; i++) {
      var b = session.balls[i];
      if (b.oob) continue;
      var hit = cells.pick(session.cells, b.x, b.y);
      if (hit.cell) picks.push(hit.cell);
    }
    if (!picks.length && session.shotBonus <= 0) {
      var anyLive = session.balls.some(function (b) { return !b.oob; });
      if (!anyLive) return score.outOfBounds(session.shotBonus);
    }
    return score.combine(picks, session.shotBonus, session.config);
  }

  function update(session, dt) {
    session.now += dt;
    if (session.flashFrames > 0) {
      session.flashFrames -= 1;
      if (session.flashFrames <= 0) {
        pushBurst(session);
        session.flashCell = null;
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

    if (session.phase === 'between') {
      session.resumeIn -= dt;
      if (session.resumeIn <= 0) prepareNextShot(session);
      return;
    }

    if (session.phase !== 'flight') return;

    var result = physics.stepMany(session.balls, worldOf(session), dt, session.shotConfig || session.config);
    session.lastHit = !!result.hit;
    handleFlightEvents(session, result);

    var resolved = allBallsResolved(session, dt);
    if (resolved.done) {
      if (resolved.oob) finishFlight(session, score.outOfBounds(session.shotBonus));
      else finishFlight(session, scoreStoppedBalls(session));
    }
  }

  function ballTint(session) {
    if (session.armedSkill === 'ice' || session.selectedSkill === 'ice') {
      return session.config.colors.ballIce || '#A5F3FC';
    }
    if (session.armedSkill === 'fire' || session.selectedSkill === 'fire') {
      return session.config.colors.ballFire || '#FDBA74';
    }
    if (session.armedSkill === 'split' || session.selectedSkill === 'split') {
      return session.config.colors.skillSplit || '#C4B5FD';
    }
    return session.config.colors.ballGlow;
  }

  function render(session, ctx) {
    var vp = session.viewport;
    var colors = session.config.colors;
    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawTable(ctx, session.table, colors);
    fx.drawDust(ctx, session.dust);
    fx.drawCells(ctx, session.cells, colors, session.flashCell, session.now);
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
    var tint = ballTint(session);
    var i;
    for (i = 0; i < session.balls.length; i++) {
      if (session.balls[i].oob) continue;
      fx.drawBall(ctx, session.balls[i], colors, pulse, tint);
    }
    fx.drawParticles(ctx, session.particles);
    for (i = 0; i < session.popups.length; i++) fx.drawPopup(ctx, session.popups[i]);
    if (session.flashFrames > 0) {
      fx.drawFlash(ctx, vp.width, vp.height, session.flash || 0.22, '#FFFFFF');
    }
    hud.draw(ctx, session.ui, {
      title: session.config.displayName || '奇境弹球',
      phase: session.phase === 'scored' ? (session.settle ? 'flight' : 'flight') : session.phase,
      best: session.best,
      charging: session.phase === 'charging',
      power: session.launcher.power,
      hint: hud.hintFor(
        session.phase === 'scored' ? 'flight' : session.phase,
        session.phase === 'charging'
      ),
      toast: session.toast,
      settle: session.settle,
      pressed: session.pressed,
      selectedSkill: session.selectedSkill,
      skillUses: session.skillUses,
      score: session.levelScore,
      target: session.level.target,
      shotsLeft: session.shotsLeft,
      stamina: session.wallet.stamina,
      crystals: session.wallet.crystals,
      levelId: session.level.id,
      levelName: session.level.name
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
      particleCount: session.particles.length,
      stop: { holdMs: session.stop.holdMs, stopped: session.stop.stopped },
      stamina: session.wallet.stamina,
      crystals: session.wallet.crystals,
      shotsLeft: session.shotsLeft,
      levelScore: session.levelScore,
      target: session.level.target,
      selectedSkill: session.selectedSkill,
      armedSkill: session.armedSkill,
      skillUses: session.skillUses,
      shotBonus: session.shotBonus
    };
  }

  function debugPlace(session, x, y, vx, vy) {
    session.ball.x = x;
    session.ball.y = y;
    session.ball.vx = vx || 0;
    session.ball.vy = vy || 0;
    session.ball.oob = false;
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    session.stop = session.stops[0];
    session.phase = 'flight';
    session.award = null;
    session.settle = null;
    session.shotBonus = session.shotBonus || 0;
    session.shotConfig = session.shotConfig || session.config;
    return session;
  }

  function debugFire(session, vx, vy) {
    session.ball.vx = vx;
    session.ball.vy = vy;
    session.balls = [session.ball];
    session.stops = [stopDetect.create()];
    session.stop = session.stops[0];
    session.phase = 'flight';
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
    nextLevel: nextLevel,
    startLevel: startLevel,
    selectSkill: selectSkill,
    settleNow: settleNow,
    getDebugState: getDebugState,
    debugPlace: debugPlace,
    debugFire: debugFire,
    worldOf: worldOf
  };
});
