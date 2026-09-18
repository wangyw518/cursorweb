'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var score = require('../js/score');
var tiles = require('../js/tiles');
var fsm = require('../js/fsm');

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

check('miss awards 0 and does not apply a stellar multiplier', function () {
  var zone = tiles.makeTile('a', 'stellar', 0, 0, 0, 20);
  var award = score.settle({
    pocketedLowest: false,
    scratch: false,
    zone: zone,
    applyStar: true,
    resolution: fsm.classify({ pocketedLowest: false, scratch: false, firstContactId: 'b1', targetId: 'b1' })
  }, config);
  assert.strictEqual(award.coins, 0);
  assert.strictEqual(award.starApplied, false);
  assert.strictEqual(award.reason, 'miss');
});

check('scratch / foul skips full star multiplier', function () {
  var zone = tiles.makeTile('b', 'stellar', 0, 0, 0, 20);
  var award = score.settle({
    pocketedLowest: true,
    scratch: true,
    foul: true,
    zone: zone,
    applyStar: true,
    resolution: fsm.classify({ pocketedLowest: true, scratch: true, firstContactId: 'b1', targetId: 'b1' })
  }, config);
  assert.strictEqual(award.coins, 0);
  assert.strictEqual(award.starApplied, false);
  assert.strictEqual(award.foul, true);
});

check('wrong 9-ball order is a foul and skips StarZone payout', function () {
  var resolution = fsm.classify({
    pocketedLowest: true,
    scratch: false,
    firstContactId: 'b9',
    targetId: 'b1'
  });
  assert.strictEqual(resolution.foul, true);
  assert.strictEqual(resolution.enterStarZone, false);
  var award = score.settle({
    pocketedLowest: true,
    zone: tiles.makeTile('c', 'stellar', 0, 0, 0, 20),
    applyStar: true,
    resolution: resolution
  }, config);
  assert.strictEqual(award.coins, 0);
  assert.strictEqual(award.starApplied, false);
});

check('legal pocket reads StarZone multiplier 1 / 1.5 / 2 / 3 as 星币', function () {
  var nova = score.settle({
    pocketedLowest: true,
    applyStar: true,
    zone: tiles.makeTile('n', 'nova', 0, 0, 0, 20),
    resolution: { legal: true, foul: false, reason: 'legal', enterStarZone: true }
  }, config);
  var stellar = score.settle({
    pocketedLowest: true,
    applyStar: true,
    zone: tiles.makeTile('s', 'stellar', 0, 0, 0, 20),
    resolution: { legal: true, foul: false, reason: 'legal', enterStarZone: true }
  }, config);
  assert.strictEqual(nova.coins, config.baseXingbi);
  assert.strictEqual(stellar.coins, config.baseXingbi * 3);
  assert.strictEqual(nova.starMultiplier, 1);
  assert.strictEqual(stellar.starMultiplier, 3);
  assert.strictEqual(stellar.unit, '星币');
  assert.strictEqual(stellar.zoneLabel, '恒星');
});

check('disclaimer is the required virtual-prop copy', function () {
  var award = score.emptyAward('miss');
  assert.strictEqual(award.disclaimer, '虚拟道具，仅限游戏内使用，不可兑换现金');
  assert.strictEqual(score.DISCLAIMER, config.disclaimer);
});

check('gapToBest reports new record or remaining gap', function () {
  var neu = score.gapToBest(120, 80);
  assert.strictEqual(neu.isNew, true);
  var behind = score.gapToBest(40, 90);
  assert.strictEqual(behind.gap, 50);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('score tests passed');
