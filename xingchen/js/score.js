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
      ringScore: 0,
      gridScore: 0,
      tier: -1,
      oob: true,
      miss: false
    };
  }

  /**
   * Primary score is the grid cell under the ball center.
   * Ring-band points are optional additive only when config.ringBonus is true.
   */
  function combine(ringAward, gridAward, skill, config) {
    var ring = ringAward || fromPick(null, config);
    var gridPts = (gridAward && gridAward.points) || 0;
    var cell = (gridAward && gridAward.cell) || null;
    var allowRing = !!(config && config.ringBonus) && !ring.oob;
    var ringScore = allowRing ? (ring.score || 0) : 0;
    var total = gridPts + ringScore;
    return {
      points: gridPts,
      edge: allowRing && !!ring.edge,
      multiplier: allowRing ? (ring.multiplier || 1) : 1,
      ringScore: ringScore,
      gridScore: gridPts,
      score: total,
      tier: cell ? cellRankOf(cell) : -1,
      oob: !!ring.oob,
      miss: total === 0 && !ring.oob,
      ring: allowRing ? ring.ring : null,
      cell: cell,
      cellName: cell && cell.name ? cell.name : '',
      cellKind: cell && cell.kind ? cell.kind : '',
      harvested: (gridAward && gridAward.cells) || [],
      names: (gridAward && gridAward.names) || [],
      skill: skill || null
    };
  }

  function cellRankOf(cell) {
    if (!cell) return -1;
    return cell.points || 0;
  }

  return {
    tierPoints: tierPoints,
    fromPick: fromPick,
    outOfBounds: outOfBounds,
    combine: combine,
    DEFAULT_TIERS: DEFAULT_TIERS
  };
});
