'use strict';

const assert = require('assert');
const cfg = require('../config.json');
const math = require('../js/math.js');
const score = require('../js/score.js');

exports.frozenNumbers = function () {
  assert.strictEqual(cfg.sessionSeconds, 60);
  assert.strictEqual(cfg.minLoopStars, 4);
  assert.strictEqual(cfg.linkMaxRatio, 0.22);
  assert.ok(cfg.starCount >= 18 && cfg.starCount <= 28);
  assert.strictEqual(cfg.comboWindow, 8);
  assert.deepStrictEqual(cfg.comboMults, [1, 1.5, 2, 2.5]);
  assert.strictEqual(cfg.scorePerNode, 20);
  assert.strictEqual(cfg.scorePerInside, 15);
  assert.strictEqual(cfg.perfectInside, 6);
  assert.strictEqual(cfg.perfectBonus, 200);
  assert.strictEqual(cfg.glowInnerR, 6);
  assert.strictEqual(cfg.glowOuterR, 14);
  assert.strictEqual(cfg.trailPointsPerNode, 2);
  assert.strictEqual(cfg.trailAlpha0, 0.55);
  assert.strictEqual(cfg.hitStopFrames, 3);
  assert.strictEqual(cfg.burstParticleCap, 120);
  assert.strictEqual(cfg.burstLifeMs, 420);
  assert.strictEqual(cfg.bgTop, '#070B18');
  assert.strictEqual(cfg.bgBottom, '#12183A');
  assert.strictEqual(cfg.trailFrom, '#A78BFA');
  assert.strictEqual(cfg.trailTo, '#22D3EE');
  assert.strictEqual(cfg.comboColor, '#F472B6');
  assert.strictEqual(cfg.scorePop, '#FDE68A');
};

exports.scoreMatchesGddLine = function () {
  const raw = 5 * 20 + Math.floor(1 * 3 * 15);
  assert.strictEqual(score.scoreLoop(5, 3, 1, 0, false, cfg), raw);
  assert.strictEqual(score.scoreLoop(8, 6, 1, 0, true, cfg), 8 * 20 + 90 + 200);
};

exports.windingIsRingDetect = function () {
  const ring = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }];
  assert.ok(math.windingNumber(4, 4, ring) !== 0);
  assert.strictEqual(math.windingNumber(12, 4, ring), 0);
  assert.strictEqual(math.pointInPolygon(4, 4, ring), math.windingNumber(4, 4, ring) !== 0);
};

exports.linkMaxIsWidthFraction = function () {
  assert.strictEqual(Math.round(390 * cfg.linkMaxRatio), 86);
};
