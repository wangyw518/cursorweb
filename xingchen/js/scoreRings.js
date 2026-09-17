(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenScoreRings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLOR_KEYS = ['ringGreen', 'ringBlue', 'ringPurple', 'ringGold'];

  function ring(table, fx, fy, innerR, outerR, tier) {
    return {
      x: table.bounds.x + table.bounds.w * fx,
      y: table.bounds.y + table.bounds.h * fy,
      innerR: innerR,
      outerR: outerR,
      tier: tier,
      colorKey: COLOR_KEYS[tier] || 'ringGreen'
    };
  }

  function create(table, config) {
    var scale = Math.max(0.82, Math.min(1.12, table.bounds.w / 327));
    return [
      ring(table, 0.50, 0.46, 20 * scale, 46 * scale, 0),
      ring(table, 0.24, 0.34, 16 * scale, 34 * scale, 1),
      ring(table, 0.78, 0.38, 14 * scale, 30 * scale, 2),
      ring(table, 0.50, 0.18, 12 * scale, 24 * scale, 3)
    ];
  }

  function distTo(ringItem, x, y) {
    return Math.hypot(x - ringItem.x, y - ringItem.y);
  }

  function inBand(ringItem, x, y) {
    var d = distTo(ringItem, x, y);
    return d >= ringItem.innerR && d <= ringItem.outerR;
  }

  function isEdge(ringItem, x, y, edgePx) {
    var d = distTo(ringItem, x, y);
    var px = edgePx == null ? 3 : edgePx;
    return Math.abs(d - ringItem.innerR) <= px || Math.abs(d - ringItem.outerR) <= px;
  }

  function ringSize(ringItem) {
    return ringItem.outerR;
  }

  /**
   * Annular bands only (not filled disks).
   * Overlap → highest tier; same tier → smaller ring.
   */
  function pick(rings, x, y, edgePx) {
    var hits = [];
    var i;
    for (i = 0; i < rings.length; i++) {
      if (inBand(rings[i], x, y)) hits.push(rings[i]);
    }
    if (!hits.length) {
      return { ring: null, edge: false, hits: 0 };
    }
    var best = hits[0];
    for (i = 1; i < hits.length; i++) {
      var r = hits[i];
      if (r.tier > best.tier) best = r;
      else if (r.tier === best.tier && ringSize(r) < ringSize(best)) best = r;
    }
    return {
      ring: best,
      edge: isEdge(best, x, y, edgePx),
      hits: hits.length
    };
  }

  return {
    create: create,
    ring: ring,
    inBand: inBand,
    isEdge: isEdge,
    pick: pick,
    distTo: distTo,
    COLOR_KEYS: COLOR_KEYS
  };
});
