'use strict';

var assert = require('assert');

var config = require('../js/config.json');
var ringDetect = require('../js/ringDetect');
var score = require('../js/score');
var attract = require('../js/attract');
var storage = require('../js/storage');
var sessionMod = require('../js/session');
var hud = require('../js/hud');
var inputPath = require('../js/inputPath');

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

function star(id, x, y) {
  return {
    id: id,
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    tier: 1,
    phase: 0,
    radius: 6
  };
}

function squareRingStars() {
  return [
    star(0, 120, 220),
    star(1, 190, 220),
    star(2, 190, 290),
    star(3, 120, 290),
    star(4, 140, 238),
    star(5, 155, 242),
    star(6, 170, 248),
    star(7, 145, 260),
    star(8, 162, 265),
    star(9, 150, 252),
    star(10, 80, 180),
    star(11, 260, 340)
  ];
}

function loadField(session, stars) {
  session.field.stars = stars;
}

function tap(session, s) {
  return sessionMod.handlePointer(session, s.x, s.y);
}

function closeSquare(session) {
  var stars = session.field.stars;
  tap(session, stars[0]);
  tap(session, stars[1]);
  tap(session, stars[2]);
  tap(session, stars[3]);
  return tap(session, stars[0]);
}

function linkMax() {
  return 200;
}

function walk(path, stars, ids) {
  for (var i = 0; i < ids.length; i++) {
    var r = inputPath.handleStarTap(path, stars, ids[i], linkMax());
    assert.ok(r.ok, 'walk ' + ids[i] + ' -> ' + r.reason);
  }
}

check('reconnect to start with >=4 nodes closes via winding', function () {
  var stars = squareRingStars();
  var path = inputPath.create();
  walk(path, stars, [0, 1, 2, 3]);
  assert.deepStrictEqual(path.starIds, [0, 1, 2, 3]);
  var close = inputPath.handleStarTap(path, stars, 0, linkMax());
  assert.strictEqual(close.ok, true);
  assert.strictEqual(close.reason, 'closed');
  assert.ok(close.ring && close.ring.closed);
  assert.strictEqual(close.ring.kind, 'winding');
  assert.deepStrictEqual(path.starIds, [0, 1, 2, 3, 0]);
});

check('reconnect to a non-start already-used star is rejected', function () {
  var stars = squareRingStars();
  var path = inputPath.create();
  walk(path, stars, [0, 1, 2, 3]);
  var mid = inputPath.handleStarTap(path, stars, 1, linkMax());
  assert.strictEqual(mid.ok, false);
  assert.strictEqual(mid.reason, 'already-used');
  assert.deepStrictEqual(path.starIds, [0, 1, 2, 3]);
});

check('self-link when length < 4 is rejected', function () {
  var stars = squareRingStars();
  var path = inputPath.create();
  walk(path, stars, [0]);
  var self = inputPath.handleStarTap(path, stars, 0, linkMax());
  assert.strictEqual(self.ok, false);
  assert.strictEqual(self.reason, 'same-star');
  walk(path, stars, [1, 2]);
  var early = inputPath.handleStarTap(path, stars, 0, linkMax());
  assert.strictEqual(early.ok, false);
  assert.strictEqual(early.reason, 'already-used');
  assert.deepStrictEqual(path.starIds, [0, 1, 2]);
});

check('winding number is signed, not even-odd ray cast', function () {
  var ccw = [
    { x: 0, y: 0, id: 0 },
    { x: 100, y: 0, id: 1 },
    { x: 100, y: 100, id: 2 },
    { x: 0, y: 100, id: 3 }
  ];
  var cw = ccw.slice().reverse();
  assert.strictEqual(ringDetect.windingNumber({ x: 50, y: 50 }, ccw), 1);
  assert.strictEqual(ringDetect.windingNumber({ x: 50, y: 50 }, cw), -1);
  assert.strictEqual(ringDetect.windingNumber({ x: 150, y: 50 }, ccw), 0);
});

