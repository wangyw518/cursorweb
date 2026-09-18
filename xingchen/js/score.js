(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_TIERS = [10, 30, 80, 200];
  var DEFAULT_CELL_TIERS = [20, 50, 100, 180];

  function tierPoints(tier, config) {
    var tiers = (config && config.tiers) || DEFAULT_TIERS;
    if (tier == null || tier < 0 || tier >= tiers.length) return 0;
    return tiers[tier];
  }

  function cellPoints(tier, config) {
    var tiers = (config && config.cellTiers) || DEFAULT_CELL_TIERS;
    if (tier == null || tier < 0 || tier >= tiers.length) return 0;
    return tiers[tier];
  }

  function fromPick(pick, config) {
    if (!pick || !pick.ring) {
      return {
        points: 0,
        edge: false,
        multiplier: 1,
        score: 0,
        tier: -1,
        oob: false,
        miss: true
      };
    }
    var points = tierPoints(pick.ring.tier, config);
    var edge = !!pick.edge;
    var mult = edge ? ((config && config.edgeMultiplier) || 1.2) : 1;
    return {
      points: points,
      edge: edge,
      multiplier: mult,
      score: Math.round(points * mult),
      tier: pick.ring.tier,
      oob: false,
      miss: false,
      ring: pick.ring
    };
  }

  function fromCell(pick, config, bonus) {
    var extra = bonus || 0;
    if (!pick || !pick.cell) {
      return {
        points: 0,
        cellScore: 0,
        bonus: extra,
        edge: false,
        multiplier: 1,
        score: extra,
        tier: -1,
        oob: false,
        miss: true,
        cell: null
      };
    }
    var points = pick.cell.points != null
      ? pick.cell.points
      : cellPoints(pick.cell.tier, config);
    return {
      points: points,
      cellScore: points,
      bonus: extra,
      edge: false,
      multiplier: 1,
      score: points + extra,
      tier: pick.cell.tier,
      oob: false,
      miss: false,
      cell: pick.cell
    };
  }

  function outOfBounds(bonus) {
    var extra = bonus || 0;
    return {
      points: 0,
      cellScore: 0,
      bonus: extra,
      edge: false,
      multiplier: 1,
      score: extra,
      tier: -1,
      oob: true,
      miss: false,
      cell: null
    };
  }

  function mergeBallAwards(awards, bonus) {
    var extra = bonus || 0;
    if (!awards || !awards.length) {
      return {
        points: 0,
        cellScore: 0,
        bonus: extra,
        score: extra,
        tier: -1,
        oob: false,
        miss: true,
        cell: null,
        balls: 0
      };
    }
    var cellScore = 0;
    var bestTier = -1;
    var bestCell = null;
    var oobAll = true;
    var missAll = true;
    var i;
    for (i = 0; i < awards.length; i++) {
      var a = awards[i];
      cellScore += a.cellScore || a.points || 0;
      if (!a.oob) oobAll = false;
      if (!a.miss) missAll = false;
      if (a.tier > bestTier) {
        bestTier = a.tier;
        bestCell = a.cell || null;
      }
    }
    return {
      points: cellScore,
      cellScore: cellScore,
      bonus: extra,
      score: cellScore + extra,
      tier: bestTier,
      oob: oobAll,
      miss: missAll && extra === 0,
      cell: bestCell,
      balls: awards.length
    };
  }

  return {
    tierPoints: tierPoints,
    cellPoints: cellPoints,
    fromPick: fromPick,
    fromCell: fromCell,
    outOfBounds: outOfBounds,
    mergeBallAwards: mergeBallAwards,
    DEFAULT_TIERS: DEFAULT_TIERS,
    DEFAULT_CELL_TIERS: DEFAULT_CELL_TIERS
  };
});
