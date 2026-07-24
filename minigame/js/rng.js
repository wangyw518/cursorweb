function createRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    },
  };
}

function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
}

function parseSeed(value) {
  if (value == null || value === '') return null;
  const n = parseInt(String(value), 36);
  if (!isFinite(n) || n <= 0) return null;
  return n >>> 0;
}

function encodeSeed(seed) {
  return (seed >>> 0).toString(36);
}

module.exports = { createRng, randomSeed, parseSeed, encodeSeed };
