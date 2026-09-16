'use strict';

(function () {
  const cache = Object.create(null);

  function normalize(path) {
    const parts = [];
    String(path).split('/').forEach(function (p) {
      if (!p || p === '.') return;
      if (p === '..') parts.pop();
      else parts.push(p);
    });
    return parts.join('/');
  }

  function resolve(from, spec) {
    const base = from.split('/').slice(0, -1).join('/');
    return normalize((base ? base + '/' : '') + spec);
  }

  function makeRequire(from) {
    return function require(spec) {
      const key = resolve(from, spec);
      if (!(key in cache)) throw new Error('Module not loaded: ' + key + ' (from ' + from + ')');
      return cache[key];
    };
  }

  async function load(path) {
    const url = '../' + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load ' + path);
    const text = await res.text();
    if (path.endsWith('.json')) {
      cache[path] = JSON.parse(text);
      return;
    }
    const module = { exports: {} };
    const fn = new Function('require', 'module', 'exports', text + '\n//# sourceURL=' + path);
    fn(makeRequire(path), module, module.exports);
    cache[path] = module.exports;
  }

  const files = [
    'config.json',
    'js/math.js',
    'js/trail.js',
    'js/score.js',
    'js/attract.js',
    'js/stars.js',
    'js/fx.js',
    'js/storage.js',
    'js/hud.js',
    'js/sky.js',
    'js/session.js',
    'js/platform.js',
    'game.js'
  ];

  files.reduce(function (p, f) {
    return p.then(function () { return load(f); });
  }, Promise.resolve()).catch(function (err) {
    document.body.innerHTML = '<pre style="color:#ffb0a4;padding:24px">' + err.stack + '</pre>';
    console.error(err);
  });
})();
