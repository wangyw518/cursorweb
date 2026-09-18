(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenCells = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_POINTS = [20, 50, 100, 180];
  var DEFAULT_KEYS = ['bronze', 'silver', 'gold', 'epic'];
  var DEFAULT_NAMES = ['铜印', '银辉', '金焰', '星谕'];

  /**
   * Deterministic 5×6 sigil map. Epic sits near the guarded top-center so
   * a clean shot can still reach it; bronze fills the rest.
   */
  var DEFAULT_PATTERN = [
    0, 1, 2, 1, 0,
    1, 0, 0, 0, 1,
    0, 0, 3, 0, 0,
    0, 2, 0, 2, 0,
    1, 0, 0, 0, 1,
    0, 0, 1, 0, 0
  ];

  function inRect(cell, x, y) {
    return x >= cell.x && y >= cell.y && x <= cell.x + cell.w && y <= cell.y + cell.h;
  }

  function gridRect(table, config) {
    var pad = 10;
    var dockTop = table.dock.y - ((table.dock.h || 38) * 0.58) - 6;
    var x = table.bounds.x + pad;
    var y = table.bounds.y + pad;
    var w = table.bounds.w - pad * 2;
    var h = Math.max(96, dockTop - y);
    return { x: x, y: y, w: w, h: h };
  }

  function create(table, config) {
    var cols = (config && config.gridCols) || 5;
    var rows = (config && config.gridRows) || 6;
    var points = (config && config.cellTiers) || DEFAULT_POINTS;
    var keys = (config && config.cellTierKeys) || DEFAULT_KEYS;
    var names = (config && config.cellTierNames) || DEFAULT_NAMES;
    var pattern = (config && config.cellPattern) || DEFAULT_PATTERN;
    var area = gridRect(table, config);
    var cw = area.w / cols;
    var ch = area.h / rows;
    var gap = 2.2;
    var cells = [];
    var i;
    for (i = 0; i < cols * rows; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var tier = pattern[i];
      if (tier == null) tier = 0;
      if (tier < 0) tier = 0;
      if (tier >= points.length) tier = points.length - 1;
      cells.push({
        id: i,
        col: col,
        row: row,
        x: area.x + col * cw + gap,
        y: area.y + row * ch + gap,
        w: cw - gap * 2,
        h: ch - gap * 2,
        tier: tier,
        points: points[tier],
        key: keys[tier] || 'bronze',
        name: names[tier] || '铜印',
        flashed: false
      });
    }
    return cells;
  }

  function pick(cells, x, y) {
    var i;
    for (i = 0; i < cells.length; i++) {
      if (inRect(cells[i], x, y)) {
        return { cell: cells[i], miss: false };
      }
    }
    return { cell: null, miss: true };
  }

  function findTier(cells, tier) {
    var i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].tier === tier) return cells[i];
    }
    return null;
  }

  return {
    DEFAULT_POINTS: DEFAULT_POINTS,
    DEFAULT_KEYS: DEFAULT_KEYS,
    DEFAULT_NAMES: DEFAULT_NAMES,
    DEFAULT_PATTERN: DEFAULT_PATTERN,
    gridRect: gridRect,
    create: create,
    pick: pick,
    inRect: inRect,
    findTier: findTier
  };
});
