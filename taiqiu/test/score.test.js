'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var score = require('../js/score');
var tiles = require('../js/tiles');

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

check('miss awards 0 even on a three-star score tile', function () {
  var zone = tiles.makeTile('a', 'score', 3, 0, 0, 20);
  var award = score.settle({
    pocketedLowest: false,
    scratch: false,
    cushions: 3,
    zone: zone,
    firstContactIsTarget: true
  }, config);
  assert.strictEqual(award.points, 0);
  assert.strictEqual(award.reason, 'miss');
  assert.strictEqual(award.skinProgress, 0);
});

check('scratch awards 0 even after pocketing the object ball', function () {
  var award = score.settle({
    pocketedLowest: true,
    scratch: true,
    cushions: 2,
    zone: tiles.makeTile('b', 'score', 3, 0, 0, 20)
  }, config);
  assert.strictEqual(award.points, 0);
  assert.strictEqual(award.reason, 'scratch');
});

check('legal pocket scores from quality, not a lottery face value', function () {
  var low = tiles.makeTile('c', 'score', 1, 0, 0, 20);
  low.points = tiles.starPoints(1, config);
  var high = tiles.makeTile('d', 'score', 3, 0, 0, 20);
  high.points = tiles.starPoints(3, config);
  var weak = score.settle({
    pocketedLowest: true,
    scratch: false,
    cushions: 0,
    zone: low,
    firstContactIsTarget: false
  }, config);
  var strong = score.settle({
    pocketedLowest: true,
    scratch: false,
    cushions: 3,
    zone: high,
    firstContactIsTarget: true
  }, config);
  assert.ok(weak.points >= config.pocketPoints);
  assert.ok(strong.points > weak.points);
  assert.ok(strong.quality.multiplier > 1);
  assert.strictEqual(strong.quality.cushions, 3);
});

check('practice tile grants skin progress tied to cushions', function () {
  var zone = tiles.makeTile('e', 'practice', 0, 0, 0, 20);
  var noRail = score.settle({
    pocketedLowest: true, scratch: false, cushions: 0, zone: zone
  }, config);
  var withRail = score.settle({
    pocketedLowest: true, scratch: false, cushions: 2, zone: zone
  }, config);
  assert.ok(noRail.skinProgress >= config.practiceBase);
  assert.ok(withRail.skinProgress > noRail.skinProgress);
  assert.strictEqual(withRail.props[0].name, '练习卡');
});

check('target tile adds task bonus and names 目标格', function () {
  var zone = tiles.makeTile('f', 'target', 0, 0, 0, 20);
  var award = score.settle({
    pocketedLowest: true, scratch: false, cushions: 1, zone: zone
  }, config);
  assert.ok(award.points > config.pocketPoints);
  assert.strictEqual(award.props[0].name, '目标格');
});

check('disclaimer is the required virtual-prop copy', function () {
  var award = score.emptyAward('miss');
  assert.strictEqual(award.disclaimer, '虚拟道具，仅限游戏内使用，不可兑换现金');
  assert.strictEqual(score.DISCLAIMER, config.disclaimer);
});

check('gapToBest reports new record or remaining gap', function () {
  var neu = score.gapToBest(120, 80);
  assert.strictEqual(neu.isNew, true);
  assert.strictEqual(neu.best, 120);
  var behind = score.gapToBest(40, 90);
  assert.strictEqual(behind.isNew, false);
  assert.strictEqual(behind.gap, 50);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('score tests passed');
