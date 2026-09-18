/**
 * Simplified 9-ball rack + cue ball. Lowest numbered remaining is the object ball.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuBalls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLORS = {
    1: '#F5D76E',
    2: '#3B82F6',
    3: '#DC2626',
    4: '#7C3AED',
    5: '#F97316',
    6: '#16A34A',
    7: '#7F1D1D',
    8: '#111827',
    9: '#CA8A04'
  };

  function rackPositions(table, r) {
    var gap = r * 2.08;
    var apexX = table.felt.cx;
    var apexY = table.rackY;
    // 9-ball diamond; 1 at apex toward the cue (down the portrait table).
    return [
      { n: 1, x: apexX, y: apexY },
      { n: 2, x: apexX - gap * 0.5, y: apexY - gap * 0.87 },
      { n: 3, x: apexX + gap * 0.5, y: apexY - gap * 0.87 },
      { n: 4, x: apexX - gap, y: apexY - gap * 1.74 },
      { n: 9, x: apexX, y: apexY - gap * 1.74 },
      { n: 5, x: apexX + gap, y: apexY - gap * 1.74 },
      { n: 6, x: apexX - gap * 0.5, y: apexY - gap * 2.61 },
      { n: 7, x: apexX + gap * 0.5, y: apexY - gap * 2.61 },
      { n: 8, x: apexX, y: apexY - gap * 3.48 }
    ];
  }

  function create(table, config) {
    var r = (config && config.ballRadius) || 8.2;
    var list = [];
    list.push({
      id: 'cue',
      n: 0,
      x: table.felt.cx,
      y: table.kitchenY,
      vx: 0,
      vy: 0,
      r: r,
      pocketed: false,
      color: '#F8FAFC',
      label: ''
    });
    var spots = rackPositions(table, r);
    var i;
    for (i = 0; i < spots.length; i++) {
      var s = spots[i];
      list.push({
        id: 'b' + s.n,
        n: s.n,
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        r: r,
        pocketed: false,
        color: COLORS[s.n],
        label: String(s.n)
      });
    }
    return list;
  }

  function cueBall(balls) {
    var i;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].id === 'cue') return balls[i];
    }
    return null;
  }

  function objectBalls(balls) {
    return balls.filter(function (b) { return b.id !== 'cue'; });
  }

  function lowestNumbered(balls) {
    var lowest = null;
    var i;
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.id === 'cue' || b.pocketed) continue;
      if (!lowest || b.n < lowest.n) lowest = b;
    }
    return lowest;
  }

  function remainingCount(balls) {
    var n = 0;
    var i;
    for (i = 0; i < balls.length; i++) {
      if (!balls[i].pocketed && balls[i].id !== 'cue') n += 1;
    }
    return n;
  }

  return {
    COLORS: COLORS,
    rackPositions: rackPositions,
    create: create,
    cueBall: cueBall,
    objectBalls: objectBalls,
    lowestNumbered: lowestNumbered,
    remainingCount: remainingCount
  };
});
