(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'xinggui.best';
  var memory = { best: 0 };

  function normalize(raw) {
    if (typeof raw === 'number' && isFinite(raw)) return { best: raw };
    if (raw && typeof raw.best === 'number' && isFinite(raw.best)) return { best: raw.best };
    return null;
  }

  function load() {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        var fromWx = normalize(wx.getStorageSync(KEY));
        if (fromWx) {
          memory = fromWx;
          return { best: fromWx.best };
        }
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(KEY);
        var parsed = raw ? normalize(JSON.parse(raw)) : null;
        if (parsed) {
          memory = parsed;
          return { best: parsed.best };
        }
      }
    } catch (err2) {}
    return { best: memory.best };
  }

  function save(data) {
    var next = normalize(data) || { best: 0 };
    memory = { best: next.best };
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

  function resetMemory() {
    memory = { best: 0 };
  }

  return {
    load: load,
    save: save,
    resetMemory: resetMemory
  };
});
