(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EPS = 1e-4;

  function hypot(x, y) {
    return Math.hypot(x, y);
  }

  function norm(x, y) {
    var L = hypot(x, y);
    if (L < 1e-8) return { x: 1, y: 0, len: 0 };
    return { x: x / L, y: y / L, len: L };
  }

  function reflect(vx, vy, nx, ny) {
    var d = vx * nx + vy * ny;
    return { x: vx - 2 * d * nx, y: vy - 2 * d * ny };
  }

  function clampSpeed(body, maxSpeed) {
    var s = hypot(body.vx, body.vy);
    if (s > maxSpeed && s > 0) {
      var k = maxSpeed / s;
      body.vx *= k;
      body.vy *= k;
    }
    return body;
  }

  function createBody(x, y, r) {
    return { x: x, y: y, vx: 0, vy: 0, r: r || 9 };
  }

  function closestOnSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var den = dx * dx + dy * dy;
    var t = den < 1e-8 ? 0 : ((px - x1) * dx + (py - y1) * dy) / den;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return { x: x1 + dx * t, y: y1 + dy * t, t: t };
  }

  function raycastCircle(ox, oy, dx, dy, cx, cy, r) {
    var fx = ox - cx;
    var fy = oy - cy;
    var b = fx * dx + fy * dy;
    var c = fx * fx + fy * fy - r * r;
    var disc = b * b - c;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    if (t < EPS) return null;
    return t;
  }

  function raycastSeg(ox, oy, dx, dy, x1, y1, x2, y2) {
    var sx = x2 - x1;
    var sy = y2 - y1;
    var den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-8) return null;
    var t = ((x1 - ox) * sy - (y1 - oy) * sx) / den;
    var u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
    if (t < EPS || u < 0 || u > 1) return null;
    return t;
  }

  function raycastCapsule(ox, oy, dx, dy, x1, y1, x2, y2, r) {
    var sx = x2 - x1;
    var sy = y2 - y1;
    var slen = hypot(sx, sy) || 1;
    var ux = sx / slen;
    var uy = sy / slen;
    var nx = -uy;
    var ny = ux;
    var best = null;

    function consider(t, hx, hy) {
      if (t == null || t < EPS) return;
      if (!best || t < best.t) {
        var n = norm(hx, hy);
        best = { t: t, nx: n.x, ny: n.y };
      }
    }

    var sign;
    for (sign = -1; sign <= 1; sign += 2) {
      var ox1 = x1 + nx * r * sign;
      var oy1 = y1 + ny * r * sign;
      var ox2 = x2 + nx * r * sign;
      var oy2 = y2 + ny * r * sign;
      var tLine = raycastSeg(ox, oy, dx, dy, ox1, oy1, ox2, oy2);
      if (tLine != null) consider(tLine, nx * sign, ny * sign);
    }

    var tA = raycastCircle(ox, oy, dx, dy, x1, y1, r);
    if (tA != null) consider(tA, ox + dx * tA - x1, oy + dy * tA - y1);
    var tB = raycastCircle(ox, oy, dx, dy, x2, y2, r);
    if (tB != null) consider(tB, ox + dx * tB - x2, oy + dy * tB - y2);
    return best;
  }

  function resolveCircleCircle(body, cx, cy, cr, restitution) {
    var nx = body.x - cx;
    var ny = body.y - cy;
    var dist = hypot(nx, ny);
    var minDist = body.r + cr;
    if (dist >= minDist) return false;
    var n;
    if (dist < 1e-6) n = { x: 1, y: 0 };
    else n = { x: nx / dist, y: ny / dist };
    var pen = minDist - dist;
    body.x += n.x * pen;
    body.y += n.y * pen;
    var vn = body.vx * n.x + body.vy * n.y;
    if (vn < 0) {
      var e = 1 + restitution;
      body.vx -= e * vn * n.x;
      body.vy -= e * vn * n.y;
    }
    return true;
  }

  function resolveCircleCapsule(body, x1, y1, x2, y2, wr, restitution) {
    var c = closestOnSeg(body.x, body.y, x1, y1, x2, y2);
    return resolveCircleCircle(body, c.x, c.y, wr, restitution);
  }

  function collideWorld(body, walls, obstacles, restitution) {
    var hit = false;
    var i;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (resolveCircleCapsule(body, w.x1, w.y1, w.x2, w.y2, w.r, restitution)) hit = true;
    }
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (resolveCircleCircle(body, o.x, o.y, o.r, restitution)) hit = true;
    }
    return hit;
  }

  function stepOnce(body, walls, obstacles, dt, config) {
    clampSpeed(body, config.maxSpeed || 980);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    var hit = collideWorld(body, walls, obstacles, config.restitution == null ? 0.74 : config.restitution);
    clampSpeed(body, config.maxSpeed || 980);
    var friction = config.friction == null ? 2.05 : config.friction;
    var damp = Math.exp(-friction * dt);
    body.vx *= damp;
    body.vy *= damp;
    return hit;
  }

  function stepBody(body, walls, obstacles, dt, config) {
    var speed = hypot(body.vx, body.vy);
    var sub = Math.max(1, Math.min(6, Math.ceil((speed * dt) / Math.max(2, body.r * 0.55))));
    var slice = dt / sub;
    var hit = false;
    var i;
    for (i = 0; i < sub; i++) {
      if (stepOnce(body, walls, obstacles, slice, config)) hit = true;
    }
    return { hit: hit, substeps: sub };
  }

  function step(world, dt, config) {
    var balls = world.balls && world.balls.length ? world.balls : [world.ball];
    var hit = false;
    var maxSub = 1;
    var i;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].done) continue;
      var one = stepBody(balls[i], world.walls, world.obstacles, dt, config);
      if (one.hit) hit = true;
      if (one.substeps > maxSub) maxSub = one.substeps;
    }
    return { hit: hit, substeps: maxSub };
  }

  function raycastWorld(ox, oy, dx, dy, walls, obstacles, ballR, maxDist) {
    var best = null;
    var i;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      var cap = raycastCapsule(ox, oy, dx, dy, w.x1, w.y1, w.x2, w.y2, (w.r || 0) + ballR);
      if (cap && cap.t <= maxDist && (!best || cap.t < best.t)) {
        best = { t: cap.t, nx: cap.nx, ny: cap.ny, kind: 'wall' };
      }
    }
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var t = raycastCircle(ox, oy, dx, dy, o.x, o.y, o.r + ballR);
      if (t != null && t <= maxDist && (!best || t < best.t)) {
        var hx = ox + dx * t - o.x;
        var hy = oy + dy * t - o.y;
        var n = norm(hx, hy);
        best = { t: t, nx: n.x, ny: n.y, kind: 'obstacle' };
      }
    }
    return best;
  }

  /**
   * Reflection polyline vs static walls/obstacles. Not a full physics sim
   * (no friction, no integration).
   */
  function preview(origin, dirX, dirY, world, config) {
    var n = norm(dirX, dirY);
    var points = [{ x: origin.x, y: origin.y }];
    if (n.len < 1e-6) return { points: points, bounces: 0 };
    var px = origin.x;
    var py = origin.y;
    var vx = n.x;
    var vy = n.y;
    var remaining = config.previewLength == null ? 320 : config.previewLength;
    var maxBounces = config.previewBounces == null ? 5 : config.previewBounces;
    var ballR = (world.ball && world.ball.r) || config.ballRadius || 9;
    var bounces = 0;
    var i;
    for (i = 0; i <= maxBounces && remaining > 1; i++) {
      var hit = raycastWorld(px, py, vx, vy, world.walls, world.obstacles, ballR, remaining);
      if (!hit) {
        points.push({ x: px + vx * remaining, y: py + vy * remaining });
        break;
      }
      var hx = px + vx * hit.t;
      var hy = py + vy * hit.t;
      points.push({ x: hx, y: hy });
      remaining -= hit.t;
      if (i === maxBounces) break;
      var ref = reflect(vx, vy, hit.nx, hit.ny);
      vx = ref.x;
      vy = ref.y;
      var rn = norm(vx, vy);
      vx = rn.x;
      vy = rn.y;
      px = hx + vx * 0.08;
      py = hy + vy * 0.08;
      bounces += 1;
    }
    return { points: points, bounces: bounces };
  }

  return {
    hypot: hypot,
    norm: norm,
    reflect: reflect,
    clampSpeed: clampSpeed,
    createBody: createBody,
    closestOnSeg: closestOnSeg,
    raycastCircle: raycastCircle,
    raycastWorld: raycastWorld,
    collideWorld: collideWorld,
    step: step,
    preview: preview
  };
});
