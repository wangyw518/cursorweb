/**
 * Felt zones: geometric score / practice / target tiles.
 * Not banknotes. Names: 得分区 / 练习卡 / 目标格.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuTiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KINDS = {
    score: { label: '得分区', unit: '格位分' },
    practice: { label: '练习卡', unit: '球杆皮肤进度' },
    target: { label: '目标格', unit: '任务加成' }
  };

  var FORBIDDEN_FIELDS = [
    'faceValue', 'denomination', 'yuan', 'rmb', 'bill', 'banknote'
  ];

  function starPoints(stars, config) {
    var table = (config && config.scoreStars) || [28, 48, 72];
    var idx = Math.max(1, Math.min(3, stars)) - 1;
    return table[idx];
  }

  function makeTile(id, kind, stars, cx, cy, size) {
    var meta = KINDS[kind];
    if (!meta) throw new Error('unknown tile kind ' + kind);
    return {
      id: id,
      kind: kind,
      label: meta.label,
      unit: meta.unit,
      stars: kind === 'score' ? stars : 0,
      points: kind === 'score' ? starPoints(stars) : 0,
      x: cx,
      y: cy,
      size: size
    };
  }

  function create(table, config) {
    var felt = table.felt;
    var size = Math.min(felt.w, felt.h) * 0.118;
    var tiles = [];
    var pattern = [
      { kind: 'practice', stars: 0, u: 0.22, v: 0.16 },
      { kind: 'score', stars: 3, u: 0.50, v: 0.14 },
      { kind: 'practice', stars: 0, u: 0.78, v: 0.16 },
      { kind: 'score', stars: 2, u: 0.18, v: 0.34 },
      { kind: 'target', stars: 0, u: 0.50, v: 0.32 },
      { kind: 'score', stars: 1, u: 0.82, v: 0.34 },
      { kind: 'score', stars: 1, u: 0.28, v: 0.50 },
      { kind: 'score', stars: 3, u: 0.72, v: 0.50 },
      { kind: 'target', stars: 0, u: 0.20, v: 0.66 },
      { kind: 'practice', stars: 0, u: 0.50, v: 0.64 },
      { kind: 'score', stars: 2, u: 0.80, v: 0.66 },
      { kind: 'score', stars: 1, u: 0.34, v: 0.82 },
      { kind: 'target', stars: 0, u: 0.66, v: 0.82 }
    ];
    var i;
    for (i = 0; i < pattern.length; i++) {
      var p = pattern[i];
      var tile = makeTile(
        't' + i,
        p.kind,
        p.stars,
        felt.x + felt.w * p.u,
        felt.y + felt.h * p.v,
        size
      );
      if (config) {
        if (tile.kind === 'score') tile.points = starPoints(tile.stars, config);
      }
      tiles.push(tile);
    }
    return tiles;
  }

  function contains(tile, x, y) {
    var dx = Math.abs(x - tile.x);
    var dy = Math.abs(y - tile.y);
    return dx + dy <= tile.size * 0.72;
  }

  function pickAt(tiles, x, y) {
    var i;
    var best = null;
    var bestD = Infinity;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (!contains(t, x, y)) continue;
      var d = Math.hypot(x - t.x, y - t.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function assertSafeTile(tile) {
    var i;
    for (i = 0; i < FORBIDDEN_FIELDS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(tile, FORBIDDEN_FIELDS[i])) {
        throw new Error('tile must not carry ' + FORBIDDEN_FIELDS[i]);
      }
    }
    if (KINDS[tile.kind] && tile.label !== KINDS[tile.kind].label) {
      throw new Error('tile label mismatch');
    }
    return true;
  }

  return {
    KINDS: KINDS,
    FORBIDDEN_FIELDS: FORBIDDEN_FIELDS,
    starPoints: starPoints,
    makeTile: makeTile,
    create: create,
    contains: contains,
    pickAt: pickAt,
    assertSafeTile: assertSafeTile
  };
});
