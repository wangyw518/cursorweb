(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'xingchen.best';
  var memory = { best: 0, stamina: 30, lastRegenAt: 0, levelId: 1 };

  function normalize(raw) {
    if (typeof raw === 'number' && isFinite(raw)) {
      return { best: raw, stamina: 30, lastRegenAt: 0, levelId: 1 };
    }
    if (!raw || typeof raw !== 'object') return null;
    var best = typeof raw.best === 'number' && isFinite(raw.best) ? raw.best : 0;
    var stamina = typeof raw.stamina === 'number' && isFinite(raw.stamina) ? raw.stamina : 30;
    var lastRegenAt = typeof raw.lastRegenAt === 'number' && isFinite(raw.lastRegenAt) ? raw.lastRegenAt : 0;
    var levelId = typeof raw.levelId === 'number' && isFinite(raw.levelId) ? raw.levelId : 1;
    return { best: best, stamina: stamina, lastRegenAt: lastRegenAt, levelId: levelId };
  }

  function persist() {
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

  function load() {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        var fromWx = normalize(wx.getStorageSync(KEY));
        if (fromWx) {
          memory = fromWx;
          return {
            best: fromWx.best,
            stamina: fromWx.stamina,
            lastRegenAt: fromWx.lastRegenAt,
            levelId: fromWx.levelId
          };
        }
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(KEY);
        var parsed = raw ? normalize(JSON.parse(raw)) : null;
        if (parsed) {
          memory = parsed;
          return {
            best: parsed.best,
            stamina: parsed.stamina,
            lastRegenAt: parsed.lastRegenAt,
            levelId: parsed.levelId
          };
        }
      }
    } catch (err2) {}
    return {
      best: memory.best,
      stamina: memory.stamina,
      lastRegenAt: memory.lastRegenAt,
      levelId: memory.levelId
    };
  }

  function save(data) {
    var next = normalize(data) || { best: 0, stamina: 30, lastRegenAt: 0, levelId: 1 };
    memory = {
      best: next.best,
      stamina: next.stamina,
      lastRegenAt: next.lastRegenAt,
      levelId: next.levelId
    };
    persist();
  }

  function resetMemory() {
    memory = { best: 0, stamina: 30, lastRegenAt: 0, levelId: 1 };
  }

  return {
    KEY: KEY,
    load: load,
    save: save,
    resetMemory: resetMemory
  };
});
