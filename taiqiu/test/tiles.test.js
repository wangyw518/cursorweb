'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var tiles = require('../js/tiles');
var table = require('../js/table');
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

check('tiles use only 得分区 / 练习卡 / 目标格 labels', function () {
  var list = tiles.create(board(), config);
  assert.ok(list.length >= 8);
  var seen = { score: 0, practice: 0, target: 0 };
  list.forEach(function (t) {
    tiles.assertSafeTile(t);
    seen[t.kind] += 1;
    assert.ok(['得分区', '练习卡', '目标格'].indexOf(t.label) !== -1);
  });
  assert.ok(seen.score > 0 && seen.practice > 0 && seen.target > 0);
});

check('tiles never carry banknote-like fields', function () {
  var t = tiles.makeTile('z', 'score', 2, 10, 10, 16);
  tiles.assertSafeTile(t);
  tiles.FORBIDDEN_FIELDS.forEach(function (key) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(t, key), false);
  });
});

check('pickAt returns the diamond under the cue-ball center', function () {
  var list = tiles.create(board(), config);
  var sample = list[4];
  var hit = tiles.pickAt(list, sample.x, sample.y);
  assert.ok(hit);
  assert.strictEqual(hit.id, sample.id);
  var miss = tiles.pickAt(list, -100, -100);
  assert.strictEqual(miss, null);
});

check('score stars map to geometric point weights, not cash face values', function () {
  assert.deepStrictEqual(config.scoreStars, [28, 48, 72]);
  assert.strictEqual(tiles.starPoints(1, config), 28);
  assert.strictEqual(tiles.starPoints(3, config), 72);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('tiles tests passed');
