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

check('score event flashes the landed grid cell for 1 frame then bursts', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config);
  var relic = session.grid.cells.filter(function (c) { return c.kind === 'relic'; })[0];
  sessionMod.debugPlace(session, relic.x + relic.w * 0.5, relic.y + relic.h * 0.5, 0, 0);
  var i;
  for (i = 0; i < 20; i++) {
    sessionMod.update(session, config.fixedDt);
    if (session.award) break;
  }
  assert.ok(session.award);
  assert.strictEqual(session.award.cellKind, 'relic');
  assert.strictEqual(session.flashFrames, 1);
  assert.ok(session.flashCell, 'flash targets the landed grid cell');
  assert.strictEqual(session.flashCell.kind, 'relic');
  assert.ok(session.pendingBurst, 'burst is queued behind the flash frame');
  assert.strictEqual(session.particles.length, 0);

  sessionMod.update(session, config.fixedDt);
  assert.strictEqual(session.flashFrames, 0);
  assert.strictEqual(session.flashCell, null);
  assert.ok(session.particles.length > 0, 'burst emits after the white frame');
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m2 ok');
