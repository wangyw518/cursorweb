'use strict';

const assert = require('assert');
const math = require('../js/math.js');

exports.distanceAndLerp = function () {
  assert.strictEqual(math.dist(0, 0, 3, 4), 5);
  assert.strictEqual(math.lerp(0, 10, 0.25), 2.5);
  assert.strictEqual(math.clamp(12, 0, 10), 10);
};

exports.closestPointMidSegment = function () {
  const p = math.closestPointOnSegment(5, 5, 0, 0, 10, 0);
  assert.ok(Math.abs(p.x - 5) < 1e-9);
  assert.ok(Math.abs(p.y) < 1e-9);
};

exports.pointInSquarePolygon = function () {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.strictEqual(math.pointInPolygon(5, 5, sq), true);
  assert.strictEqual(math.pointInPolygon(20, 5, sq), false);
  assert.ok(math.windingNumber(5, 5, sq) !== 0);
  assert.strictEqual(math.windingNumber(20, 5, sq), 0);
  assert.ok(math.polygonArea(sq) > 99 && math.polygonArea(sq) < 101);
};

exports.distToPolyline = function () {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.ok(math.distToPolyline(10, 5, line) < 0.001);
  assert.ok(math.distToPolyline(0, 5, line) > 4.9);
};

exports.seededRngStable = function () {
  const a = math.mulberry32(42);
  const b = math.mulberry32(42);
  assert.strictEqual(a(), b());
};
