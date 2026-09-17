(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function layout(viewport, config, playRect) {
    var gap = 8;
    var bounds = {
      x: playRect.x + gap,
      y: playRect.y + gap,
      w: playRect.w - gap * 2,
      h: playRect.h - gap * 2
    };
    var voidGap = config.voidGapPx == null ? 30 : config.voidGapPx;
    var wr = config.wallRadius == null ? 5 : config.wallRadius;
    var x1 = bounds.x;
    var y1 = bounds.y;
    var x2 = bounds.x + bounds.w;
    var y2 = bounds.y + bounds.h;
    var walls = [
      { x1: x1 + voidGap, y1: y1, x2: x2 - voidGap, y2: y1, r: wr },
      { x1: x1 + voidGap, y1: y2, x2: x2 - voidGap, y2: y2, r: wr },
      { x1: x1, y1: y1 + voidGap, x2: x1, y2: y2 - voidGap, r: wr },
      { x1: x2, y1: y1 + voidGap, x2: x2, y2: y2 - voidGap, r: wr }
    ];
    var voids = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 }
    ];
    var dock = {
      x: bounds.x + bounds.w * 0.5,
      y: bounds.y + bounds.h * 0.905,
      w: config.launcherW || 78,
      h: config.launcherH || 30
    };
    return {
      bounds: bounds,
      walls: walls,
      voids: voids,
      dock: dock,
      voidGap: voidGap
    };
  }

  function contains(bounds, x, y) {
    return x >= bounds.x && x <= bounds.x + bounds.w &&
      y >= bounds.y && y <= bounds.y + bounds.h;
  }

  /**
   * Out of table = ball center past the table rectangle.
   * Beats stop-detect when checked first.
   */
  function isOutOfBounds(bounds, x, y) {
    return !contains(bounds, x, y);
  }

  return {
    layout: layout,
    contains: contains,
    isOutOfBounds: isOutOfBounds
  };
});
