'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 500;
const H = 400;
const data = Buffer.alloc(W * H * 4);

function px(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const aa = a / 255;
  data[i] = Math.min(255, Math.round(data[i] * (1 - aa) + r * aa));
  data[i + 1] = Math.min(255, Math.round(data[i + 1] * (1 - aa) + g * aa));
  data[i + 2] = Math.min(255, Math.round(data[i + 2] * (1 - aa) + b * aa));
  data[i + 3] = 255;
}

function fill(r, g, b) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

function disc(cx, cy, rad, r, g, b, a0) {
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / rad;
      if (d >= 1) continue;
      const a = Math.round(a0 * (1 - d) * (1 - d));
      if (a > 0) px(x, y, r, g, b, a);
    }
  }
}

fill(7, 11, 24);
disc(90, 90, 160, 48, 36, 110, 70);
disc(390, 70, 140, 18, 52, 88, 80);
disc(320, 300, 170, 62, 24, 72, 55);

const rng = function (s) {
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}(11);

for (let i = 0; i < 120; i++) {
  disc(rng() * W, rng() * H, rng() < 0.8 ? 1.2 : 2.2, 232, 238, 255, 80 + rng() * 140);
}

const pts = [[110, 250], [210, 140], [330, 170], [390, 260], [280, 310], [110, 250]];
for (let i = 1; i < pts.length; i++) {
  const [x0, y0] = pts[i - 1];
  const [x1, y1] = pts[i];
  const n = 80;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 7, 180, 210, 255, 50);
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2.2, 255, 255, 255, 200);
  }
}
pts.forEach(function (p) {
  disc(p[0], p[1], 16, 255, 230, 180, 90);
  disc(p[0], p[1], 4, 255, 255, 255, 230);
});

function chunk(type, payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type), payload]);
  const crc = crc32(body);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, body, c]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const raw = [];
for (let y = 0; y < H; y++) {
  raw.push(Buffer.from([0]));
  raw.push(data.slice(y * W * 4, (y + 1) * W * 4));
}
const idat = zlib.deflateSync(Buffer.concat(raw));
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'share-cover.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length);