check('close needs return-to-start and nodes >= 4', function () {
  var stars = squareRingStars();
  var tri = ringDetect.detectClosedRing([0, 1, 2, 0], stars);
  assert.strictEqual(tri.closed, false);
  assert.strictEqual(tri.nodes, 3);

  var open = ringDetect.detectClosedRing([0, 1, 2, 3], stars);
  assert.strictEqual(open.closed, false);

  var closed = ringDetect.detectClosedRing([0, 1, 2, 3, 0], stars, {
    playRect: hud.layout(viewport()).playRect,
    config: config
  });
  assert.strictEqual(closed.closed, true);
  assert.strictEqual(closed.nodes, 4);
  assert.strictEqual(closed.kind, 'winding');
});

check('in-ring set uses the same vertices as area', function () {
  var stars = squareRingStars();
  var ids = [0, 1, 2, 3, 0];
  var verts = ringDetect.polygonFromPath(ids, stars);
  var ring = ringDetect.detectClosedRing(ids, stars, {
    playRect: hud.layout(viewport()).playRect,
    config: config
  });
  assert.strictEqual(ring.vertices.length, verts.length);
  for (var i = 0; i < verts.length; i++) {
    assert.strictEqual(ring.vertices[i].id, verts[i].id);
    assert.strictEqual(ring.vertices[i].x, verts[i].x);
    assert.strictEqual(ring.vertices[i].y, verts[i].y);
  }
  assert.strictEqual(Math.abs(ring.area), Math.abs(ringDetect.shoelace(verts)));
  assert.ok(ring.inRingCount >= 6, 'expected interiors, got ' + ring.inRingCount);
  var inIds = ring.inRing.map(function (s) { return s.id; }).sort();
  assert.deepStrictEqual(inIds, [4, 5, 6, 7, 8, 9]);
  assert.ok(inIds.indexOf(10) === -1);
  assert.ok(inIds.indexOf(0) === -1);
});

check('score formula, combo table, and perfect bonus', function () {
  var playRect = hud.layout(viewport()).playRect;
  var stars = squareRingStars();
  var ring = ringDetect.detectClosedRing([0, 1, 2, 3, 0], stars, {
    playRect: playRect,
    config: config
  });
  var first = score.scoreRing(ring, { comboCount: 0, hadUndo: false, config: config });
  var expectedBase = 4 * 20 + Math.floor(ring.areaFactor * ring.inRingCount * 15);
  assert.strictEqual(first.base, expectedBase);
  assert.strictEqual(first.multiplier, 1);
  assert.strictEqual(first.perfect, true);
  assert.strictEqual(first.bonus, 200);
  assert.strictEqual(first.score, expectedBase + 200);

  var c2 = score.scoreRing(ring, { comboCount: 1, hadUndo: false, config: config });
  assert.strictEqual(c2.multiplier, 1.5);
  var c3 = score.scoreRing(ring, { comboCount: 2, hadUndo: false, config: config });
  assert.strictEqual(c3.multiplier, 2);
  var c4 = score.scoreRing(ring, { comboCount: 3, hadUndo: false, config: config });
  assert.strictEqual(c4.multiplier, 2.5);
  var c5 = score.scoreRing(ring, { comboCount: 9, hadUndo: false, config: config });
  assert.strictEqual(c5.multiplier, 2.5);

  var dirty = score.scoreRing(ring, { comboCount: 0, hadUndo: true, config: config });
  assert.strictEqual(dirty.perfect, false);
  assert.strictEqual(dirty.bonus, 0);
});

check('combo window resets after 8s', function () {
  var a = score.advanceCombo({ count: 0, lastCloseAt: -1 }, 1000, 8000);
  assert.strictEqual(a.count, 0);
  assert.strictEqual(a.multiplier, 1);
  var b = score.advanceCombo(a, 2000, 8000);
  assert.strictEqual(b.count, 1);
  assert.strictEqual(b.multiplier, 1.5);
  var c = score.advanceCombo(b, 3000, 8000);
  assert.strictEqual(c.count, 2);
  var d = score.advanceCombo(c, 4000, 8000);
  assert.strictEqual(d.count, 3);
  var e = score.advanceCombo(d, 15000, 8000);
  assert.strictEqual(e.count, 0);
  assert.strictEqual(e.multiplier, 1);
});

