'use strict';

const assert = require('assert');
const score = require('../js/score.js');
const cfg = require('../config.json');

exports.gddFormulaNodesAndInside = function () {
  const a = score.scoreLoop(4, 0, 1, 0, false, cfg);
  const b = score.scoreLoop(4, 3, 1, 0, false, cfg);
  assert.strictEqual(a, 80);
  assert.strictEqual(b, 80 + 45);
};

exports.comboTiersAndPerfect = function () {
  assert.strictEqual(score.comboMult(0, cfg), 1);
  assert.strictEqual(score.comboMult(1, cfg), 1.5);
  assert.strictEqual(score.comboMult(3, cfg), 2.5);
  const plain = score.scoreLoop(8, 6, 1, 0, false, cfg);
  const perf = score.scoreLoop(8, 6, 1, 0, true, cfg);
  assert.strictEqual(perf, plain + 200);
  assert.ok(score.isPerfect(6, false, cfg));
  assert.strictEqual(score.isPerfect(6, true, cfg), false);
  assert.strictEqual(score.nextCombo(2), 3);
};

exports.poeticLinesExist = function () {
  assert.ok(score.poeticLine(0, 0, 0, 'time').length > 2);
  assert.ok(score.settleReasonLine('break').length > 0);
};
