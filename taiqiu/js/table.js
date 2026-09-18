/**
 * Portrait billiard table: felt, wood rails, chrome pockets, cushion segments.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function layout(viewport, config, playRect) {
    var rail = config.railThickness == null ? 20 : config.railThickness;
    var pocketR = config.pocketRadius == null ? 15.5 : config.pocketRadius;
    var wr = config.wallRadius == null ? 3.2 : config.wallRadius;

    var maxW = playRect.w;
    var maxH = playRect.h;
    var feltW = maxW - rail * 2;
    var feltH = feltW * 2;
    if (feltH + rail * 2 > maxH) {
      feltH = maxH - rail * 2;
      feltW = feltH * 0.5;
    }
    var outerW = feltW + rail * 2;
    var outerH = feltH + rail * 2;
    var ox = playRect.x + (playRect.w - outerW) * 0.5;
    var oy = playRect.y + (playRect.h - outerH) * 0.5;
    var felt = {
      x: ox + rail,
      y: oy + rail,
      w: feltW,
      h: feltH
    };
    felt.cx = felt.x + felt.w * 0.5;
    felt.cy = felt.y + felt.h * 0.5;

    var x1 = felt.x;
    var y1 = felt.y;
    var x2 = felt.x + felt.w;
    var y2 = felt.y + felt.h;
    var gap = pocketR * 0.92;

    var pockets = [
      { id: 'tl', kind: 'corner', x: x1, y: y1, r: pocketR },
      { id: 'tr', kind: 'corner', x: x2, y: y1, r: pocketR },
      { id: 'ml', kind: 'side', x: x1, y: felt.cy, r: pocketR * 0.92 },
      { id: 'mr', kind: 'side', x: x2, y: felt.cy, r: pocketR * 0.92 },
      { id: 'bl', kind: 'corner', x: x1, y: y2, r: pocketR },
      { id: 'br', kind: 'corner', x: x2, y: y2, r: pocketR }
    ];

    var walls = [
      { id: 'top', x1: x1 + gap, y1: y1, x2: x2 - gap, y2: y1, r: wr, nx: 0, ny: 1 },
      { id: 'bot', x1: x1 + gap, y1: y2, x2: x2 - gap, y2: y2, r: wr, nx: 0, ny: -1 },
      { id: 'lt', x1: x1, y1: y1 + gap, x2: x1, y2: felt.cy - gap, r: wr, nx: 1, ny: 0 },
      { id: 'lb', x1: x1, y1: felt.cy + gap, x2: x1, y2: y2 - gap, r: wr, nx: 1, ny: 0 },
      { id: 'rt', x1: x2, y1: y1 + gap, x2: x2, y2: felt.cy - gap, r: wr, nx: -1, ny: 0 },
      { id: 'rb', x1: x2, y1: felt.cy + gap, x2: x2, y2: y2 - gap, r: wr, nx: -1, ny: 0 }
    ];

    var sights = [];
    var s;
    for (s = 1; s <= 3; s++) {
      sights.push({ x: x1 + felt.w * (s / 4), y: y1 - rail * 0.45 });
      sights.push({ x: x1 + felt.w * (s / 4), y: y2 + rail * 0.45 });
    }
    sights.push({ x: x1 - rail * 0.45, y: y1 + felt.h * 0.25 });
    sights.push({ x: x1 - rail * 0.45, y: y1 + felt.h * 0.75 });
    sights.push({ x: x2 + rail * 0.45, y: y1 + felt.h * 0.25 });
    sights.push({ x: x2 + rail * 0.45, y: y1 + felt.h * 0.75 });

    return {
      outer: { x: ox, y: oy, w: outerW, h: outerH, r: 14 },
      felt: felt,
      walls: walls,
      pockets: pockets,
      sights: sights,
      rail: rail,
      kitchenY: y2 - felt.h * 0.22,
      rackY: y1 + felt.h * 0.28
    };
  }

  function contains(felt, x, y) {
    return x >= felt.x && x <= felt.x + felt.w && y >= felt.y && y <= felt.y + felt.h;
  }

  function project(x, y, table, viewMode) {
    if (viewMode !== '3d') return { x: x, y: y, s: 1 };
    var felt = table.felt;
    var t = (y - felt.y) / felt.h;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var scale = 0.58 + t * 0.42;
    return {
      x: felt.cx + (x - felt.cx) * scale,
      y: felt.y + felt.h * 0.04 + t * felt.h * 0.96,
      s: scale
    };
  }

  return {
    layout: layout,
    contains: contains,
    project: project
  };
});
