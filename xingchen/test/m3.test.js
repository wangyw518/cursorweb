'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var config = require('../js/config.json');
var grid = require('../js/grid');
var skills = require('../js/skills');
var level = require('../js/level');
var stamina = require('../js/stamina');
var share = require('../js/share');
var ads = require('../js/ads');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var table = require('../js/table');
var hud = require('../js/hud');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures++;
    console.error('FAIL  ' + name);
    console.error('  ' + err.message);
  }
}

function viewport() {
  return {
    width: 375,
    height: 667,
    pixelRatio: 2,
    statusBarHeight: 20,
    safeTop: 20,
    safeBottom: 0
  };
}

function fresh(opts) {
  storage.resetMemory();
  return sessionMod.create(viewport(), config, opts);
}

function tickShot(session, maxSteps) {
  var i;
  for (i = 0; i < (maxSteps || 40); i++) {
    sessionMod.update(session, config.fixedDt);
    if (session.award) return session.award;
  }
  return session.award;
}

function board() {
  var ui = hud.layout(viewport());
  return table.layout(viewport(), config, ui.playRect);
}

check('grid treasure cells score by kind, not as filled rings', function () {
  var g = grid.create(board(), config);
  var relic = g.cells.filter(function (c) { return c.kind === 'relic'; })[0];
  assert.ok(relic);
  var cx = relic.x + relic.w * 0.5;
  var cy = relic.y + relic.h * 0.5;
  var hit = grid.harvest(g, cx, cy, { config: config });
  assert.strictEqual(hit.points, 60);
  assert.strictEqual(relic.collected, true);
  assert.strictEqual(grid.harvest(g, cx, cy, { config: config }).points, 0);

  var empty = g.cells.filter(function (c) { return c.kind === 'empty'; })[0];
  var miss = grid.harvest(g, empty.x + 4, empty.y + 4, { config: config });
  assert.strictEqual(miss.points, 0);
});

check('fire harvests the landing cell plus neighbors', function () {
  var g = grid.create(board(), config);
  var relic = g.cells.filter(function (c) { return c.kind === 'relic'; })[0];
  var burned = grid.harvest(g, relic.x + relic.w * 0.5, relic.y + relic.h * 0.5, {
    skill: 'fire',
    config: config
  });
  assert.ok(burned.points > 60, 'fire should add neighbor treasure');
  assert.ok(burned.cells.length >= 2);
});

check('ice doubles the landing treasure cell', function () {
  var g = grid.create(board(), config);
  var crystal = g.cells.filter(function (c) { return c.kind === 'crystal'; })[0];
  var iced = grid.harvest(g, crystal.x + crystal.w * 0.5, crystal.y + crystal.h * 0.5, {
    skill: 'ice',
    config: config
  });
  assert.strictEqual(iced.points, 36);
});

check('skills arm once per level; split yields three velocities', function () {
  var state = skills.create();
  assert.strictEqual(skills.arm(state, 'fire').ok, true);
  assert.strictEqual(skills.consume(state), 'fire');
  assert.strictEqual(skills.arm(state, 'fire').ok, false);
  assert.strictEqual(skills.arm(state, 'ice').ok, true);
  var vel = skills.splitVelocities(100, 0, config);
  assert.strictEqual(vel.length, 3);
  assert.ok(vel[1].vy !== 0 && vel[2].vy !== 0);
});

check('level is score-in-K-shots: win at target, lose when rods run out', function () {
  var lv = level.create(config, 1, { target: 50, shots: 2 });
  level.addScore(lv, 20);
  level.spendShot(lv);
  assert.strictEqual(level.evaluate(lv), 'continue');
  level.addScore(lv, 40);
  level.spendShot(lv);
  assert.strictEqual(level.evaluate(lv), 'win');

  var lose = level.create(config, 1, { target: 80, shots: 1 });
  level.addScore(lose, 10);
  level.spendShot(lose);
  assert.strictEqual(level.evaluate(lose), 'lose');
});

