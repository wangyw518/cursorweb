(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenGrid = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PATTERN = [
    'dust', 'empty', 'relic', 'empty', 'dust',
    'empty', 'crystal', 'empty', 'crystal', 'empty',
    'nebula', 'empty', 'dust', 'empty', 'nebula',
    'empty', 'dust', 'empty', 'crystal', 'empty',
    'crystal', 'empty', 'nebula', 'empty', 'dust',
    'empty', 'empty', 'empty', 'empty', 'empty'
  ];

  function kindMeta(id, config) {
    var kinds = (config && config.cellKinds) || {};
    var meta = kinds[id] || kinds.empty || { points: 0, name: '' };
    return { id: id, points: meta.points || 0, name: meta.name || '' };
  }

  function create(table, config) {
    var cols = (config && config.gridCols) || 5;
    var rows = (config && config.gridRows) || 6;
    var b = table.bounds;
    var padX = 12;
    var padTop = 10;
    var gridH = b.h * 0.70;
    var cellW = (b.w - padX * 2) / cols;
    var cellH = gridH / rows;
    var originX = b.x + padX;
    var originY = b.y + padTop;
    var cells = [];
    var i;
    for (i = 0; i < cols * rows; i++) {
      var c = i % cols;
      var r = Math.floor(i / cols);
      var kind = PATTERN[i] || 'empty';
      var meta = kindMeta(kind, config);
      cells.push({
        i: i,
        c: c,
        r: r,
        kind: kind,
        name: meta.name,
        points: meta.points,
        collected: false,
        frost: false,
        x: originX + c * cellW,
        y: originY + r * cellH,
        w: cellW,
        h: cellH
      });
    }
    return {
      cols: cols,
      rows: rows,
      cellW: cellW,
      cellH: cellH,
      originX: originX,
      originY: originY,
      cells: cells
    };
  }

  function cellAt(grid, x, y) {
    if (!grid) return null;
    var c = Math.floor((x - grid.originX) / grid.cellW);
    var r = Math.floor((y - grid.originY) / grid.cellH);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
    return grid.cells[r * grid.cols + c];
  }

  function neighbors(grid, cell) {
    var out = [];
    if (!cell) return out;
    var dc;
    var dr;
    for (dr = -1; dr <= 1; dr++) {
      for (dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        var nc = cell.c + dc;
        var nr = cell.r + dr;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
        out.push(grid.cells[nr * grid.cols + nc]);
      }
    }
    return out;
  }

  function takeCell(cell, mul) {
    if (!cell || cell.collected || !cell.points) return 0;
    var frost = cell.frost ? mul : 1;
    cell.collected = true;
    cell.frost = false;
    return Math.round(cell.points * frost);
  }

  /**
   * Harvest treasure cell under a point. Fire also takes 8-neighbors.
   * Ice doubles this cell (and marks frost if not collected this harvest).
   */
  function harvest(grid, x, y, opts) {
    opts = opts || {};
    var skill = opts.skill;
    var iceMul = (opts.config && opts.config.iceScoreMul) || 2;
    var cell = cellAt(grid, x, y);
    var gained = 0;
    var taken = [];
    var names = [];

    function collect(target, mul) {
      var pts = takeCell(target, mul);
      if (pts > 0) {
        gained += pts;
        taken.push(target);
        if (target.name) names.push(target.name);
      }
    }

    if (skill === 'ice' && cell && !cell.collected && cell.points) {
      cell.frost = true;
    }
    collect(cell, iceMul);
    if (skill === 'fire' && cell) {
      var near = neighbors(grid, cell);
      var i;
      for (i = 0; i < near.length; i++) collect(near[i], 1);
    }
    return { points: gained, cells: taken, names: names, cell: cell };
  }

  return {
    PATTERN: PATTERN,
    create: create,
    cellAt: cellAt,
    neighbors: neighbors,
    harvest: harvest,
    kindMeta: kindMeta
  };
});
