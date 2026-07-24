/** 可复现随机数：同一种子 = 同一关卡序列，支撑「挑战好友」公平对比 */
export function createRng(seed) {
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
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
}

export function parseSeed(value) {
  if (value == null || value === '') return null;
  const n = Number.parseInt(String(value), 36);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >>> 0;
}

export function encodeSeed(seed) {
  return (seed >>> 0).toString(36);
}
