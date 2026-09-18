(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLOR_KEYS = ['targetCyan', 'targetRose', 'targetAmber'];

  function overlapsObstacle(x, y, r, obstacles) {
    var i;
    for (i = 0; i < (obstacles || []).length; i++) {
      var o = obstacles[i];
      if (Math.hypot(x - o.x, y - o.y) < r + o.r + 6) return true;
    }
    return false;
  }

  function create(table, config, obstacles) {
    var bonuses = (config && config.targetBonuses) || [15, 25, 40];
    var names = (config && config.targetNames) || ['青辉', '绯晶', '琥珀'];
    var r = (config && config.targetRadius) || 8;
    var spots = [
      { fx: 0.72, fy: 0.22 },
      { fx: 0.16, fy: 0.40 },
      { fx: 0.84, fy: 0.48 }
    ];
    var out = [];
    var i;
    for (i = 0; i < bonuses.length && i < spots.length; i++) {
      var x = table.bounds.x + table.bounds.w * spots[i].fx;
      var y = table.bounds.y + table.bounds.h * spots[i].fy;
      if (overlapsObstacle(x, y, r, obstacles)) {
        x += 18;
        y += 12;
      }
      out.push({
        id: i,
        x: x,
        y: y,
        r: r,
        bonus: bonuses[i],
        name: names[i] || '辉球',
        colorKey: COLOR_KEYS[i] || 'targetCyan',
        collected: false
      });
    }
    return out;
  }

  function collect(targets, ball) {
    if (!ball || !targets) return [];
    var hits = [];
    var i;
    for (i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.collected) continue;
      if (Math.hypot(ball.x - t.x, ball.y - t.y) <= ball.r + t.r) {
        t.collected = true;
        hits.push(t);
      }
    }
    return hits;
  }

  function remaining(targets) {
    var n = 0;
    var i;
    for (i = 0; i < (targets || []).length; i++) {
      if (!targets[i].collected) n += 1;
    }
    return n;
  }

  return {
    COLOR_KEYS: COLOR_KEYS,
    create: create,
    collect: collect,
    remaining: remaining
  };
});
