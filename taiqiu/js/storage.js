(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'taiqiu.best';
  var memory = { best: 0, skinProgress: 0, bgm: true, displayName: '' };

  function normalize(raw) {
    if (typeof raw === 'number' && isFinite(raw)) {
      return { best: raw, skinProgress: 0, bgm: true, displayName: '' };
    }
    if (!raw || typeof raw !== 'object') return null;
    var best = typeof raw.best === 'number' && isFinite(raw.best) ? raw.best : 0;
    var skinProgress = typeof raw.skinProgress === 'number' && isFinite(raw.skinProgress)
      ? raw.skinProgress
      : 0;
    var bgm = raw.bgm !== false;
    var displayName = typeof raw.displayName === 'string' ? raw.displayName : '';
    return { best: best, skinProgress: skinProgress, bgm: bgm, displayName: displayName };
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
            skinProgress: fromWx.skinProgress,
            bgm: fromWx.bgm !== false,
            displayName: fromWx.displayName || ''
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
            skinProgress: parsed.skinProgress,
            bgm: parsed.bgm !== false,
            displayName: parsed.displayName || ''
          };
        }
      }
    } catch (err2) {}
    return {
      best: memory.best,
      skinProgress: memory.skinProgress,
      bgm: memory.bgm !== false,
      displayName: memory.displayName || ''
    };
  }

  function save(data) {
    memory = normalize(data) || { best: 0, skinProgress: 0, bgm: true, displayName: '' };
    persist();
  }

  function resetMemory() {
    memory = { best: 0, skinProgress: 0, bgm: true, displayName: '' };
  }

  return {
    KEY: KEY,
    load: load,
    save: save,
    resetMemory: resetMemory
  };
});
