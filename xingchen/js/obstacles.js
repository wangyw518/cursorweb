(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenObstacles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function circle(table, fx, fy, r) {
    return {
      x: table.bounds.x + table.bounds.w * fx,
      y: table.bounds.y + table.bounds.h * fy,
      r: r,
      kind: 'asteroid'
    };
  }

  function create(table, config) {
    var scale = Math.max(0.82, Math.min(1.15, table.bounds.w / 327));
    return [
      circle(table, 0.50, 0.28, 13 * scale),
      circle(table, 0.18, 0.58, 15 * scale),
      circle(table, 0.82, 0.62, 14 * scale),
      circle(table, 0.28, 0.20, 11 * scale)
    ];
  }

  return {
    create: create
  };
});
