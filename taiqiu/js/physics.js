/**
 * Lightweight custom 2D billiard physics.
 * Circles, cushions, friction, pockets. No Matter.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuPhysics = api;
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
    return { x: x, y: y, vx: 0, vy: 0, r: r || 8.2, pocketed: false };
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

  function inPocket(body, pockets) {
    var i;
    for (i = 0; i < pockets.length; i++) {
      var p = pockets[i];
      if (hypot(body.x - p.x, body.y - p.y) <= p.r) {
        return p;
      }
    }
    return null;
  }

  function inPocketMouth(body, pockets) {
    var i;
    for (i = 0; i < pockets.length; i++) {
      var p = pockets[i];
      if (hypot(body.x - p.x, body.y - p.y) <= p.r + body.r * 0.2) {
        return p;
      }
    }
    return null;
  }

  function resolveCircleCircleStatic(body, cx, cy, cr, restitution) {
    var nx = body.x - cx;
    var ny = body.y - cy;
    var dist = hypot(nx, ny);
    var minDist = body.r + cr;
    if (dist >= minDist) return false;
    var n = dist < 1e-6 ? { x: 1, y: 0 } : { x: nx / dist, y: ny / dist };
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

  function resolveCushion(body, wall, restitution) {
    var c = closestOnSeg(body.x, body.y, wall.x1, wall.y1, wall.x2, wall.y2);
    var nx = body.x - c.x;
    var ny = body.y - c.y;
    var dist = hypot(nx, ny);
    var minDist = body.r + (wall.r || 0);
    if (dist >= minDist) return { hit: false, bounced: false };
    var n = dist < 1e-6 ? { x: wall.nx || 1, y: wall.ny || 0 } : { x: nx / dist, y: ny / dist };
    var pen = minDist - dist;
    body.x += n.x * pen;
    body.y += n.y * pen;
    var vn = body.vx * n.x + body.vy * n.y;
    var bounced = false;
    if (vn < 0) {
      var e = 1 + restitution;
      body.vx -= e * vn * n.x;
      body.vy -= e * vn * n.y;
      bounced = true;
    }
    return { hit: true, bounced: bounced };
  }

  function resolveBallBall(a, b, restitution) {
    if (a.pocketed || b.pocketed) return false;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = hypot(dx, dy);
    var min = a.r + b.r;
    if (dist >= min) return false;
    var n = dist < 1e-6 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
    var pen = min - dist;
    a.x -= n.x * pen * 0.5;
    a.y -= n.y * pen * 0.5;
    b.x += n.x * pen * 0.5;
    b.y += n.y * pen * 0.5;
    var rvx = a.vx - b.vx;
    var rvy = a.vy - b.vy;
    var vn = rvx * n.x + rvy * n.y;
    if (vn <= 0) return true;
    var j = ((1 + restitution) * vn) / 2;
    a.vx -= j * n.x;
    a.vy -= j * n.y;
    b.vx += j * n.x;
    b.vy += j * n.y;
    return true;
  }

  function firstHitBall(cue, others) {
    var i;
    var best = null;
    var bestD = Infinity;
    for (i = 0; i < others.length; i++) {
      var b = others[i];
      if (b.pocketed || b.id === 'cue') continue;
      var d = hypot(cue.x - b.x, cue.y - b.y);
      var touch = cue.r + b.r + 0.35;
      if (d <= touch && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function isCueBody(body) {
    return !!(body && body.id === 'cue');
  }

  function stepOnce(balls, walls, pockets, dt, config, lockObjects) {
    var events = { cushions: 0, pockets: [], contacts: [], cueHitBall: false };
    var maxSpeed = config.maxSpeed || 920;
    var friction = config.friction == null ? 1.55 : config.friction;
    var ballE = config.ballRestitution == null ? 0.92 : config.ballRestitution;
    var cushE = config.cushionRestitution == null ? 0.68 : config.cushionRestitution;
    var damp = Math.exp(-friction * dt);
    var locked = !!lockObjects;
    var i;
    var j;

    for (i = 0; i < balls.length; i++) {
      var body = balls[i];
      if (body.pocketed) continue;
      if (locked && !isCueBody(body)) {
        body.vx = 0;
        body.vy = 0;
        continue;
      }
      clampSpeed(body, maxSpeed);
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }

    for (i = 0; i < balls.length; i++) {
      var ball = balls[i];
      if (ball.pocketed) continue;
      var pocket = inPocket(ball, pockets);
      if (pocket) {
        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.pocket = pocket;
        events.pockets.push({ ball: ball, pocket: pocket });
      }
    }

    for (i = 0; i < balls.length; i++) {
      var a = balls[i];
      if (a.pocketed) continue;
      if (locked && !isCueBody(a)) continue;
      if (inPocketMouth(a, pockets)) continue;
      for (j = 0; j < walls.length; j++) {
        var cush = resolveCushion(a, walls[j], cushE);
        if (cush.bounced) {
          events.cushions += 1;
          events.contacts.push({ kind: 'cushion', ball: a, wall: walls[j] });
        }
      }
    }

    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      for (j = i + 1; j < balls.length; j++) {
        if (balls[j].pocketed) continue;
        if (locked && !isCueBody(balls[i]) && !isCueBody(balls[j])) continue;
        if (resolveBallBall(balls[i], balls[j], ballE)) {
          events.contacts.push({ kind: 'ball', a: balls[i], b: balls[j] });
          if (isCueBody(balls[i]) || isCueBody(balls[j])) {
            events.cueHitBall = true;
            locked = false;
          }
        }
      }
    }

    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      var late = inPocket(balls[i], pockets);
      if (late) {
        balls[i].pocketed = true;
        balls[i].vx = 0;
        balls[i].vy = 0;
        balls[i].pocket = late;
        events.pockets.push({ ball: balls[i], pocket: late });
      }
    }

    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      balls[i].vx *= damp;
      balls[i].vy *= damp;
      clampSpeed(balls[i], maxSpeed);
    }

    return events;
  }

  function step(world, dt, config) {
    if (world && world.frozen) {
      return { cushions: 0, pockets: [], contacts: [], substeps: 0, frozen: true };
    }
    var balls = world.balls || [];
    var speed = 0;
    var i;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      speed = Math.max(speed, hypot(balls[i].vx, balls[i].vy));
    }
    var sub = Math.max(1, Math.min(8, Math.ceil((speed * dt) / 4.2)));
    var slice = dt / sub;
    var lock = !!world.lockObjects;
    var merged = { cushions: 0, pockets: [], contacts: [], substeps: sub, cueHitBall: false };
    for (i = 0; i < sub; i++) {
      var ev = stepOnce(balls, world.walls || [], world.pockets || [], slice, config, lock);
      merged.cushions += ev.cushions;
      merged.pockets = merged.pockets.concat(ev.pockets);
      merged.contacts = merged.contacts.concat(ev.contacts);
      if (ev.cueHitBall) {
        merged.cueHitBall = true;
        lock = false;
      }
    }
    return merged;
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

  function preview(origin, dirX, dirY, world, config) {
    var n = norm(dirX, dirY);
    // Read-only copies — never write origin or object-ball positions.
    var ox = origin.x;
    var oy = origin.y;
    var oid = origin.id || 'cue';
    var points = [{ x: ox, y: oy }];
    if (n.len < 1e-6) return { points: points, ghost: null, bounces: 0 };
    var px = ox;
    var py = oy;
    var vx = n.x;
    var vy = n.y;
    var remaining = config.previewLength == null ? 720 : config.previewLength;
    var maxBounces = config.previewBounces == null ? 3 : config.previewBounces;
    var ballR = origin.r || config.ballRadius || 8.2;
    var ghost = null;
    var bounces = 0;
    var i;
    var j;

    for (i = 0; i <= maxBounces && remaining > 1; i++) {
      var best = null;
      var walls = world.walls || [];
      var balls = world.balls || [];
      for (j = 0; j < walls.length; j++) {
        var w = walls[j];
        var tW = raycastSeg(px, py, vx, vy, w.x1, w.y1, w.x2, w.y2);
        if (tW != null && tW <= remaining && (!best || tW < best.t)) {
          var wn = norm(w.nx != null ? w.nx : (py - w.y1), w.ny != null ? w.ny : (w.x1 - px));
          best = { t: tW, nx: wn.x, ny: wn.y, kind: 'wall' };
        }
      }
      for (j = 0; j < balls.length; j++) {
        var b = balls[j];
        if (b.pocketed || b === origin || b.id === oid) continue;
        var tB = raycastCircle(px, py, vx, vy, b.x, b.y, b.r + ballR);
        if (tB != null && tB <= remaining && (!best || tB < best.t)) {
          var hx = px + vx * tB - b.x;
          var hy = py + vy * tB - b.y;
          var bn = norm(hx, hy);
          best = { t: tB, nx: bn.x, ny: bn.y, kind: 'ball', targetId: b.id };
        }
      }
      if (!best) {
        points.push({ x: px + vx * remaining, y: py + vy * remaining });
        break;
      }
      var hitX = px + vx * best.t;
      var hitY = py + vy * best.t;
      points.push({ x: hitX, y: hitY });
      if (best.kind === 'ball' && !ghost) {
        ghost = { x: hitX, y: hitY, targetId: best.targetId };
        break;
      }
      remaining -= best.t;
      if (i === maxBounces) break;
      var ref = reflect(vx, vy, best.nx, best.ny);
      var rn = norm(ref.x, ref.y);
      vx = rn.x;
      vy = rn.y;
      px = hitX + vx * 0.1;
      py = hitY + vy * 0.1;
      bounces += 1;
    }
    return { points: points, ghost: ghost, bounces: bounces };
  }

  function anyMoving(balls, stopSpeed) {
    var limit = stopSpeed == null ? 10 : stopSpeed;
    var i;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      if (hypot(balls[i].vx, balls[i].vy) >= limit) return true;
    }
    return false;
  }

  return {
    hypot: hypot,
    norm: norm,
    reflect: reflect,
    clampSpeed: clampSpeed,
    createBody: createBody,
    closestOnSeg: closestOnSeg,
    inPocket: inPocket,
    inPocketMouth: inPocketMouth,
    resolveBallBall: resolveBallBall,
    resolveCushion: resolveCushion,
    firstHitBall: firstHitBall,
    step: step,
    preview: preview,
    anyMoving: anyMoving
  };
});
