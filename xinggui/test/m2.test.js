'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var fx = require('../js/fx');
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

check('burst respects cap and life', function () {
  var parts = fx.spawnBurst(10, 20, config, config.colors.scorePop);
  assert.ok(parts.length > 0);
  assert.ok(parts.length <= config.burstParticleCap);
  assert.ok(Math.abs(parts[0].maxLife - config.burstLifeMs / 1000) < 1e-6);
  var empty = fx.spawnBurst();
  assert.deepStrictEqual(empty, []);
});

check('frozen juice colors', function () {
  assert.strictEqual(config.colors.path, '#A78BFA');
  assert.strictEqual(config.colors.pathHead, '#22D3EE');
  assert.strictEqual(config.colors.combo, '#F472B6');
  assert.strictEqual(config.colors.scorePop, '#FDE68A');
  assert.strictEqual(config.hitStopFrames, 3);
  assert.strictEqual(config.glowInnerR, 6);
  assert.strictEqual(config.glowOuterR, 14);
});

check('session close keeps burst particles, flash, and score pop', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config, 1);
  session.field.stars = [
    star(0, 120, 220),
    star(1, 190, 220),
    star(2, 190, 290),
    star(3, 120, 290),
    star(4, 155, 255)
  ];
  sessionMod.handlePointer(session, 120, 220);
  sessionMod.handlePointer(session, 190, 220);
  sessionMod.handlePointer(session, 190, 290);
  sessionMod.handlePointer(session, 120, 290);
  var closed = sessionMod.handlePointer(session, 120, 220);
  assert.strictEqual(closed.kind, 'close');
  assert.ok(session.score > 0);
  assert.ok(session.particles.length > 0);
  assert.ok(session.particles.length <= config.burstParticleCap);
  assert.ok(session.flash > 0);
  assert.ok(session.pulse > 0);
  assert.ok(session.popups.length > 0);
  assert.ok(session.hitStop > 0);
});

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall m2 checks passed');
