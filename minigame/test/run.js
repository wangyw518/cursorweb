var assert = require('assert');
var config = require('../js/config.json');
var { createTimeline } = require('../js/inputTimeline.js');
var { createTerrain } = require('../js/terrain.js');
var { createGhostSystem, stepsFromMs } = require('../js/ghostReplay.js');
var collision = require('../js/collision.js');
var { createScore } = require('../js/score.js');
var { createBody, stepBody, cloneBody, createGame } = require('../js/runner.js');
var { createHeadless } = require('../js/platform.js');
var sessionMod = require('../js/session.js');
var share = require('../js/share.js');
var batch = require('./batch.js');

var failed = 0;
var passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok  - ' + name);
  } catch (err) {
    failed += 1;
    console.error('fail- ' + name);
    console.error('     ' + err.message);
  }
}

function almost(a, b, eps, label) {
  eps = eps || 1e-6;
  if (Math.abs(a - b) > eps) {
    throw new Error((label || 'value') + ' expected ' + b + ' got ' + a);
  }
}

function runScripted(inputs, steps, seed) {
  var timeline = createTimeline();
  var terrain = createTerrain(seed == null ? 1 : seed);
  var ghosts = createGhostSystem(config, {
    createBody: createBody,
    stepBody: stepBody
  });
  var player = createBody(config);
  var history = [];
  var simStep = 0;
  for (var i = 0; i < steps; i++) {
    var cmd = { jump: false, dash: false };
    for (var k = 0; k < inputs.length; k++) {
      if (inputs[k].step === simStep) {
        cmd[inputs[k].type] = true;
        timeline.push(simStep, inputs[k].type);
      }
    }
    stepBody(player, cmd, terrain, config, config.fixedDt);
    simStep += 1;
    history[simStep - 1] = cloneBody(player);
    ghosts.sync(simStep, timeline, terrain);
  }
  return {
    player: player,
    ghosts: ghosts.list(),
    history: history,
    timeline: timeline,
    simStep: simStep
  };
}

check('config freeze keys', function () {
  assert.strictEqual(config.ghostDelayMs, 1500);
  assert.strictEqual(config.ghostTtlMs, 4000);
  assert.strictEqual(config.ghostCap, 8);
  assert.strictEqual(config.dashCdMs, 800);
  assert.strictEqual(config.quietMs, 2000);
  assert.strictEqual(config.nearMissPx, 12);
  almost(config.fixedDt, 1 / 60, 1e-12, 'fixedDt');
  assert.strictEqual(config.physics.jumpVy, 620);
  assert.strictEqual(config.physics.dashLift, 0);
  assert.strictEqual(config.highHeight, 78);
  assert.strictEqual(config.firstHazardX, 1500);
  assert.strictEqual(config.hazardGapMin, 320);
  assert.strictEqual(config.hazardPostMin, 300);
  assert.strictEqual(config.halfScreenInput, false);
  assert.strictEqual(config.colors.bg, '#0B1020');
  assert.strictEqual(config.colors.player, '#5CE1E6');
  assert.strictEqual(config.colors.ghostAlpha, 0.45);
  assert.strictEqual(config.colors.ghostStroke, '#A8F7FA');
  assert.strictEqual(config.colors.terrain, '#8B93A7');
  assert.strictEqual(config.colors.nearMissFlash, '#FFE66D');
});

check('delay/ttl/quiet are integer steps at 1/60', function () {
  assert.strictEqual(stepsFromMs(1500, config.fixedDt), 90);
  assert.strictEqual(stepsFromMs(4000, config.fixedDt), 240);
  assert.strictEqual(stepsFromMs(2000, config.fixedDt), 120);
  assert.strictEqual(stepsFromMs(800, config.fixedDt), 48);
});

check('firstHazardX keeps the opening stretch safe', function () {
  var terrain = createTerrain(7, config);
  terrain.ensureUpTo(config.firstHazardX + 800);
  for (var i = 0; i < terrain.obstacles.length; i++) {
    assert.ok(
      terrain.obstacles[i].x >= config.firstHazardX,
      'obstacle at ' + terrain.obstacles[i].x
    );
  }
  var high = terrain.obstacles.filter(function (o) { return o.kind === 'high'; });
  if (high.length) {
    assert.strictEqual(high[0].h, config.highHeight);
  }
  var cover = 0;
  for (var g = 0; g < terrain.grounds.length; g++) {
    var seg = terrain.grounds[g];
    var a = Math.max(0, seg.x1);
    var b = Math.min(config.firstHazardX, seg.x2);
    if (b > a) cover += b - a;
  }
  assert.ok(cover >= config.firstHazardX - 1, 'safe ground cover ' + cover);
});

