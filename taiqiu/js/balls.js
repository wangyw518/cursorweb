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

  function findByN(list, n) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].n === n) return list[i];
    }
    return null;
  }

  function findById(list, id) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function hashObjectBalls(list) {
    var parts = [];
    var i;
    if (!list) return '';
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.id === 'cue') continue;
      parts.push(
        String(b.id) + ':' +
        Number(b.x).toFixed(4) + ',' +
        Number(b.y).toFixed(4) + ',' +
        (b.pocketed ? 1 : 0)
      );
    }
    return parts.join('|');
  }

  function snapshotObjectBalls(list) {
    var out = [];
    var i;
    if (!list) return out;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.id === 'cue') continue;
      out.push({
        id: b.id,
        x: b.x,
        y: b.y,
        pocketed: !!b.pocketed
      });
    }
    return out;
  }

  function restoreObjectBalls(list, snap) {
    if (!list || !snap || !snap.length) return list;
    var map = {};
    var i;
    for (i = 0; i < snap.length; i++) map[snap[i].id] = snap[i];
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.id === 'cue') continue;
      var s = map[b.id];
      if (!s) continue;
      b.x = s.x;
      b.y = s.y;
      b.pocketed = !!s.pocketed;
      b.vx = 0;
      b.vy = 0;
    }
    return list;
  }

  function haltBalls(list) {
    var i;
    if (!list) return list;
    for (i = 0; i < list.length; i++) {
      list[i].vx = 0;
      list[i].vy = 0;
    }
    return list;
  }

  function unstick(ball, list) {
    var guard = 0;
    while (guard < 12) {
      var hit = false;
      var i;
      for (i = 0; i < list.length; i++) {
        var other = list[i];
        if (other === ball || other.pocketed) continue;
        var dx = ball.x - other.x;
        var dy = ball.y - other.y;
        var d = Math.hypot(dx, dy);
        var min = ball.r + other.r + 0.4;
        if (d < min) {
          if (d < 1e-6) {
            ball.x += min;
          } else {
            ball.x += (dx / d) * (min - d);
            ball.y += (dy / d) * (min - d);
          }
          hit = true;
        }
      }
      if (!hit) break;
      guard += 1;
    }
    return ball;
  }

  function respotCue(list, table) {
    var cue = cueBall(list);
    if (!cue) return null;
    cue.pocketed = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = table.felt.cx;
    cue.y = table.kitchenY;
    return unstick(cue, list);
  }

  function spotNine(list, table) {
    var nine = findByN(list, 9);
    if (!nine) return null;
    var home = null;
    var spots = rackPositions(table, nine.r);
    var i;
    for (i = 0; i < spots.length; i++) {
      if (spots[i].n === 9) home = spots[i];
    }
    nine.pocketed = false;
    nine.vx = 0;
    nine.vy = 0;
    nine.x = home ? home.x : table.felt.cx;
    nine.y = home ? home.y : table.rackY;
    return unstick(nine, list);
  }

  return {
    COLORS: COLORS,
    rackPositions: rackPositions,
    create: create,
    cueBall: cueBall,
    objectBalls: objectBalls,
    lowestNumbered: lowestNumbered,
    remainingCount: remainingCount,
    findByN: findByN,
    findById: findById,
    hashObjectBalls: hashObjectBalls,
    snapshotObjectBalls: snapshotObjectBalls,
    restoreObjectBalls: restoreObjectBalls,
    haltBalls: haltBalls,
    unstick: unstick,
    respotCue: respotCue,
    spotNine: spotNine
  };
});

