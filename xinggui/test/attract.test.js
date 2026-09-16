'use strict';

const assert = require('assert');
const attract = require('../js/attract.js');

exports.pullsTowardSegment = function () {
  const star = { x: 0, y: 20, vx: 0, vy: 0, selected: false };
  attract.applyAttraction(
    [star],
    [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    80,
    40,
    1
  );
  assert.ok(star.vy < 0, 'should drift toward the polyline');
};

exports.ignoresSelected = function () {
  const star = { x: 0, y: 20, vx: 0, vy: 0, selected: true };
  attract.applyAttraction([star], [{ x: 0, y: 0 }, { x: 40, y: 0 }], 80, 40, 1);
  assert.strictEqual(star.vy, 0);
};