function collectHazards(terrain) {
  var hazards = [];
  for (var i = 0; i < terrain.obstacles.length; i++) {
    var o = terrain.obstacles[i];
    hazards.push({ x: o.x, end: o.x + o.w, kind: o.kind });
  }
  var segs = terrain.grounds.slice().sort(function (a, b) { return a.x1 - b.x1; });
  for (var g = 0; g < segs.length - 1; g++) {
    if (segs[g].x2 < segs[g + 1].x1) {
      hazards.push({ x: segs[g].x2, end: segs[g + 1].x1, kind: 'gap' });
    }
  }
  hazards.sort(function (a, b) { return a.x - b.x; });
  return hazards;
}

function assertHazardSpacing(hazards, gapMin, postMin) {
  for (var i = 1; i < hazards.length; i++) {
    var prev = hazards[i - 1];
    var next = hazards[i];
    assert.ok(
      next.x - prev.x >= gapMin - 1e-6,
      'hazardGapMin ' + gapMin + ' got ' + (next.x - prev.x)
    );
    assert.ok(
      next.x - prev.end >= postMin - 1e-6,
      'hazardPostMin ' + postMin + ' got ' + (next.x - prev.end)
    );
  }
}

check('same seed yields the same layout', function () {
  var a = createTerrain(42, config);
  var b = createTerrain(42, config);
  a.ensureUpTo(config.firstHazardX + 4000);
  b.ensureUpTo(config.firstHazardX + 4000);
  assert.deepStrictEqual(a.obstacles, b.obstacles);
  assert.deepStrictEqual(a.grounds, b.grounds);
});

check('hazardGapMin and hazardPostMin space consecutive hazards', function () {
  var terrain = createTerrain(11, config);
  terrain.ensureUpTo(config.firstHazardX + 6000);
  var hazards = collectHazards(terrain);
  assert.ok(hazards.length >= 3, 'expected several hazards, got ' + hazards.length);
  var kinds = {};
  for (var i = 0; i < hazards.length; i++) kinds[hazards[i].kind] = true;
  assert.ok(kinds.low && kinds.high && kinds.gap, 'expected low, high, and gap kinds');
  assertHazardSpacing(hazards, config.hazardGapMin, config.hazardPostMin);
});

check('terrain reads density keys instead of magic spacing', function () {
  var custom = Object.assign({}, config, { hazardGapMin: 520, hazardPostMin: 300 });
  var terrain = createTerrain(3, custom);
  terrain.ensureUpTo(custom.firstHazardX + 8000);
  var hazards = collectHazards(terrain);
  assert.ok(hazards.length >= 2, 'expected hazards under custom density');
  assertHazardSpacing(hazards, 520, 300);
});

check('quiet window does not spawn ghosts', function () {
  var run = runScripted([{ step: 30, type: 'jump' }], 200);
  assert.strictEqual(run.ghosts.length, 0);
});

check('ghost path matches delayed player history', function () {
  var jumpAt = 130;
  var delay = 90;
  var run = runScripted(
    [
      { step: jumpAt, type: 'jump' },
      { step: jumpAt + 20, type: 'dash' }
    ],
    jumpAt + delay + 80
  );
  assert.ok(run.ghosts.length >= 1, 'expected a ghost');
  var g = run.ghosts[0];
  var past = run.history[g.simStep - 1];
  assert.ok(past, 'missing history at ' + (g.simStep - 1));
  almost(g.body.x, past.x, 1e-6, 'ghost.x');
  almost(g.body.y, past.y, 1e-6, 'ghost.y');
  almost(g.body.vx, past.vx, 1e-6, 'ghost.vx');
  almost(g.body.vy, past.vy, 1e-6, 'ghost.vy');
  almost(g.body.autoX, past.autoX, 1e-6, 'ghost.autoX');
});

