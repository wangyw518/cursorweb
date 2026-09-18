/**
 * StarZones: 新星 / 流星 / 彗星 / 恒星.
 * Abstract felt patterns only — not bills or denominations.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuTiles = root.TaiqiuStarZones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KINDS = {
    nova: { id: 'nova', name: '新星', label: '新星', multiplier: 1, pattern: 'spark' },
    meteor: { id: 'meteor', name: '流星', label: '流星', multiplier: 1.5, pattern: 'streak' },
    comet: { id: 'comet', name: '彗星', label: '彗星', multiplier: 2, pattern: 'arc' },
    stellar: { id: 'stellar', name: '恒星', label: '恒星', multiplier: 3, pattern: 'burst' }
  };

  var ORDER = ['nova', 'meteor', 'comet', 'stellar'];

  var FORBIDDEN_FIELDS = [
    'faceValue', 'denomination', 'yuan', 'rmb', 'bill', 'banknote'
  ];

  function kindOf(id) {
    return KINDS[id] || KINDS.nova;
  }

  function makeTile(id, kind, _unused, cx, cy, size) {
    var meta = kindOf(kind);
    return {
      id: id,
      kind: meta.id,
      name: meta.name,
      label: meta.label,
      pattern: meta.pattern,
      multiplier: meta.multiplier,
      x: cx,
      y: cy,
      size: size
    };
  }

  function create(table, config) {
    var felt = table.felt;
    var size = Math.min(felt.w, felt.h) * 0.16;
    var catalog = (config && config.starZones) || ORDER.map(function (id) {
      return { id: id, multiplier: KINDS[id].multiplier };
    });
    var byId = {};
    catalog.forEach(function (z) { byId[z.id] = z; });

    var pattern = [
      { kind: 'stellar', u: 0.50, v: 0.16 },
      { kind: 'nova', u: 0.22, v: 0.18 },
      { kind: 'meteor', u: 0.78, v: 0.18 },
      { kind: 'comet', u: 0.50, v: 0.34 },
      { kind: 'meteor', u: 0.20, v: 0.42 },
      { kind: 'nova', u: 0.80, v: 0.42 },
      { kind: 'stellar', u: 0.36, v: 0.54 },
      { kind: 'comet', u: 0.68, v: 0.54 },
      { kind: 'nova', u: 0.22, v: 0.70 },
      { kind: 'meteor', u: 0.50, v: 0.68 },
      { kind: 'comet', u: 0.78, v: 0.70 },
      { kind: 'stellar', u: 0.50, v: 0.84 }
    ];
    var tiles = [];
    var i;
    for (i = 0; i < pattern.length; i++) {
      var p = pattern[i];
      var tile = makeTile(
        'z' + i,
        p.kind,
        0,
        felt.x + felt.w * p.u,
        felt.y + felt.h * p.v,
        size
      );
      if (byId[tile.kind] && byId[tile.kind].multiplier != null) {
        tile.multiplier = byId[tile.kind].multiplier;
      }
      tiles.push(tile);
    }
    return tiles;
  }

  function contains(tile, x, y) {
    var dx = Math.abs(x - tile.x);
    var dy = Math.abs(y - tile.y);
    return dx + dy <= tile.size * 0.78;
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

  function defaultZone() {
    return makeTile('default-nova', 'nova', 0, 0, 0, 20);
  }

  function assertSafeTile(tile) {
    var i;
    for (i = 0; i < FORBIDDEN_FIELDS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(tile, FORBIDDEN_FIELDS[i])) {
        throw new Error('tile must not carry ' + FORBIDDEN_FIELDS[i]);
      }
    }
    if (!KINDS[tile.kind]) throw new Error('unknown star zone ' + tile.kind);
    if (tile.label !== KINDS[tile.kind].label) throw new Error('tile label mismatch');
    return true;
  }

  return {
    KINDS: KINDS,
    ORDER: ORDER,
    FORBIDDEN_FIELDS: FORBIDDEN_FIELDS,
    kindOf: kindOf,
    makeTile: makeTile,
    create: create,
    contains: contains,
    pickAt: pickAt,
    defaultZone: defaultZone,
    assertSafeTile: assertSafeTile
  };
});
