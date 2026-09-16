'use strict';

const math = require('./math.js');

function createStar(id, w, h, cfg, rng, fadeIn) {
  const pad = cfg.edgePadding || 36;
  const color = math.pick(rng, cfg.palette);
  const r = math.randRange(rng, cfg.starMinR, cfg.starMaxR);
  const ang = rng() * Math.PI * 2;
  const spd = math.randRange(rng, cfg.driftSpeed * 0.45, cfg.driftSpeed);
  return {
    id: id,
    x: math.randRange(rng, pad, w - pad),
    y: math.randRange(rng, pad + 48, h - pad - 72),
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    angle: ang,
    turn: math.randRange(rng, -cfg.turnRate, cfg.turnRate),
    r: r,
    color: color,
    twinkle: rng() * Math.PI * 2,
    twinkleSpeed: math.randRange(rng, 0.7, 1.8),
    selected: false,
    selIndex: -1,
    dead: false,
    born: fadeIn ? 0 : 1,
    pulse: 0
  };
}

function spawnField(count, w, h, cfg, rng) {
  const stars = [];
  let id = 1;
  let guard = 0;
  while (stars.length < count && guard < count * 20) {
    guard++;
    const s = createStar(id, w, h, cfg, rng, false);
    if (tooClose(s, stars, 28)) continue;
    stars.push(s);
    id++;
  }
  while (stars.length < count) {
    stars.push(createStar(id++, w, h, cfg, rng, false));
  }
  return { stars: stars, nextId: id };
}

function tooClose(star, stars, minD) {
  const m2 = minD * minD;
  for (let i = 0; i < stars.length; i++) {
    if (math.dist2(star.x, star.y, stars[i].x, stars[i].y) < m2) return true;
  }
  return false;
}

function indexById(stars) {
  const map = Object.create(null);
  for (let i = 0; i < stars.length; i++) map[stars[i].id] = stars[i];
  return map;
}

function findNearest(stars, x, y, maxR, pred) {
  let best = null;
  let bestD = maxR * maxR;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s.dead) continue;
    if (pred && !pred(s)) continue;
    const d2 = math.dist2(x, y, s.x, s.y);
    if (d2 <= bestD) {
      bestD = d2;
      best = s;
    }
  }
  return best;
}

function updateStars(stars, dt, world) {
  const pad = world.pad;
  const w = world.w;
  const h = world.h;
  const damp = Math.pow(0.86, dt * 60);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s.dead) continue;
    s.angle += s.turn * dt;
    const cruise = world.drift || 10;
    const want = Math.cos(s.angle) * cruise;
    const wany = Math.sin(s.angle) * cruise;
    s.vx = s.vx * damp + want * (1 - damp) * 0.35;
    s.vy = s.vy * damp + wany * (1 - damp) * 0.35;
    const cap = cruise * 1.8;
    const L = math.length(s.vx, s.vy);
    if (L > cap) {
      s.vx = (s.vx / L) * cap;
      s.vy = (s.vy / L) * cap;
    }
    const hold = s.selected ? (world.selectedDrift == null ? 0.22 : world.selectedDrift) : 1;
    s.x += s.vx * dt * hold;
    s.y += s.vy * dt * hold;
    if (s.x < pad) { s.x = pad; s.vx = Math.abs(s.vx); s.angle = Math.atan2(s.vy, s.vx); }
    if (s.x > w - pad) { s.x = w - pad; s.vx = -Math.abs(s.vx); s.angle = Math.atan2(s.vy, s.vx); }
    if (s.y < pad + 40) { s.y = pad + 40; s.vy = Math.abs(s.vy); s.angle = Math.atan2(s.vy, s.vx); }
    if (s.y > h - pad - 56) { s.y = h - pad - 56; s.vy = -Math.abs(s.vy); s.angle = Math.atan2(s.vy, s.vx); }
    s.twinkle += s.twinkleSpeed * dt;
    if (s.born < 1) s.born = Math.min(1, s.born + dt / (world.spawnFade || 0.45));
    if (s.pulse > 0) s.pulse = Math.max(0, s.pulse - dt * 3.2);
  }
}

function refill(stars, nextId, target, w, h, cfg, rng) {
  let id = nextId;
  let guard = 0;
  while (aliveCount(stars) < target && guard < 40) {
    guard++;
    const s = createStar(id, w, h, cfg, rng, true);
    if (tooClose(s, stars.filter(function (x) { return !x.dead; }), 26)) continue;
    stars.push(s);
    id++;
  }
  return id;
}

function aliveCount(stars) {
  let n = 0;
  for (let i = 0; i < stars.length; i++) if (!stars[i].dead) n++;
  return n;
}

function compact(stars) {
  let w = 0;
  for (let i = 0; i < stars.length; i++) {
    if (!stars[i].dead) stars[w++] = stars[i];
  }
  stars.length = w;
}

