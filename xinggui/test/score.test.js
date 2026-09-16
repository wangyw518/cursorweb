'use strict';

const assert = require('assert');
const score = require('../js/score.js');
const cfg = require('../config.json');

exports.loopScoreGrowsWithSizeAndCombo = function () {
  const a = score.scoreLoop(4, 0, 0, cfg);
  const b = score.scoreLoop(6, 2, 0, cfg);
  const c = score.scoreLoop(6, 2, 4, cfg);
  assert.ok(b > a);
  assert.ok(c > b);
  assert.strictEqual(score.nextCombo(2), 3);
};

exports.poeticLinesExist = function () {
  assert.ok(score.poeticLine(0, 0, 0, 'time').length > 2);
  assert.ok(score.settleReasonLine('break').length > 0);
};
