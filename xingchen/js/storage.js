(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'xingchen.qijing';
  var LEGACY_KEY = 'xingchen.best';
  var STAMINA_MAX = 30;
  var memory = { best: 0, stamina: STAMINA_MAX };

  function normalize(raw) {
    if (typeof raw === 'number' && isFinite(raw)) {
      return { best: raw, stamina: memory.stamina };
    }
    if (!raw || typeof raw !== 'object') return null;
    var best = 0;
    var stamina = memory.stamina;
    if (typeof raw.best === 'number' && isFinite(raw.best)) best = raw.best;
    if (typeof raw.stamina === 'number' && isFinite(raw.stamina)) stamina = raw.stamina;
    if (stamina < 0) stamina = 0;
    if (stamina > STAMINA_MAX) stamina = STAMINA_MAX;
    return { best: best, stamina: stamina };
  }

  function persist(next) {
    memory = { best: next.best, stamina: next.stamina };
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(KEY, memory);
        return;
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEY, JSON.stringify(memory));
      }
    } catch (err2) {}
  }

  function readKey(storeKey) {
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

  function load() {
    var cur = readKey(KEY);
    if (cur) {
      memory = cur;
      return { best: cur.best, stamina: cur.stamina };
    }
    var legacy = readKey(LEGACY_KEY);
    if (legacy) {
      memory = { best: legacy.best, stamina: STAMINA_MAX };
      persist(memory);
      return { best: memory.best, stamina: memory.stamina };
    }
    return { best: memory.best, stamina: memory.stamina };
  }

  function save(data) {
    var next = normalize(data) || { best: 0, stamina: memory.stamina };
    if (data && data.stamina == null) next.stamina = memory.stamina;
    persist(next);
  }

  function resetMemory() {
    memory = { best: 0, stamina: STAMINA_MAX };
  }

  return {
    KEY: KEY,
    LEGACY_KEY: LEGACY_KEY,
    load: load,
    save: save,
    resetMemory: resetMemory
  };
});
