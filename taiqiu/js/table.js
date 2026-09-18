/**
 * Portrait billiard table: felt, wood rails, chrome pockets, cushion segments.
 * Pockets are oversized (pocketR ≥ 1.85× ballR; corners prefer 2.0–2.2×) with
 * a wide mouth. Centers sit on/outside the cushion nose (outset) — never
 * pulled inward onto the cloth to fake a hole.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_POCKET_RATIO = 1.85;
  var CORNER_POCKET_RATIO = 2.1;

  function resolveRadii(config) {
    var ballR = config && config.ballRadius != null ? config.ballRadius : 8.2;
    var raw = config && config.pocketRadius != null ? config.pocketRadius : ballR * CORNER_POCKET_RATIO;
    var pocketR = raw < ballR * MIN_POCKET_RATIO ? ballR * CORNER_POCKET_RATIO : raw;
    var cornerR = Math.max(pocketR, ballR * 2.0);
    var sideR = Math.max(pocketR, ballR * MIN_POCKET_RATIO);
    return {
      ballR: ballR,
      pocketR: pocketR,
      cornerR: cornerR,
      sideR: sideR,
      ratio: pocketR / ballR,
      cornerRatio: cornerR / ballR,
      sideRatio: sideR / ballR
    };
  }

  /**
   * Small outset so the hole lives in the rail, but a ball at the cushion
   * nose still reaches the pocket (center on/outside the nose line).
   */
  function clampOutset(pocketR, ballR, kind, wallR) {
    var wr = wallR || 0;
    var maxOut;
    if (kind === 'corner') {
      // (ballR + out)² + (ballR + wr + out)² <= (pocketR * 0.96)²
      // Conservative closed form: keep the nose-touch ball inside the hole.
      maxOut = pocketR / Math.SQRT2 - ballR - wr * 0.35;
    } else {
      maxOut = pocketR - ballR - wr * 0.25;
    }
    if (!(maxOut > 0)) maxOut = 0;
    var preferred = kind === 'corner' ? ballR * 0.18 : ballR * 0.14;
    return Math.min(preferred, maxOut);
  }

  function layout(viewport, config, playRect) {
    var rail = config.railThickness == null ? 24 : config.railThickness;
    var wr = config.wallRadius == null ? 3.2 : config.wallRadius;
    var radii = resolveRadii(config);
    var ballR = radii.ballR;
    var pocketR = radii.pocketR;
    var cornerR = radii.cornerR;
    var sideR = radii.sideR;

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
    // Centers on/outside the cushion nose — never inset onto the cloth.
    var cornerOut = clampOutset(cornerR, ballR, 'corner', wr);
    var sideOut = clampOutset(sideR, ballR, 'side', wr);
    // Wide mouth: jaws open more than a ball diameter so the ball can pass.
    var gap = Math.max(cornerR * 1.08, ballR * 2.5, 2 * ballR + wr * 2 + 4);

    var pockets = [
      { id: 'tl', kind: 'corner', x: x1 - cornerOut, y: y1 - cornerOut, r: cornerR },
      { id: 'tr', kind: 'corner', x: x2 + cornerOut, y: y1 - cornerOut, r: cornerR },
      { id: 'ml', kind: 'side', x: x1 - sideOut, y: felt.cy, r: sideR },
      { id: 'mr', kind: 'side', x: x2 + sideOut, y: felt.cy, r: sideR },
      { id: 'bl', kind: 'corner', x: x1 - cornerOut, y: y2 + cornerOut, r: cornerR },
      { id: 'br', kind: 'corner', x: x2 + cornerOut, y: y2 + cornerOut, r: cornerR }
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
      mouthGap: gap,
      pocketRadius: pocketR,
      cornerPocketR: cornerR,
      sidePocketR: sideR,
      cornerOut: cornerOut,
      sideOut: sideOut,
      ballR: ballR,
      pocketBallRatio: cornerR / ballR,
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

  function clothOpening(pocket, felt) {
    if (pocket.kind === 'side') {
      var edgeX = pocket.x < felt.cx ? felt.x : felt.x + felt.w;
      return pocket.r - Math.abs(pocket.x - edgeX);
    }
    var nx = pocket.x < felt.cx ? felt.x : felt.x + felt.w;
    var ny = pocket.y < felt.cy ? felt.y : felt.y + felt.h;
    return pocket.r - Math.hypot(pocket.x - nx, pocket.y - ny);
  }

  return {
    MIN_POCKET_RATIO: MIN_POCKET_RATIO,
    CORNER_POCKET_RATIO: CORNER_POCKET_RATIO,
    resolveRadii: resolveRadii,
    clampOutset: clampOutset,
    clothOpening: clothOpening,
    layout: layout,
    contains: contains,
    project: project
  };
});
