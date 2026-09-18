(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'xingchen.qijing';
  var LEGACY = 'xingchen.best';
  var memory = { best: 0, stamina: 30, crystals: 0, bestLevel: 1 };

  function asNum(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function normalize(raw) {
    if (typeof raw === 'number' && isFinite(raw)) {
      return { best: raw, stamina: 30, crystals: 0, bestLevel: 1 };
    }
    if (!raw || typeof raw !== 'object') return null;
    return {
      best: Math.max(0, asNum(raw.best, 0)),
      stamina: Math.max(0, Math.min(30, asNum(raw.stamina, 30))),
      crystals: Math.max(0, asNum(raw.crystals, 0)),
      bestLevel: Math.max(1, asNum(raw.bestLevel, 1))
    };
  }

  function readStore(storeKey) {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        var fromWx = normalize(wx.getStorageSync(storeKey));
        if (fromWx) return fromWx;
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(storeKey);
        var parsed = raw ? normalize(JSON.parse(raw)) : null;
        if (parsed) return parsed;
      }
    } catch (err2) {}
    return null;
  }

  function writeStore(data) {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(KEY, data);
        return;
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEY, JSON.stringify(data));
      }
    } catch (err2) {}
  }

  function load() {
    var fresh = readStore(KEY) || readStore(LEGACY);
    if (fresh) {
      memory = fresh;
      return {
        best: fresh.best,
        stamina: fresh.stamina,
        crystals: fresh.crystals,
        bestLevel: fresh.bestLevel
      };
    }
    return {
      best: memory.best,
      stamina: memory.stamina,
      crystals: memory.crystals,
      bestLevel: memory.bestLevel
    };
  }

  function save(data) {
    var next = normalize(data) || { best: 0, stamina: 30, crystals: 0, bestLevel: 1 };
    memory = next;
    writeStore(memory);
    return memory;
  }

  function resetMemory() {
    memory = { best: 0, stamina: 30, crystals: 0, bestLevel: 1 };
  }

  return {
    KEY: KEY,
    LEGACY: LEGACY,
    load: load,
    save: save,
    resetMemory: resetMemory
  };
});
