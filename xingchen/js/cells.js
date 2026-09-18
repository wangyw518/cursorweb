(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenCells = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ORDER = ['bronze', 'silver', 'gold', 'epic'];

  function rarityOf(row, col, rows, cols) {
    var cx = (cols - 1) * 0.5;
    var dist = Math.abs(col - cx) + row * 0.7;
    if (row === 0 && Math.abs(col - cx) < 0.6) return 'epic';
    if (row <= 1 && Math.abs(col - cx) <= 1.1) return 'gold';
    if (dist < 2.35) return 'silver';
    return 'bronze';
  }

  function create(board, config) {
    var cols = (config && config.gridCols) || 5;
    var rows = (config && config.gridRows) || 6;
    var b = board.bounds;
    var padX = 7;
    var padY = 6;
    var gridH = b.h * 0.70;
    var originY = b.y + 7;
    var cellW = (b.w - padX * 2) / cols;
    var cellH = (gridH - padY) / rows;
    var cells = [];
    var r;
    var c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var rarity = rarityOf(r, c, rows, cols);
        var x = b.x + padX + c * cellW;
        var y = originY + r * cellH;
        cells.push({
          col: c,
          row: r,
          rarity: rarity,
          x: x,
          y: y,
          w: cellW - 3,
          h: cellH - 3,
          cx: x + (cellW - 3) * 0.5,
          cy: y + (cellH - 3) * 0.5
        });
      }
    }
    return cells;
  }

  function contains(cell, x, y) {
    return x >= cell.x && y >= cell.y && x <= cell.x + cell.w && y <= cell.y + cell.h;
  }

  /**
   * Reward comes from the cell under the ball center.
   */
  function pick(cells, x, y) {
    var i;
    for (i = 0; i < cells.length; i++) {
      if (contains(cells[i], x, y)) {
        return { cell: cells[i], hits: 1 };
      }
    }
    return { cell: null, hits: 0 };
  }

  function specOf(rarity, config) {
    var map = (config && config.rarities) || {};
    return map[rarity] || map.bronze || { score: 20, crystals: 1, name: '铜印', colorKey: 'cellBronze' };
  }

  return {
    ORDER: ORDER,
    rarityOf: rarityOf,
    create: create,
    contains: contains,
    pick: pick,
    specOf: specOf
  };
});
