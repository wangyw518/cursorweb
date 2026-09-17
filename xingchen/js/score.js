(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_TIERS = [10, 30, 80, 200];

  function tierPoints(tier, config) {
    var tiers = (config && config.tiers) || DEFAULT_TIERS;
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

  function outOfBounds() {
    return {
      points: 0,
      edge: false,
      multiplier: 1,
      score: 0,
      tier: -1,
      oob: true,
      miss: false
    };
  }

  return {
    tierPoints: tierPoints,
    fromPick: fromPick,
    outOfBounds: outOfBounds,
    DEFAULT_TIERS: DEFAULT_TIERS
  };
});
