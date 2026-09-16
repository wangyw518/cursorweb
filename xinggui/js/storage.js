'use strict';

function createStorage(platform, key) {
  return {
    getBest: function () {
      const v = platform.getStorage(key);
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return isFinite(n) && n > 0 ? n : 0;
    },
    setBest: function (score) {
      const n = Math.max(0, score | 0);
      const prev = this.getBest();
      if (n > prev) {
        platform.setStorage(key, n);
        return n;
      }
      return prev;
    }
  };
}

module.exports = {
  createStorage: createStorage
};
