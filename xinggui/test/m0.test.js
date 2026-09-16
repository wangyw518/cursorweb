'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var config = require('../js/config.json');
var inputPath = require('../js/inputPath');
var starField = require('../js/starField');
var sessionMod = require('../js/session');
var ringDetect = require('../js/ringDetect');
var attract = require('../js/attract');
var score = require('../js/score');
var storage = require('../js/storage');
var share = require('../js/share');
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

function playRect() {
  return hud.layout(viewport()).playRect;
}

check('config freeze keys', function () {
  assert.strictEqual(config.linkMaxPxRatio, 0.22);
  assert.strictEqual(config.starCountMin, 18);
  assert.strictEqual(config.starCountMax, 28);
  assert.strictEqual(config.comboWindowMs, 8000);
  assert.ok(typeof config.attractRadius === 'number');
  assert.strictEqual(config.hitStopFrames, 3);
  assert.strictEqual(config.particleCap, 120);
  assert.ok(Math.abs(config.fixedDt - 1 / 60) < 1e-12);
  assert.ok(config.colors.deepSpace);
  assert.ok(config.colors.starCyan);
  assert.ok(config.colors.starMagenta);
  assert.ok(config.colors.neonPath);
});

check('star field count and two tiers', function () {
  for (var seed = 1; seed <= 12; seed++) {
    var field = starField.create(viewport(), config, playRect(), seed);
    assert.ok(field.stars.length >= config.starCountMin, 'min ' + seed);
    assert.ok(field.stars.length <= config.starCountMax, 'max ' + seed);
    var bright = 0;
    var dim = 0;
    for (var i = 0; i < field.stars.length; i++) {
      if (field.stars[i].tier === 1) bright++;
      else dim++;
    }
    assert.ok(bright > 0 && dim > 0, 'tiers seed ' + seed);
  }
});

check('stars drift on fixed dt', function () {
  var field = starField.create(viewport(), config, playRect(), 7);
  var before = field.stars.map(function (s) { return { x: s.x, y: s.y }; });
  for (var i = 0; i < 60; i++) starField.update(field, config.fixedDt);
  var moved = 0;
  for (var j = 0; j < field.stars.length; j++) {
    if (Math.abs(field.stars[j].x - before[j].x) > 0.01 ||
        Math.abs(field.stars[j].y - before[j].y) > 0.01) moved++;
  }
  assert.ok(moved > 0, 'expected drift');
});

function findPair(stars, linkMaxPx, wantInside) {
  for (var i = 0; i < stars.length; i++) {
    for (var j = i + 1; j < stars.length; j++) {
      var d = inputPath.distance(stars[i], stars[j]);
      if (wantInside && d <= linkMaxPx) return [stars[i], stars[j]];
      if (!wantInside && d > linkMaxPx) return [stars[i], stars[j]];
    }
  }
  return null;
}

check('tap start, legal link, reject long link, undo, clear', function () {
  var session = sessionMod.create(viewport(), config, 3);
  var linkMax = sessionMod.linkMaxPx(session);
  var inside = findPair(session.field.stars, linkMax, true);
  var outside = findPair(session.field.stars, linkMax, false);
  assert.ok(inside, 'need a legal pair');
  assert.ok(outside, 'need an illegal pair');

  var a = inside[0];
  var b = inside[1];
  var r0 = sessionMod.handlePointer(session, a.x, a.y);
  assert.strictEqual(r0.result.reason, 'started');
  assert.deepStrictEqual(session.path.starIds, [a.id]);

  var r1 = sessionMod.handlePointer(session, b.x, b.y);
  assert.strictEqual(r1.result.reason, 'linked');
  assert.deepStrictEqual(session.path.starIds, [a.id, b.id]);

  var far = outside[0].id === a.id || outside[0].id === b.id ? outside[1] : outside[0];
  if (session.path.starIds.indexOf(far.id) !== -1) {
    far = null;
    for (var i = 0; i < session.field.stars.length; i++) {
      var s = session.field.stars[i];
      if (session.path.starIds.indexOf(s.id) !== -1) continue;
      if (inputPath.distance(b, s) > linkMax) {
        far = s;
        break;
      }
    }
  }
  assert.ok(far, 'need a far star from the tip');
  var r2 = sessionMod.handlePointer(session, far.x, far.y);
  assert.strictEqual(r2.result.reason, 'too-far');
  assert.deepStrictEqual(session.path.starIds, [a.id, b.id]);

  var undo = sessionMod.handlePointer(session, session.ui.undo.x + 8, session.ui.undo.y + 8);
  assert.strictEqual(undo.kind, 'undo');
  assert.deepStrictEqual(session.path.starIds, [a.id]);

  var clr = sessionMod.handlePointer(session, session.ui.clear.x + 8, session.ui.clear.y + 8);
  assert.strictEqual(clr.kind, 'clear');
  assert.deepStrictEqual(session.path.starIds, []);
});

check('double-tap empty clears path', function () {
  var session = sessionMod.create(viewport(), config, 5);
  var star = session.field.stars[0];
  sessionMod.handlePointer(session, star.x, star.y);
  assert.strictEqual(session.path.starIds.length, 1);
  var empty = { x: session.ui.playRect.x + 8, y: session.ui.playRect.y + 8 };
  session.now = 1;
  var first = sessionMod.handlePointer(session, empty.x, empty.y);
  assert.strictEqual(first.kind, 'empty');
  session.now = 1.2;
  var second = sessionMod.handlePointer(session, empty.x + 2, empty.y + 2);
  assert.strictEqual(second.kind, 'double-clear');
  assert.deepStrictEqual(session.path.starIds, []);
});

check('HUD stub values and M0 stubs', function () {
  var session = sessionMod.create(viewport(), config, 2);
  assert.strictEqual(session.timer, 60);
  assert.strictEqual(session.score, 0);
  assert.strictEqual(score.getScore(null), 0);
  assert.strictEqual(ringDetect.detectClosedRing([], []).closed, false);
  assert.strictEqual(attract.applyAttract(), null);
  assert.strictEqual(storage.load().best, 0);
  assert.strictEqual(share.share(), false);
});

check('no abandoned-game directory references in xinggui source', function () {
  var root = path.join(__dirname, '..');
  function walk(dir, files) {
    fs.readdirSync(dir).forEach(function (name) {
      var p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p, files);
      else files.push(p);
    });
  }
  var files = [];
  walk(root, files);
  files.forEach(function (file) {
    if (file.indexOf(path.sep + 'test' + path.sep) !== -1) return;
    var text = fs.readFileSync(file, 'utf8');
    assert.ok(text.indexOf('minigame/') === -1, file + ' mentions minigame/');
    assert.ok(text.indexOf('晚一步') === -1, file + ' mentions abandoned title');
  });
});

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall checks passed');
