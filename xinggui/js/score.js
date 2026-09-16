(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_MULT = [1, 1.5, 2, 2.5];

  function comboMultipliers(config) {
    return (config && config.comboMultipliers) || DEFAULT_MULT;
  }

  function comboMultiplier(comboCount, config) {
    var table = comboMultipliers(config);
    var i = comboCount;
    if (i < 0) i = 0;
    if (i >= table.length) i = table.length - 1;
    return table[i];
  }

  function advanceCombo(combo, nowMs, windowMs) {
    var next = {
      count: 0,
      lastCloseAt: nowMs,
      multiplier: 1
    };
    if (combo && combo.lastCloseAt >= 0 && nowMs - combo.lastCloseAt <= windowMs) {
      next.count = Math.min((combo.count || 0) + 1, 3);
    }
    next.multiplier = comboMultiplier(next.count);
    return next;
  }

  function scoreRing(ring, options) {
    options = options || {};
    var config = options.config || {};
    if (!ring || !ring.closed) {
      return { base: 0, combo: 0, multiplier: 1, perfect: false, bonus: 0, score: 0 };
    }
    var nodePts = config.nodeScore == null ? 20 : config.nodeScore;
    var inPts = config.inRingScore == null ? 15 : config.inRingScore;
    var perfectMin = config.perfectInRingMin == null ? 6 : config.perfectInRingMin;
    var perfectBonus = config.perfectBonus == null ? 200 : config.perfectBonus;
    var nodes = ring.nodes || 0;
    var inRingCount = ring.inRingCount || 0;
    var areaFactor = ring.areaFactor || 0;
    var base = nodes * nodePts + Math.floor(areaFactor * inRingCount * inPts);
    var comboCount = options.comboCount || 0;
    var mult = comboMultiplier(comboCount, config);
    var perfect = inRingCount >= perfectMin && !options.hadUndo;
    var bonus = perfect ? perfectBonus : 0;
    return {
      base: base,
      combo: comboCount,
      multiplier: mult,
      perfect: perfect,
      bonus: bonus,
      score: Math.floor(base * mult) + bonus
    };
  }

  function getScore(total) {
    return total || 0;
  }

  return {
    scoreRing: scoreRing,
    getScore: getScore,
    comboMultiplier: comboMultiplier,
    advanceCombo: advanceCombo
  };
});
