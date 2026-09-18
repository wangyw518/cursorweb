(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function orb(table, fx, fy, r, hex, bonus, name) {
    return {
      x: table.bounds.x + table.bounds.w * fx,
      y: table.bounds.y + table.bounds.h * fy,
      r: r,
      hex: hex,
      bonus: bonus,
      name: name,
      collected: false
    };
  }

  function create(table, config) {
    var scale = Math.max(0.82, Math.min(1.12, table.bounds.w / 327));
    var r = 8 * scale;
    return [
      orb(table, 0.38, 0.44, r, '#FB7185', 40, '玫辉'),
      orb(table, 0.72, 0.36, r, '#34D399', 35, '翠辉'),
      orb(table, 0.58, 0.56, r, '#FBBF24', 55, '曦辉')
    ];
  }

  function collect(target) {
    if (!target || target.collected) return 0;
    target.collected = true;
    return target.bonus || 0;
  }

  return {
    create: create,
    collect: collect
  };
});
