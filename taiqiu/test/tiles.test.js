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

check('StarZones are 新星 / 流星 / 彗星 / 恒星 only', function () {
  var list = tiles.create(board(), config);
  assert.ok(list.length >= 8);
  var seen = {};
  list.forEach(function (t) {
    tiles.assertSafeTile(t);
    seen[t.label] = true;
    assert.ok(['新星', '流星', '彗星', '恒星'].indexOf(t.label) !== -1);
  });
  assert.ok(seen['新星'] && seen['流星'] && seen['彗星'] && seen['恒星']);
});

check('StarZones never carry banknote-like fields or denominations', function () {
  var t = tiles.makeTile('z', 'stellar', 0, 10, 10, 16);
  tiles.assertSafeTile(t);
  tiles.FORBIDDEN_FIELDS.forEach(function (key) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(t, key), false);
  });
  assert.strictEqual(t.multiplier, 3);
});

check('pickAt returns the abstract zone under the cue-ball center', function () {
  var list = tiles.create(board(), config);
  var sample = list[4];
  var hit = tiles.pickAt(list, sample.x, sample.y);
  assert.ok(hit);
  assert.strictEqual(hit.id, sample.id);
  assert.strictEqual(tiles.pickAt(list, -100, -100), null);
});

check('config star multipliers are 1 / 1.5 / 2 / 3', function () {
  var byId = {};
  config.starZones.forEach(function (z) { byId[z.id] = z.multiplier; });
  assert.strictEqual(byId.nova, 1);
  assert.strictEqual(byId.meteor, 1.5);
  assert.strictEqual(byId.comet, 2);
  assert.strictEqual(byId.stellar, 3);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('tiles tests passed');
