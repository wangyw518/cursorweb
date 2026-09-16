/**
 * 星轨 Xinggui — M0 entry.
 * WeChat native Canvas 2D. Pure client. No engine.
 */
(function () {
  'use strict';

  function loadConfig() {
    if (typeof require === 'function') {
      try {
        return require('./js/config.json');
      } catch (err) {}
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (g.XingguiConfig) return g.XingguiConfig;
    throw new Error('[xinggui] missing js/config.json');
  }

  function loadSession() {
    if (typeof require === 'function') {
      try {
        return require('./js/session');
      } catch (err) {}
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g.XingguiSession;
  }

  function getViewport() {
    var info = wx.getSystemInfoSync();
    var safe = info.safeArea || {};
    var width = info.windowWidth;
    var height = info.windowHeight;
    return {
      width: width,
      height: height,
      pixelRatio: info.pixelRatio || 1,
      statusBarHeight: info.statusBarHeight || 20,
      safeTop: safe.top || info.statusBarHeight || 20,
      safeBottom: height - (safe.bottom || height)
    };
  }

  function applyCanvasSize(canvas, ctx, viewport) {
    var pr = viewport.pixelRatio;
    canvas.width = Math.round(viewport.width * pr);
    canvas.height = Math.round(viewport.height * pr);
    if (canvas.style) {
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
    }
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
  }

  function boot() {
    var config = loadConfig();
    var sessionMod = loadSession();
    var canvas = wx.createCanvas();
    var ctx = canvas.getContext('2d');
    var viewport = getViewport();
    applyCanvasSize(canvas, ctx, viewport);

    var session = sessionMod.create(viewport, config);
    var acc = 0;
    var last = Date.now();
    var fixedDt = config.fixedDt;
    if (!(fixedDt > 0)) fixedDt = 1 / 60;

    function frame() {
      var now = Date.now();
      var elapsed = (now - last) / 1000;
      last = now;
      if (elapsed > 0.1) elapsed = 0.1;
      acc += elapsed;
      var steps = 0;
      while (acc >= fixedDt && steps < 5) {
        sessionMod.update(session, fixedDt);
        acc -= fixedDt;
        steps++;
      }
      sessionMod.render(session, ctx);
      requestAnimationFrame(frame);
    }

    wx.onTouchStart(function (ev) {
      var t = (ev.touches && ev.touches[0]) ||
        (ev.changedTouches && ev.changedTouches[0]);
      if (!t) return;
      sessionMod.handlePointer(session, t.clientX, t.clientY);
    });

    if (wx.onWindowResize) {
      wx.onWindowResize(function () {
        viewport = getViewport();
        applyCanvasSize(canvas, ctx, viewport);
        sessionMod.resize(session, viewport);
      });
    }

    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.__xinggui = {
      session: session,
      sessionMod: sessionMod,
      canvas: canvas,
      config: config
    };

    requestAnimationFrame(frame);
  }

  if (typeof wx !== 'undefined' && wx.createCanvas) boot();
})();