function drawStar(ctx, star, time, opts) {
  if (star.dead) return;
  const tw = 0.72 + 0.28 * Math.sin(star.twinkle + time * 0.6);
  const born = star.born;
  const sel = star.selected;
  const near = opts && opts.near ? opts.near : 0;
  const closeable = opts && opts.closeable;
  const scale = (sel ? 1.18 : 1) + near * 0.16 + star.pulse * 0.22;
  const r = star.r * scale;
  const x = star.x;
  const y = star.y;
  const a = born * tw;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const glowOut = (opts && opts.glowOuterR) || 14;
  const bloomR = r * 3.1 + glowOut * (opts && opts.low ? 1.1 : 2.2);
  const bloom = ctx.createRadialGradient(x, y, 0, x, y, bloomR);
  bloom.addColorStop(0, math.rgba('#FFFFFF', 0.95 * a));
  bloom.addColorStop(0.08, math.rgba(star.color, 0.85 * a));
  bloom.addColorStop(0.22, math.rgba(star.color, 0.38 * a));
  bloom.addColorStop(0.5, math.rgba(star.color, 0.10 * a));
  bloom.addColorStop(1, math.rgba(star.color, 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(x, y, bloomR, 0, Math.PI * 2);
  ctx.fill();

  const glowIn = (opts && opts.glowInnerR) || 6;
  fillCircle(ctx, x, y, Math.max(r * 1.2, glowIn), star.color, 0.42 * a);
  fillCircle(ctx, x, y, r * 0.85, '#FFFFFF', 0.9 * a);
  fillCircle(ctx, x, y, r * 0.32, '#FFFFFF', 1 * a);

  if (sel && !closeable) {
    ctx.globalCompositeOperation = 'lighter';
    strokeCircle(ctx, x, y, r * 2.35, 'rgba(232,242,255,0.7)', 1.2);
    fillCircle(ctx, x, y, r * 3.8, '#C8DCFF', 0.10);
  }
  if (closeable) {
    const ring = r * (3.6 + 0.9 * Math.sin(time * 5.2));
    strokeCircle(ctx, x, y, ring, 'rgba(255, 220, 150, 0.95)', 1.8);
    strokeCircle(ctx, x, y, ring + 7, 'rgba(255, 226, 168, 0.35)', 1);
    fillCircle(ctx, x, y, r * 5.2, '#FFE7B8', 0.14);
  }
  if (opts && opts.origin && !closeable) {
    strokeCircle(ctx, x, y, r * 2.8, 'rgba(255, 226, 168, 0.45)', 1);
  }
  ctx.restore();
}

function fillCircle(ctx, x, y, r, color, alpha) {
  if (alpha <= 0.004 || r <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function strokeCircle(ctx, x, y, r, color, width) {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function densify(points, perNode) {
  if (!points || points.length < 2 || perNode <= 1) return points;
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    out.push(a);
    for (let k = 1; k < perNode; k++) {
      const t = k / perNode;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function drawTrail(ctx, points, finger, stretch, closable, first, time, cfg, quality) {
  if (!points.length) return;
  const raw = points.slice();
  if (finger && finger.active) raw.push({ x: finger.x, y: finger.y });
  const per = (cfg && cfg.trailPointsPerNode) || 2;
  const pts = densify(raw, per);
  const from = (cfg && cfg.trailFrom) || '#A78BFA';
  const to = (cfg && cfg.trailTo) || '#22D3EE';
  const a0 = (cfg && cfg.trailAlpha0) || 0.55;
  const danger = stretch;
  const low = quality && quality.low;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';

  if (closable && first && points.length >= 3) {
    const fillPts = points.concat([{ x: first.x, y: first.y }]);
    ctx.globalAlpha = 0.10 + 0.04 * Math.sin(time * 4);
    ctx.fillStyle = from;
    ctx.beginPath();
    ctx.moveTo(fillPts[0].x, fillPts[0].y);
    for (let i = 1; i < fillPts.length; i++) ctx.lineTo(fillPts[i].x, fillPts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 4);
    ctx.setLineDash([5, 7]);
    strokePoly(ctx, [points[points.length - 1], { x: first.x, y: first.y }], 1.6, math.rgba('#F472B6', 0.85));
    ctx.setLineDash([]);
  }

  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    const firstP = pts[0];
    const grad = ctx.createLinearGradient(firstP.x, firstP.y, last.x, last.y);
    grad.addColorStop(0, math.rgba(math.mixHex(from, '#FF8B7A', danger), a0));
    grad.addColorStop(1, math.rgba(math.mixHex(to, '#FF8B7A', danger), Math.min(1, a0 + 0.25)));
    if (!low) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = low ? 3.2 : 2.4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = math.rgba('#FFFFFF', 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  ctx.restore();
}

function strokePoly(ctx, pts, width, color) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

module.exports = {
  createStar: createStar,
  spawnField: spawnField,
  indexById: indexById,
  findNearest: findNearest,
  updateStars: updateStars,
  refill: refill,
  aliveCount: aliveCount,
  compact: compact,
  drawStar: drawStar,
  drawTrail: drawTrail,
  tooClose: tooClose
};
