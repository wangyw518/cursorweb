'use strict';

var assert = require('assert');

var config = require('../js/config.json');
var physics = require('../js/physics');
var launcher = require('../js/launcher');
var stopDetect = require('../js/stopDetect');
var sessionMod = require('../js/session');
var storage = require('../js/storage');

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
  return sessionMod.create(viewport(), config);
}

check('drag aim sets opposite fire direction and clamped power', function () {
  var gun = launcher.create({ x: 100, y: 200, w: 78, h: 30 }, config);
  var ball = launcher.restBall(gun, 9);
  launcher.beginDrag(gun, 100, 200 + 66, ball);
  assert.ok(gun.dragging);
  assert.ok(Math.abs(gun.power - 0.5) < 0.02);
  assert.ok(gun.ay < -0.9);
  assert.ok(Math.abs(gun.ax) < 0.15);

  launcher.moveDrag(gun, 100, 200 + 400, ball);
  assert.strictEqual(gun.power, 1);

  var shot = launcher.endDrag(gun, config);
  assert.strictEqual(shot.fired, true);
  assert.ok(shot.vy < 0);
  assert.ok(Math.abs(shot.vx) < 40);
  assert.ok(Math.abs(shot.vy + config.powerSpeed) < 1e-6);
});

check('weak drag cancels instead of firing', function () {
  var gun = launcher.create({ x: 80, y: 80, w: 78, h: 30 }, config);
  var ball = launcher.restBall(gun, 9);
  launcher.beginDrag(gun, 80, 82, ball);
  var shot = launcher.endDrag(gun, config);
  assert.strictEqual(shot.fired, false);
});

check('physics reflects off a static wall and clamps maxSpeed', function () {
  var body = physics.createBody(160, 200, 9);
  body.vx = 220;
  body.vy = 0;
  var world = {
    ball: body,
    walls: [{ x1: 200, y1: 40, x2: 200, y2: 360, r: 5 }],
    obstacles: []
  };
  var hit = false;
  var i;
  for (i = 0; i < 40; i++) {
    var step = physics.step(world, config.fixedDt, config);
    if (step.hit) hit = true;
  }
  assert.strictEqual(hit, true);
  assert.ok(body.vx < 0, 'vx should reverse after wall hit, got ' + body.vx);
  assert.ok(body.x < 200 - 9, 'center stays left of wall');

  body.vx = 4000;
  body.vy = 0;
  physics.clampSpeed(body, config.maxSpeed);
  assert.ok(Math.hypot(body.vx, body.vy) <= config.maxSpeed + 1e-6);
});

check('physics reflects off a static circle obstacle', function () {
  var body = physics.createBody(100, 200, 9);
  body.vx = 260;
  body.vy = 0;
  var world = {
    ball: body,
    walls: [],
    obstacles: [{ x: 160, y: 200, r: 14 }]
  };
  var hit = false;
  var i;
  for (i = 0; i < 50; i++) {
    if (physics.step(world, config.fixedDt, config).hit) hit = true;
  }
  assert.strictEqual(hit, true);
  assert.ok(body.vx < 0, 'should bounce left off the asteroid');
});

check('stopDetect requires |v|<stopSpeed for stopHoldMs and resets on spike', function () {
  var state = stopDetect.create();
  stopDetect.tick(state, 5, 0.06, 12, 120);
  assert.strictEqual(state.stopped, false);
  stopDetect.tick(state, 5, 0.06, 12, 120);
  assert.strictEqual(state.stopped, true);
  stopDetect.tick(state, 20, config.fixedDt, 12, 120);
  assert.strictEqual(state.stopped, false);
  assert.strictEqual(state.holdMs, 0);
});

check('trajectory preview is a reflection polyline, not a full sim', function () {
  var body = physics.createBody(80, 200, 9);
  var world = {
    ball: body,
    walls: [{ x1: 200, y1: 20, x2: 200, y2: 380, r: 5 }],
    obstacles: []
  };
  var prev = physics.preview(body, 1, 0, world, config);
  assert.ok(prev.points.length >= 3);
  assert.ok(prev.bounces >= 1);
  var mid = prev.points[1];
  assert.ok(mid.x > 160 && mid.x < 230, 'first bounce near the wall');
  var last = prev.points[prev.points.length - 1];
  assert.ok(last.x < mid.x, 'reflected segment travels back left');
});

check('session aim → fire → collide → stop feel', function () {
  var session = freshSession();
  assert.strictEqual(session.phase, 'aim');
  var ball = session.ball;
  var down = sessionMod.handlePointerDown(session, ball.x, ball.y + 40);
  assert.strictEqual(down.kind, 'charge');
  assert.strictEqual(session.phase, 'charging');
  sessionMod.handlePointerMove(session, ball.x, ball.y + 90);
  assert.ok(session.launcher.power > 0.4);
  assert.ok(session.preview.points.length >= 2);
  var fire = sessionMod.handlePointerUp(session, ball.x, ball.y + 90);
  assert.strictEqual(fire.kind, 'fire');
  assert.strictEqual(session.phase, 'flight');
  assert.ok(session.ball.vy < 0);

  var i;
  var sawHit = false;
  for (i = 0; i < 240; i++) {
    sessionMod.update(session, config.fixedDt);
    if (session.lastHit) sawHit = true;
    if (session.award) break;
  }
  assert.ok(session.award, 'stop yields an award');
  assert.ok(session.phase === 'aim' || session.phase === 'scored' || session.phase === 'settle');
  assert.ok(sawHit || session.award.oob || session.award.score >= 0);
});

check('drag can start from the table, not only the capsule', function () {
  var session = freshSession();
  var b = session.table.bounds;
  var mid = sessionMod.handlePointerDown(session, b.x + b.w * 0.5, b.y + b.h * 0.55);
  assert.strictEqual(mid.kind, 'charge');
  assert.strictEqual(session.phase, 'charging');
});

check('fixed dt is 1/60', function () {
  assert.ok(Math.abs(config.fixedDt - 1 / 60) < 1e-12);
  assert.strictEqual(config.stopHoldMs, 120);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m0 ok');
