(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenObstacles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function circle(table, fx, fy, r, id) {
    return {
      id: id,
      x: table.bounds.x + table.bounds.w * fx,
      y: table.bounds.y + table.bounds.h * fy,
      r: r,
      kind: 'asteroid',
      broken: false
    };
  }

  function create(table, config) {
    var scale = Math.max(0.82, Math.min(1.15, table.bounds.w / 327));
    return [
      circle(table, 0.50, 0.28, 16 * scale, 0),
      circle(table, 0.18, 0.58, 18 * scale, 1),
      circle(table, 0.82, 0.62, 17 * scale, 2),
      circle(table, 0.28, 0.20, 14 * scale, 3)
    ];
  }

  function alive(obstacles) {
    var out = [];
    var i;
    for (i = 0; i < (obstacles || []).length; i++) {
      if (!obstacles[i].broken) out.push(obstacles[i]);
    }
    return out;
  }

  function breakFirst(obstacles, hits) {
    if (!hits || !hits.length) return null;
    var target = hits[0];
    var i;
    for (i = 0; i < obstacles.length; i++) {
      if (obstacles[i] === target || (target.id != null && obstacles[i].id === target.id)) {
        if (obstacles[i].broken) return null;
        obstacles[i].broken = true;
        return obstacles[i];
      }
    }
    return null;
  }

  return {
    create: create,
    alive: alive,
    breakFirst: breakFirst
  };
});
