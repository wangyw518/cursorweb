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

check('spawnBurst returns a capped particle list', function () {
  var burst = fx.spawnBurst(100, 80, config, '#F5C542', { kind: 'center' });
  assert.ok(burst.length >= 8);
  assert.ok(burst.length <= (config.burstParticleCap || 64));
  assert.ok(burst[0].life > 0);
  assert.ok(burst[0].hex);
});

check('score event flashes the ring white for 1 frame then bursts', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config);
  var gold = session.rings.filter(function (r) { return r.tier === 3; })[0];
  var x = gold.x + (gold.innerR + gold.outerR) * 0.5;
  sessionMod.debugPlace(session, x, gold.y, 0, 0);
  var i;
  for (i = 0; i < 20; i++) {
    sessionMod.update(session, config.fixedDt);
    if (session.phase === 'scored' || session.phase === 'settle') break;
  }
  assert.ok(session.award);
  assert.strictEqual(session.flashFrames, 1);
  assert.ok(session.flashRing, 'flash targets the scored ring');
  assert.ok(session.pendingBurst, 'burst is queued behind the flash frame');
  assert.strictEqual(session.particles.length, 0);

  sessionMod.update(session, config.fixedDt);
  assert.strictEqual(session.flashFrames, 0);
  assert.strictEqual(session.flashRing, null);
  assert.ok(session.particles.length > 0, 'burst emits after the white frame');
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m2 ok');