check('stamina starts at 30, spend/grant/regen', function () {
  var s = stamina.create({ stamina: 30, lastRegenAt: 0 }, config);
  assert.strictEqual(s.max, 30);
  assert.strictEqual(s.value, 30);
  assert.strictEqual(stamina.spend(s, 1), true);
  assert.strictEqual(s.value, 29);
  stamina.grant(s, 5);
  assert.strictEqual(s.value, 30);
  var low = stamina.create({ stamina: 0, lastRegenAt: 1000 }, config);
  assert.strictEqual(stamina.canStart(low, 1), false);
  stamina.regen(low, 1000 + config.staminaRegenMs * 2, config);
  assert.strictEqual(low.value, 2);
});

check('share and ad stubs restore stamina without cash copy', function () {
  var session = fresh();
  assert.ok(session.stamina.value <= 30);
  var before = session.stamina.value;
  session.stamina.value = 0;
  var sh = sessionMod.grantStub(session, 'share');
  assert.strictEqual(sh.mock, true);
  assert.strictEqual(session.stamina.value, 1);
  var ad = sessionMod.grantStub(session, 'ad');
  assert.strictEqual(ad.mock, true);
  assert.strictEqual(session.stamina.value, 6);
  assert.ok(before <= 30);
  assert.strictEqual(share.share({ grant: 1 }).kind, 'share');
  assert.strictEqual(ads.watch({ grant: 5 }).kind, 'ad');
});

check('session grid + level: gold ring can clear K-shot target', function () {
  var session = fresh();
  assert.strictEqual(session.level.shots, 3);
  assert.strictEqual(session.level.target, 80);
  assert.ok(session.stamina.value <= 29);
  var gold = session.rings.filter(function (r) { return r.tier === 3; })[0];
  sessionMod.debugPlace(session, gold.x + (gold.innerR + gold.outerR) * 0.5, gold.y, 0, 0);
  tickShot(session, 20);
  assert.ok(session.award.ringScore >= 200 || session.award.score >= 80);
  assert.ok(session.phase === 'scored' || session.phase === 'settle' || session.level.won);
});

check('split shot spawns extra balls', function () {
  var session = fresh();
  var ball = session.ball;
  sessionMod.handlePointerDown(session, ball.x, ball.y + 8);
  sessionMod.handlePointerMove(session, ball.x, ball.y + 90);
  skills.arm(session.skills, 'split');
  var fire = sessionMod.handlePointerUp(session, ball.x, ball.y + 90);
  assert.strictEqual(fire.skill, 'split');
  assert.strictEqual(session.balls.length, 3);
});

check('starting a level with 0 stamina is blocked until stub grant', function () {
  storage.resetMemory();
  storage.save({ best: 0, stamina: 0, lastRegenAt: Date.now(), levelId: 1 });
  var session = sessionMod.create(viewport(), config);
  assert.strictEqual(session.phase, 'need-stamina');
  sessionMod.grantStub(session, 'ad');
  assert.ok(session.stamina.value >= 5);
  var replay = hud.hitTest(session.ui, session.ui.replay.x + 8, session.ui.replay.y + 8, 'settle', session.settle);
  assert.ok(replay === 'replay' || replay === 'settle-block' || replay === 'share' || replay === 'ad');
});

check('copy stays off cash / gambling language', function () {
  var files = [
    'hud.js',
    'grid.js',
    'skills.js',
    'stamina.js',
    'share.js',
    'ads.js',
    'session.js',
    'config.json'
  ];
  var banned = /金币|筹码|赌博|赌局|红包|台球币|\bcash\b|\bcoin\b|\bbet\b/i;
  var i;
  for (i = 0; i < files.length; i++) {
    var text = fs.readFileSync(path.join(__dirname, '../js', files[i]), 'utf8');
    assert.ok(!banned.test(text), files[i] + ' contains banned copy');
  }
  var copy = hud.settleCopy({ won: true, target: 80, isNew: true });
  assert.ok(!banned.test(copy.title + copy.line));
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m3 ok');