check('session close awards score, clears interiors, keeps M0 undo', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config, 1);
  loadField(session, squareRingStars());
  var before = session.field.stars.length;
  var closed = closeSquare(session);
  assert.strictEqual(closed.kind, 'close');
  assert.ok(closed.awarded.score > 0);
  assert.strictEqual(session.score, closed.awarded.score);
  assert.deepStrictEqual(session.path.starIds, []);
  var still = {};
  session.field.stars.forEach(function (s) { still[s.id] = true; });
  assert.ok(!still[4] && !still[9], 'interiors should be cleared');
  assert.ok(still[0] && still[3], 'ring nodes remain');
  assert.ok(session.field.stars.length >= config.starCountMin || session.field.stars.length >= before - 6);

  loadField(session, squareRingStars());
  tap(session, session.field.stars[0]);
  tap(session, session.field.stars[1]);
  var undone = sessionMod.handlePointer(session, session.ui.undo.x + 8, session.ui.undo.y + 8);
  assert.strictEqual(undone.kind, 'undo');
  assert.deepStrictEqual(session.path.starIds, [0]);
});

check('undo-reconnect denies perfect; combo applies on second close', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config, 2);
  loadField(session, squareRingStars());
  tap(session, session.field.stars[0]);
  tap(session, session.field.stars[1]);
  inputPath.undo(session.path);
  tap(session, session.field.stars[1]);
  tap(session, session.field.stars[2]);
  tap(session, session.field.stars[3]);
  var first = tap(session, session.field.stars[0]);
  assert.strictEqual(first.kind, 'close');
  assert.strictEqual(first.awarded.perfect, false);
  assert.strictEqual(first.awarded.bonus, 0);

  loadField(session, squareRingStars());
  session.now = 0.4;
  var second = closeSquare(session);
  assert.strictEqual(second.awarded.multiplier, 1.5);
  assert.ok(second.awarded.score > first.awarded.base);
});

check('attract pulls an unselected star toward the path', function () {
  var pathStars = [star(0, 100, 100), star(1, 180, 100)];
  var loose = star(2, 140, 130);
  var moved = attract.applyAttract([loose], pathStars, 40, 0.2, null, 20);
  assert.ok(moved >= 1);
  assert.ok(loose.y < 130);
});

check('60s countdown settles with high score / gap / replay', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config, 3);
  loadField(session, squareRingStars());
  closeSquare(session);
  var scored = session.score;
  assert.ok(scored > 0);
  session.remainingMs = 1;
  sessionMod.update(session, 0.002);
  assert.strictEqual(session.phase, 'settle');
  assert.strictEqual(session.timer, 0);
  assert.ok(session.settle.isNew);
  assert.strictEqual(session.settle.score, scored);
  assert.strictEqual(session.settle.gap, 0);
  assert.strictEqual(storage.load().best, scored);

  var replay = sessionMod.handlePointer(
    session,
    session.ui.replay.x + 10,
    session.ui.replay.y + 10
  );
  assert.strictEqual(replay.kind, 'restart');
  assert.strictEqual(session.phase, 'play');
  assert.strictEqual(session.score, 0);
  assert.strictEqual(session.timer, 60);

  session.remainingMs = 1;
  sessionMod.update(session, 0.002);
  assert.strictEqual(session.phase, 'settle');
  assert.strictEqual(session.settle.isNew, false);
  assert.strictEqual(session.settle.gap, scored);

  var shared = sessionMod.handlePointer(
    session,
    session.ui.share.x + 10,
    session.ui.share.y + 10
  );
  assert.strictEqual(shared.kind, 'share');
  assert.ok(shared.share.mock);
});

check('HUD live fields and settle hit targets exist', function () {
  var ui = hud.layout(viewport());
  assert.ok(ui.combo);
  assert.ok(ui.replay && ui.share);
  assert.strictEqual(hud.hitTest(ui, ui.undo.x + 4, ui.undo.y + 4, 'play'), 'undo');
  assert.strictEqual(hud.hitTest(ui, ui.replay.x + 4, ui.replay.y + 4, 'settle'), 'replay');
});

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall M1 checks passed');