check('ghost cap drops oldest', function () {
  var inputs = [];
  for (var i = 0; i < 10; i++) {
    inputs.push({ step: 130 + i * 8, type: 'jump' });
  }
  var run = runScripted(inputs, 130 + 9 * 8 + 90 + 5);
  assert.strictEqual(run.ghosts.length, 8);
  assert.strictEqual(run.ghosts[0].bornStep, 130 + 2 * 8);
});

check('survive score is surviveSec * 10', function () {
  var platform = createHeadless();
  var game = createGame(platform, config);
  for (var i = 0; i < 60; i++) game.stepOnce();
  var snap = game.getDebugState().score;
  assert.strictEqual(snap.score, 10);
  almost(snap.surviveSec, 1, 1e-6, 'surviveSec');
});

check('near-miss +30 and 3-in-a-row multiplier', function () {
  var s = createScore(config);
  s.tick(0, 0);
  assert.ok(s.nearMiss('a', 100));
  assert.ok(s.nearMiss('b', 200));
  assert.ok(s.nearMiss('c', 300));
  var snap = s.snapshot(400);
  assert.strictEqual(snap.score, 90);
  assert.strictEqual(s.multiplierAt(400), 1.5);
  assert.strictEqual(s.multiplierAt(2300), 1.5);
  assert.strictEqual(s.multiplierAt(2301), 1);
  assert.ok(!s.nearMiss('a', 500));
});

check('aabb near-miss vs overlap', function () {
  var a = { x: 0, y: 0, w: 16, h: 28 };
  var b = { x: 20, y: 0, w: 16, h: 28 };
  almost(collision.aabbGap(a, b), 4, 1e-9, 'gap');
  assert.strictEqual(collision.aabbOverlap(a, b), false);
  var c = { x: 10, y: 0, w: 16, h: 28 };
  assert.strictEqual(collision.aabbOverlap(a, c), true);
  almost(collision.aabbGap(a, c), 0, 1e-9, 'overlap gap');
});

check('settle records gap to high score', function () {
  var session = sessionMod.createSession(1);
  sessionMod.kill(session, 'ghost', { score: 40, surviveSec: 4 }, 100);
  assert.strictEqual(session.settle.isRecord, false);
  assert.strictEqual(session.settle.gap, 60);
  sessionMod.kill(session, 'terrain', { score: 120, surviveSec: 8 }, 100);
  assert.strictEqual(session.settle.isRecord, true);
  assert.strictEqual(session.settle.gap, 0);
});

check('jump-low and dash-under-high still required', function () {
  var smoke = batch.smokeNarrative(config);
  assert.strictEqual(smoke.walkLowDies, true);
  assert.strictEqual(smoke.jumpLowLives, true);
  assert.strictEqual(smoke.walkHighDies, true);
  assert.strictEqual(smoke.jumpHighDies, true);
  assert.strictEqual(smoke.dashHighLives, true);
});

check('80-run median survive >= 12s', function () {
  var result = batch.runBatch(80, config);
  assert.ok(
    result.stats.median >= 12,
    'median ' + result.stats.median + ' causes ' + JSON.stringify(result.stats.causes)
  );
});

check('share fields are mocked', function () {
  var fields = share.buildShareFields({ score: 88, surviveSec: 7.2 });
  assert.ok(fields.title.indexOf('88') >= 0);
  assert.ok(fields.imageUrl.indexOf('mock://') === 0);
  assert.ok(fields.query.indexOf('score=88') >= 0);
});

check('full loop: die then replay', function () {
  var platform = createHeadless();
  var game = createGame(platform, config);
  for (var i = 0; i < 30; i++) game.stepOnce();
  assert.strictEqual(game.getDebugState().hudMode, 'run');
  game.requestJump();
  for (var j = 0; j < 900; j++) {
    if (j % 45 === 0) game.requestJump();
    game.stepOnce();
    if (!game.getDebugState().session.alive) break;
  }
  var dead = game.getDebugState();
  assert.strictEqual(dead.session.alive, false);
  assert.ok(dead.session.settle, 'expected settle');
  assert.ok(dead.session.settle.score >= 0);
  assert.strictEqual(dead.hudMode, 'settle');
  game.replay();
  var again = game.getDebugState();
  assert.strictEqual(again.session.alive, true);
  assert.strictEqual(again.hudMode, 'run');
  assert.strictEqual(again.session.simStep, 0);
  assert.strictEqual(again.player.x, config.physics.startX);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
