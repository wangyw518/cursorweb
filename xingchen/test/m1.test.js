'use strict';

var assert = require('assert');

var config = require('../js/config.json');
var scoreRings = require('../js/scoreRings');
var score = require('../js/score');
var table = require('../js/table');
var hud = require('../js/hud');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var stopDetect = require('../js/stopDetect');

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

function freshSession() {
  storage.resetMemory();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storage.KEY);
  } catch (err) {}
  return sessionMod.create(viewport(), config);
}

function tickUntilSettled(session, maxSteps) {
  var i;
  for (i = 0; i < (maxSteps || 400); i++) {
    sessionMod.update(session, config.fixedDt);
    if (session.phase === 'scored' || session.phase === 'settle') return session.award;
  }
  return session.award;
}

check('annular band scores; hole and outside miss', function () {
  var rings = [{ x: 0, y: 0, innerR: 20, outerR: 40, tier: 1, colorKey: 'ringBlue' }];
  assert.strictEqual(scoreRings.inBand(rings[0], 30, 0), true);
  assert.strictEqual(scoreRings.inBand(rings[0], 10, 0), false);
  assert.strictEqual(scoreRings.inBand(rings[0], 50, 0), false);

  var hit = scoreRings.pick(rings, 30, 0, 3);
  assert.strictEqual(hit.ring.tier, 1);
  var missHole = score.fromPick(scoreRings.pick(rings, 8, 0, 3), config);
  assert.strictEqual(missHole.score, 0);
  assert.strictEqual(missHole.miss, true);
  var missOut = score.fromPick(scoreRings.pick(rings, 55, 0, 3), config);
  assert.strictEqual(missOut.score, 0);
});

check('overlap prefers highest tier; same tier prefers smaller ring', function () {
  var high = { x: 0, y: 0, innerR: 10, outerR: 40, tier: 3, colorKey: 'ringGold' };
  var low = { x: 0, y: 0, innerR: 8, outerR: 50, tier: 0, colorKey: 'ringGreen' };
  var picked = scoreRings.pick([low, high], 25, 0, 3);
  assert.strictEqual(picked.ring.tier, 3);

  var big = { x: 0, y: 0, innerR: 10, outerR: 50, tier: 0, colorKey: 'ringGreen' };
  var small = { x: 0, y: 0, innerR: 12, outerR: 30, tier: 0, colorKey: 'ringGreen' };
  var same = scoreRings.pick([big, small], 20, 0, 3);
  assert.strictEqual(same.ring.outerR, 30);

  var award = score.fromPick(picked, config);
  assert.strictEqual(award.score, 200);
});

check('edge ±edgePx multiplies by 1.2 on the chosen ring', function () {
  var ring = { x: 0, y: 0, innerR: 20, outerR: 40, tier: 2, colorKey: 'ringPurple' };
  var rim = scoreRings.pick([ring], 40, 0, 3);
  assert.strictEqual(rim.edge, true);
  var mid = scoreRings.pick([ring], 30, 0, 3);
  assert.strictEqual(mid.edge, false);
  var innerRim = scoreRings.pick([ring], 21, 0, 3);
  assert.strictEqual(innerRim.edge, true);

  var edged = score.fromPick(rim, config);
  assert.strictEqual(edged.multiplier, 1.2);
  assert.strictEqual(edged.score, 96);
  assert.strictEqual(score.fromPick(mid, config).score, 80);
});

check('OOB (center past bounds) scores 0 immediately and beats stop detect', function () {
  var session = freshSession();
  var b = session.table.bounds;
  assert.strictEqual(table.isOutOfBounds(b, b.x + 10, b.y + 10), false);
  assert.strictEqual(table.isOutOfBounds(b, b.x - 1, b.y + 10), true);

  sessionMod.debugPlace(session, b.x - 2, b.y + b.h * 0.5, 0, 0);
  sessionMod.update(session, config.fixedDt);
  assert.ok(session.award, 'OOB awards on the first flight tick');
  assert.strictEqual(session.award.oob, true);
  assert.strictEqual(session.award.score, 0);
  assert.strictEqual(session.stop.stopped, false);
});

check('stopped on an epic sigil awards 180 and writes local best', function () {
  var session = freshSession();
  var epic = session.cells.filter(function (c) { return c.tier === 3; })[0];
  sessionMod.debugPlace(session, epic.x + epic.w * 0.5, epic.y + epic.h * 0.5, 0, 0);
  var award = tickUntilSettled(session, 20);
  assert.ok(award);
  assert.strictEqual(award.tier, 3);
  assert.strictEqual(award.score, 180);
  assert.ok(session.level.won);
  assert.strictEqual(session.settle.isNew, true);
  assert.strictEqual(storage.load().best, 180);
});

check('settle shows gap to best when not a record; replay restores aim', function () {
  storage.resetMemory();
  storage.save({ best: 200 });
  var session = sessionMod.create(viewport(), config);
  assert.strictEqual(session.best, 200);
  var bronze = session.cells.filter(function (c) { return c.tier === 0; })[0];
  session.level.shotsLeft = 1;
  sessionMod.debugPlace(session, bronze.x + bronze.w * 0.5, bronze.y + bronze.h * 0.5, 0, 0);
  tickUntilSettled(session, 20);
  assert.strictEqual(session.settle.score, 20);
  assert.strictEqual(session.settle.isNew, false);
  assert.strictEqual(session.settle.gap, 180);

  var i;
  for (i = 0; i < 30; i++) sessionMod.update(session, config.fixedDt);
  assert.strictEqual(session.phase, 'settle');

  var replay = hud.hitTest(
    session.ui,
    session.ui.replay.x + 20,
    session.ui.replay.y + 10,
    'settle'
  );
  assert.strictEqual(replay, 'replay');
  sessionMod.handlePointerDown(
    session,
    session.ui.replay.x + 20,
    session.ui.replay.y + 10
  );
  assert.strictEqual(session.phase, 'aim');
  assert.strictEqual(session.best, 200);
});

check('session has no timer field in the loop', function () {
  assert.ok(!Object.prototype.hasOwnProperty.call(config, 'sessionMs'));
  var session = freshSession();
  assert.strictEqual(session.timer, undefined);
  assert.strictEqual(session.remainingMs, undefined);
});

check('ring tiers stay 10/30/80/200; cell tiers are 20/50/100/180', function () {
  assert.deepStrictEqual(config.tiers, [10, 30, 80, 200]);
  assert.deepStrictEqual(config.cellTiers, [20, 50, 100, 180]);
  assert.strictEqual(score.tierPoints(0, config), 10);
  assert.strictEqual(score.tierPoints(3, config), 200);
  assert.strictEqual(score.cellPoints(0, config), 20);
  assert.strictEqual(score.cellPoints(3, config), 180);
});

check('stop hold is 120ms before a table stop scores', function () {
  var session = freshSession();
  var bronze = session.cells.filter(function (c) { return c.tier === 0; })[0];
  sessionMod.debugPlace(session, bronze.x + bronze.w * 0.5, bronze.y + bronze.h * 0.5, 0, 0);
  sessionMod.update(session, 0.06);
  assert.strictEqual(session.phase, 'flight');
  assert.ok(session.stop.holdMs >= 60);
  assert.strictEqual(stopDetect.isStopped(session.stop), false);
  sessionMod.update(session, 0.06);
  assert.ok(session.phase === 'scored' || session.phase === 'settle');
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m1 ok');
