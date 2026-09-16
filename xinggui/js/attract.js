(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiAttract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clampToRect(star, rect, pad) {
    if (!rect) return;
    var p = pad == null ? 8 : pad;
    star.x = Math.max(rect.x + p, Math.min(rect.x + rect.w - p, star.x));
    star.y = Math.max(rect.y + p, Math.min(rect.y + rect.h - p, star.y));
  }

  function nearestOnPath(star, pathStars) {
    var best = null;
    var i;
    for (i = 0; i < pathStars.length; i++) {
      var n = pathStars[i];
      var dx = n.x - star.x;
      var dy = n.y - star.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (!best || d < best.dist) best = { x: n.x, y: n.y, dist: d };
    }
    for (i = 0; i < pathStars.length - 1; i++) {
      var a = pathStars[i];
      var b = pathStars[i + 1];
      var vx = b.x - a.x;
      var vy = b.y - a.y;
      var len2 = vx * vx + vy * vy;
      if (len2 < 1e-6) continue;
      var t = ((star.x - a.x) * vx + (star.y - a.y) * vy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      var px = a.x + vx * t;
      var py = a.y + vy * t;
      var ddx = px - star.x;
      var ddy = py - star.y;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (!best || dd < best.dist) best = { x: px, y: py, dist: dd };
    }
    return best;
  }

  /**
   * Weak pull of unselected stars toward the current path.
   */
  function applyAttract(stars, pathStars, radius, dt, playRect, strength) {
    if (!stars || !stars.length || !pathStars || !pathStars.length) return 0;
    if (!(radius > 0) || !(dt > 0)) return 0;
    var pullMax = strength == null ? 14 : strength;
    var pathIds = {};
    var i;
    for (i = 0; i < pathStars.length; i++) pathIds[pathStars[i].id] = true;
    var moved = 0;
    for (i = 0; i < stars.length; i++) {
      var star = stars[i];
      if (pathIds[star.id]) continue;
      var near = nearestOnPath(star, pathStars);
      if (!near || near.dist > radius || near.dist < 6) continue;
      var pull = pullMax * (1 - near.dist / radius);
      var ux = (near.x - star.x) / near.dist;
      var uy = (near.y - star.y) / near.dist;
      star.x += ux * pull * dt;
      star.y += uy * pull * dt;
      clampToRect(star, playRect, 8);
      moved++;
    }
    return moved;
  }

  return {
    applyAttract: applyAttract,
    nearestOnPath: nearestOnPath
  };
});
