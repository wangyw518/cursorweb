'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var balls = require('../js/balls');
var tiles = require('../js/tiles');
var cue = require('../js/cue');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures += 1;
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

function fresh() {
  storage.resetMemory();
  return sessionMod.create(viewport(), config);
}

check('drag aim sets opposite fire direction and clamped power', function () {
  var stick = cue.create(config);
  var ball = { x: 100, y: 200, r: 8, pocketed: false };
  cue.beginDrag(stick, 100, 200 + 64, ball);
  assert.ok(stick.dragging);
  assert.ok(Math.abs(stick.power - 0.5) < 0.03);
  assert.ok(stick.ay < -0.9);
  var shot = cue.endDrag(stick, config);
  assert.strictEqual(shot.fired, true);
  assert.ok(shot.vy < 0);
});

check('weak drag cancels instead of firing', function () {
  var stick = cue.create(config);
  var ball = { x: 80, y: 80, r: 8, pocketed: false };
  cue.beginDrag(stick, 80, 82, ball);
  var shot = cue.endDrag(stick, config);
  assert.strictEqual(shot.fired, false);
});

check('session starts in aim with a 9-ball rack and 2D view', function () {
  var s = fresh();
  assert.strictEqual(s.phase, 'aim');
  assert.strictEqual(s.viewMode, '2d');
  assert.strictEqual(s.balls.length, 10);
  assert.strictEqual(s.target.n, 1);
  assert.ok(s.tiles.length > 0);
});

check('2D/3D stub toggle flips viewMode', function () {
  var s = fresh();
  var btn = s.ui.mode;
  sessionMod.handlePointerDown(s, btn.x + 8, btn.y + 8);
  assert.strictEqual(s.viewMode, '3d');
  sessionMod.toggleView(s);
  assert.strictEqual(s.viewMode, '2d');
});

check('debug legal stop awards points and can set a local best', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'score' && t.stars === 3; })[0];
  var settle = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    cushions: 2,
    firstContact: true,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(s.phase, 'settle');
  assert.ok(settle.legal);
  assert.ok(settle.points > 0);
  assert.strictEqual(settle.isNew, true);
  assert.strictEqual(s.best, settle.points);
  var saved = storage.load();
  assert.strictEqual(saved.best, settle.points);
});

check('debug miss settles at 0 and does not beat best', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, {
    pocketTarget: true,
    cushions: 3,
    x: s.tiles[0].x,
    y: s.tiles[0].y
  });
  var best = s.best;
  sessionMod.restart(s);
  var miss = sessionMod.debugForceStop(s, { pocketTarget: false, cushions: 4 });
  assert.strictEqual(miss.points, 0);
  assert.strictEqual(miss.legal, false);
  assert.strictEqual(s.best, best);
});

check('replay returns to aim with a fresh rack', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketTarget: true, cushions: 1 });
  var replay = s.ui.replay;
  sessionMod.handlePointerDown(s, replay.x + 10, replay.y + 10);
  assert.strictEqual(s.phase, 'aim');
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
  assert.strictEqual(s.shot.cushions, 0);
});

check('firing from a pull-back starts the rolling phase', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y + 8);
  sessionMod.handlePointerMove(s, cueBall.x, cueBall.y + 90);
  var up = sessionMod.handlePointerUp(s, cueBall.x, cueBall.y + 90);
  assert.strictEqual(up.kind, 'fire');
  assert.strictEqual(s.phase, 'rolling');
  assert.ok(cueBall.vy < 0);
});

check('a live shot reaches settle through physics', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y + 12);
  sessionMod.handlePointerMove(s, cueBall.x + 6, cueBall.y + 108);
  sessionMod.handlePointerUp(s, cueBall.x + 6, cueBall.y + 108);
  var i;
  for (i = 0; i < 720; i++) sessionMod.update(s, config.fixedDt);
  assert.strictEqual(s.phase, 'settle');
  assert.ok(s.settle);
  assert.ok(s.settle.points === 0 || s.settle.points > 0);
  assert.strictEqual(s.settle.disclaimer, config.disclaimer);
});

check('tile pick under cue center uses geometric tiles', function () {
  var s = fresh();
  var tile = s.tiles[3];
  var picked = tiles.pickAt(s.tiles, tile.x, tile.y);
  assert.strictEqual(picked.label, tile.label);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('session tests passed');
