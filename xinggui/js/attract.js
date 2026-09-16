'use strict';

const math = require('./math.js');

function applyAttraction(stars, points, radius, strength, dt) {
  if (!stars || !points || points.length < 2 || radius <= 0) return;
  const r2 = radius * radius;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s.selected || s.dead) continue;
    let best = r2;
    let cx = s.x;
    let cy = s.y;
    let found = false;
    for (let k = 1; k < points.length; k++) {
      const p = math.closestPointOnSegment(
        s.x, s.y,
        points[k - 1].x, points[k - 1].y,
        points[k].x, points[k].y
      );
      const d2 = math.dist2(s.x, s.y, p.x, p.y);
      if (d2 < best) {
        best = d2;
        cx = p.x;
        cy = p.y;
        found = true;
      }
    }
    if (!found) continue;
    const d = Math.sqrt(best);
    if (d < 0.4) continue;
    const falloff = 1 - d / radius;
    const force = strength * falloff * falloff * dt;
    s.vx += ((cx - s.x) / d) * force;
    s.vy += ((cy - s.y) / d) * force;
  }
}

module.exports = {
  applyAttraction: applyAttraction
};
