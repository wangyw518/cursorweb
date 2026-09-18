'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var physics = require('../js/physics');
var table = require('../js/table');
var balls = require('../js/balls');
var hud = require('../js/hud');

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

function board() {
  var ui = hud.layout({
    width: 375, height: 667, pixelRatio: 2, statusBarHeight: 20, safeTop: 20, safeBottom: 0
  });
  return table.layout({ width: 375, height: 667 }, config, ui.playRect);
}

check('equal-mass ball collision transfers momentum along the normal', function () {
  var a = physics.createBody(100, 100, 8);
  var b = physics.createBody(115, 100, 8);
  a.vx = 80;
  b.vx = 0;
  physics.resolveBallBall(a, b, 1);
  assert.ok(a.vx < 80);
  assert.ok(b.vx > 0);
  assert.ok(Math.abs((a.vx + b.vx) - 80) < 1e-6);
});

check('cushion bounce reverses the incoming normal component', function () {
  var body = physics.createBody(160, 80, 8);
  body.vy = -120;
  var wall = { x1: 40, y1: 40, x2: 280, y2: 40, r: 3, nx: 0, ny: 1 };
  var i;
  for (i = 0; i < 20; i++) {
    body.x += body.vx * config.fixedDt;
    body.y += body.vy * config.fixedDt;
    physics.resolveCushion(body, wall, 0.7);
  }
  assert.ok(body.vy > 0, 'should bounce downward off the top rail');
});

check('friction damps speed toward a stop', function () {
  var body = physics.createBody(120, 200, 8);
  body.vx = 200;
  var world = { balls: [body], walls: [], pockets: [] };
  var i;
  for (i = 0; i < 240; i++) physics.step(world, config.fixedDt, config);
  assert.ok(physics.hypot(body.vx, body.vy) < config.stopSpeed);
});

check('ball center inside pocket radius is pocketed', function () {
  var t = board();
  var body = physics.createBody(t.pockets[0].x, t.pockets[0].y, config.ballRadius);
  body.vx = 10;
  var world = { balls: [body], walls: t.walls, pockets: t.pockets };
  var ev = physics.step(world, config.fixedDt, config);
  assert.strictEqual(body.pocketed, true);
  assert.ok(ev.pockets.length >= 1);
});

check('9-ball rack has numbers 1-9 and lowest remaining is 1', function () {
  var t = board();
  var list = balls.create(t, config);
  assert.strictEqual(list.length, 10);
  assert.strictEqual(balls.cueBall(list).id, 'cue');
  assert.strictEqual(balls.lowestNumbered(list).n, 1);
  list.filter(function (b) { return b.n === 1; })[0].pocketed = true;
  assert.strictEqual(balls.lowestNumbered(list).n, 2);
});

check('pocket centers sit on the cushion line / outside corners, not inward on cloth', function () {
  var t = board();
  var felt = t.felt;
  var corners = t.pockets.filter(function (p) { return p.kind === 'corner'; });
  corners.forEach(function (p) {
    var insideX = p.x > felt.x + 2 && p.x < felt.x + felt.w - 2;
    var insideY = p.y > felt.y + 2 && p.y < felt.y + felt.h - 2;
    assert.ok(!(insideX && insideY), p.id + ' should not sit inward on the cloth');
    assert.ok(p.x < felt.x || p.x > felt.x + felt.w, p.id + ' corner x sits outside the cushion line');
    assert.ok(p.y < felt.y || p.y > felt.y + felt.h, p.id + ' corner y sits outside the cushion line');
  });
  var sides = t.pockets.filter(function (p) { return p.kind === 'side'; });
  sides.forEach(function (p) {
    assert.ok(p.x < felt.x || p.x > felt.x + felt.w, p.id + ' side pocket should sit outside the felt');
  });
});

check('pockets are oversized with a mouth wider than the ball', function () {
  var t = board();
  var ballR = config.ballRadius;
  assert.ok(config.pocketRadius >= ballR * 2, 'pocketR should be at least 2× ballR');
  t.pockets.forEach(function (p) {
    assert.ok(p.r >= ballR * 2, p.id + ' radius ' + p.r);
  });
  assert.ok(t.mouthGap >= ballR * 2.15, 'mouth gap ' + t.mouthGap);
  var cornerOpen = t.mouthGap * Math.SQRT2 - 2 * (config.wallRadius || 0);
  assert.ok(cornerOpen > ballR * 2, 'corner jaws must pass a ball, got ' + cornerOpen);
});

check('a ball aimed at a corner mouth falls in', function () {
  var t = board();
  var p = t.pockets[0];
  var body = physics.createBody(t.felt.x + config.ballRadius + 3, t.felt.y + config.ballRadius + 3, config.ballRadius);
  body.vx = -240;
  body.vy = -240;
  var world = { balls: [body], walls: t.walls, pockets: t.pockets };
  var i;
  for (i = 0; i < 90; i++) physics.step(world, config.fixedDt, config);
  assert.strictEqual(body.pocketed, true);
});

check('full cue power can reach the 9-ball rack from the kitchen', function () {
  var t = board();
  var list = balls.create(t, config);
  var cueBall = balls.cueBall(list);
  var one = list.filter(function (b) { return b.n === 1; })[0];
  cueBall.vx = 0;
  cueBall.vy = -config.powerSpeed;
  var world = { balls: list, walls: t.walls, pockets: t.pockets };
  var reached = false;
  var i;
  for (i = 0; i < 180; i++) {
    physics.step(world, config.fixedDt, config);
    if (Math.hypot(cueBall.x - one.x, cueBall.y - one.y) <= cueBall.r + one.r + 1) {
      reached = true;
      break;
    }
  }
  assert.ok(reached, 'break power should reach the 1-ball');
});

check('aim preview returns a dashed polyline and optional ghost', function () {
  var t = board();
  var list = balls.create(t, config);
  var cueBall = balls.cueBall(list);
  var prev = physics.preview(cueBall, 0, -1, {
    balls: list, walls: t.walls, pockets: t.pockets
  }, config);
  assert.ok(prev.points.length >= 2);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('physics tests passed');
