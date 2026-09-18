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

check('pocket centers sit on/outside the cushion nose, not inward on cloth', function () {
  var t = board();
  var felt = t.felt;
  var corners = t.pockets.filter(function (p) { return p.kind === 'corner'; });
  corners.forEach(function (p) {
    var insideX = p.x > felt.x + 0.5 && p.x < felt.x + felt.w - 0.5;
    var insideY = p.y > felt.y + 0.5 && p.y < felt.y + felt.h - 0.5;
    assert.ok(!(insideX && insideY), p.id + ' must not sit inward on the cloth');
    assert.ok(p.x <= felt.x + 0.01 || p.x >= felt.x + felt.w - 0.01, p.id + ' corner x on/outside nose');
    assert.ok(p.y <= felt.y + 0.01 || p.y >= felt.y + felt.h - 0.01, p.id + ' corner y on/outside nose');
  });
  var sides = t.pockets.filter(function (p) { return p.kind === 'side'; });
  sides.forEach(function (p) {
    assert.ok(p.x <= felt.x + 0.01 || p.x >= felt.x + felt.w - 0.01, p.id + ' side on/outside nose');
  });
});

check('HARD: pocketR > ballR and pocketR >= 1.85 * ballR', function () {
  var ballR = config.ballRadius;
  var radii = table.resolveRadii(config);
  assert.ok(config.pocketRadius > ballR, 'config pocketR must exceed ballR');
  assert.ok(config.pocketRadius >= ballR * table.MIN_POCKET_RATIO,
    'config pocketR ' + config.pocketRadius + ' < 1.85× ballR');
  assert.ok(radii.pocketR > radii.ballR);
  assert.ok(radii.pocketR >= radii.ballR * 1.85);
  var t = board();
  t.pockets.forEach(function (p) {
    assert.ok(p.r > ballR, p.id + ' pocketR ' + p.r + ' must be > ballR ' + ballR);
    assert.ok(p.r >= ballR * 1.85, p.id + ' pocketR ' + p.r + ' must be >= 1.85× ballR');
    if (p.kind === 'corner') {
      assert.ok(p.r >= ballR * 2.0, p.id + ' corner pocketR should be >= 2× ballR');
    }
  });
  assert.ok(t.mouthGap >= ballR * 2.15, 'mouth gap ' + t.mouthGap);
  var cornerOpen = t.mouthGap * Math.SQRT2 - 2 * (config.wallRadius || 0);
  assert.ok(cornerOpen > ballR * 2, 'corner jaws must pass a ball, got ' + cornerOpen);
});

check('undersized pocketRadius is clamped so CI cannot ship pocketR <= ballR', function () {
  var tiny = table.resolveRadii({ ballRadius: 8.2, pocketRadius: 7 });
  assert.ok(tiny.pocketR > tiny.ballR);
  assert.ok(tiny.pocketR >= tiny.ballR * 1.85);
  var ui = hud.layout({
    width: 375, height: 667, pixelRatio: 2, statusBarHeight: 20, safeTop: 20, safeBottom: 0
  });
  var t = table.layout({ width: 375, height: 667 }, { ballRadius: 8.2, pocketRadius: 7, railThickness: 24, wallRadius: 3.2 }, ui.playRect);
  t.pockets.forEach(function (p) {
    assert.ok(p.r > 8.2);
    assert.ok(p.r >= 8.2 * 1.85);
  });
});

check('cloth-side pocket opening is larger than the ball (not a sliver in the rail)', function () {
  var t = board();
  var ballR = config.ballRadius;
  t.pockets.forEach(function (p) {
    var open = table.clothOpening(p, t.felt);
    assert.ok(open > ballR, p.id + ' cloth opening ' + open + ' must exceed ballR ' + ballR);
  });
});

check('a ball aimed at a corner mouth falls in', function () {
  var t = board();
  var body = physics.createBody(t.felt.x + config.ballRadius + 3, t.felt.y + config.ballRadius + 3, config.ballRadius);
  body.vx = -240;
  body.vy = -240;
  var world = { balls: [body], walls: t.walls, pockets: t.pockets };
  var i;
  for (i = 0; i < 90; i++) physics.step(world, config.fixedDt, config);
  assert.strictEqual(body.pocketed, true);
});

check('a ball rolling along the cushion into a corner is pocketed', function () {
  var t = board();
  var r = config.ballRadius;
  var body = physics.createBody(t.felt.x + t.mouthGap + 8, t.felt.y + r + 3.4, r);
  body.vx = -280;
  body.vy = 0;
  var world = { balls: [body], walls: t.walls, pockets: t.pockets };
  var i;
  for (i = 0; i < 140; i++) physics.step(world, config.fixedDt, config);
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

check('object balls stay frozen until the cue contacts them', function () {
  var cueBall = physics.createBody(40, 100, 8);
  cueBall.id = 'cue';
  cueBall.vx = 180;
  var a = physics.createBody(220, 97, 8);
  a.id = 'b1';
  var b = physics.createBody(230, 103, 8);
  b.id = 'b2';
  var ax = a.x;
  var ay = a.y;
  var bx = b.x;
  var by = b.y;
  var world = { balls: [cueBall, a, b], walls: [], pockets: [], lockObjects: true };
  var i;
  for (i = 0; i < 10; i++) physics.step(world, config.fixedDt, config);
  assert.ok(Math.abs(a.x - ax) < 1e-8, 'ghost/object A moved before cue contact');
  assert.ok(Math.abs(a.y - ay) < 1e-8);
  assert.ok(Math.abs(b.x - bx) < 1e-8, 'ghost/object B moved before cue contact');
  assert.ok(Math.abs(b.y - by) < 1e-8);
  assert.ok(cueBall.x > 40);
});

check('object balls move after the cue makes contact', function () {
  var cueBall = physics.createBody(80, 100, 8);
  cueBall.id = 'cue';
  cueBall.vx = 520;
  var one = physics.createBody(130, 100, 8);
  one.id = 'b1';
  var world = { balls: [cueBall, one], walls: [], pockets: [], lockObjects: true };
  var i;
  for (i = 0; i < 90; i++) physics.step(world, config.fixedDt, config);
  assert.ok(one.x > 130.5 || one.vx > 1, 'object ball should move after contact');
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

check('preview and frozen step never write object-ball positions', function () {
  var t = board();
  var list = balls.create(t, config);
  var before = balls.hashObjectBalls(list);
  var cueBall = balls.cueBall(list);
  physics.preview(cueBall, 0, -1, {
    balls: list, walls: t.walls, pockets: t.pockets
  }, config);
  assert.strictEqual(balls.hashObjectBalls(list), before);
  list[1].vx = 40;
  list[2].vy = -30;
  physics.step({
    balls: list, walls: t.walls, pockets: t.pockets, frozen: true
  }, config.fixedDt, config);
  assert.strictEqual(balls.hashObjectBalls(list), before);
  assert.strictEqual(list[1].x, balls.create(t, config)[1].x);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('physics tests passed');
