'use strict';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

function normalize(x, y) {
  const L = length(x, y) || 1;
  return { x: x / L, y: y / L };
}

function mixHex(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return rgbToHex(
    Math.round(lerp(pa.r, pb.r, t)),
    Math.round(lerp(pa.g, pb.g, t)),
    Math.round(lerp(pa.b, pb.b, t))
  );
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function (v) {
    const s = clamp(v, 0, 255).toString(16);
    return s.length === 1 ? '0' + s : s;
  }).join('');
}

function rgba(hex, a) {
  const c = hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-8) return { x: ax, y: ay, t: 0 };
  let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
  t = clamp(t, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t, t: t };
}

function distToPolyline(px, py, points) {
  if (!points || points.length === 0) return Infinity;
  if (points.length === 1) return dist(px, py, points[0].x, points[0].y);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const p = closestPointOnSegment(px, py, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    const d = dist(px, py, p.x, p.y);
    if (d < best) best = d;
  }
  return best;
}

function isLeft(x0, y0, x1, y1, x, y) {
  return (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
}

function windingNumber(px, py, points) {
  if (!points || points.length < 3) return 0;
  let wn = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    if (yj <= py) {
      if (yi > py && isLeft(xj, yj, xi, yi, px, py) > 0) wn += 1;
    } else if (yi <= py && isLeft(xj, yj, xi, yi, px, py) < 0) {
      wn -= 1;
    }
  }
  return wn;
}

function pointInPolygon(px, py, points) {
  return windingNumber(px, py, points) !== 0;
}

function segmentsIntersect(a, b, c, d) {
  const ab = isLeft(a.x, a.y, b.x, b.y, c.x, c.y) * isLeft(a.x, a.y, b.x, b.y, d.x, d.y);
  const cd = isLeft(c.x, c.y, d.x, d.y, a.x, a.y) * isLeft(c.x, c.y, d.x, d.y, b.x, b.y);
  if (ab > 0 || cd > 0) return false;
  if (ab < 0 && cd < 0) return true;
  return false;
}

function polylineSelfIntersects(points) {
  if (!points || points.length < 4) return false;
  for (let i = 1; i < points.length; i++) {
    for (let k = i + 2; k < points.length; k++) {
      if (i === 1 && k === points.length - 1) continue;
      if (segmentsIntersect(points[i - 1], points[i], points[k - 1], points[k])) return true;
    }
  }
  return false;
}

function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(a) * 0.5;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, a, b) {
  return a + (b - a) * rng();
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

module.exports = {
  clamp: clamp,
  lerp: lerp,
  dist2: dist2,
  dist: dist,
  length: length,
  normalize: normalize,
  mixHex: mixHex,
  hexToRgb: hexToRgb,
  rgbToHex: rgbToHex,
  rgba: rgba,
  closestPointOnSegment: closestPointOnSegment,
  distToPolyline: distToPolyline,
  windingNumber: windingNumber,
  pointInPolygon: pointInPolygon,
  segmentsIntersect: segmentsIntersect,
  polylineSelfIntersects: polylineSelfIntersects,
  polygonArea: polygonArea,
  smoothstep: smoothstep,
  mulberry32: mulberry32,
  randRange: randRange,
  pick: pick,
  hashString: hashString
};
