/**
 * 星券台球 Taiqiu — WeChat native Canvas 2D mini-game.
 * Custom 2D billiard physics only. No Matter.js / Cocos / Unity.
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
    if (g.TaiqiuConfig) return g.TaiqiuConfig;
    throw new Error('[taiqiu] missing js/config.json');
  }

  function loadSession() {
    if (typeof require === 'function') {
      try {
        return require('./js/session');
      } catch (err) {}
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g.TaiqiuSession;
  }

  function loadRoomApi() {
    if (typeof require === 'function') {
      try {
        return require('./js/roomApi');
      } catch (err) {}
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g.TaiqiuRoomApi || g.TaiqiuNet;
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
    var roomApi = loadRoomApi();
    if (roomApi && config.room) {
      roomApi.configure(config.room);
    }
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
        steps += 1;
      }
      sessionMod.render(session, ctx);
      requestAnimationFrame(frame);
    }

    function point(ev) {
      var t = (ev.touches && ev.touches[0]) ||
        (ev.changedTouches && ev.changedTouches[0]);
      if (!t) return null;
      return { x: t.clientX, y: t.clientY };
    }

    wx.onTouchStart(function (ev) {
      var p = point(ev);
      if (p) sessionMod.handlePointerDown(session, p.x, p.y);
    });
    if (wx.onTouchMove) {
      wx.onTouchMove(function (ev) {
        var p = point(ev);
        if (p) sessionMod.handlePointerMove(session, p.x, p.y);
      });
    }
    if (wx.onTouchEnd) {
      wx.onTouchEnd(function (ev) {
        var p = point(ev);
        if (p) sessionMod.handlePointerUp(session, p.x, p.y);
        else sessionMod.handlePointerUp(session);
      });
    }
    if (wx.onTouchCancel) {
      wx.onTouchCancel(function () {
        sessionMod.handlePointerUp(session);
      });
    }
    if (wx.onWindowResize) {
      wx.onWindowResize(function () {
        viewport = getViewport();
        applyCanvasSize(canvas, ctx, viewport);
        sessionMod.resize(session, viewport);
      });
    }

    function parseQuery(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      var out = {};
      String(raw).split('&').forEach(function (part) {
        var kv = part.split('=');
        if (!kv[0]) return;
        var key = decodeURIComponent(kv[0]);
        var val = decodeURIComponent(kv[1] || '');
        out[key] = val;
      });
      return out;
    }

    function maybeJoin(opts) {
      var q = parseQuery(opts && (opts.query != null ? opts.query : opts));
      if (!q.roomId) return;
      if (session.room && session.room.roomId === q.roomId) {
        sessionMod.pullRoom(session);
        return;
      }
      sessionMod.joinRoom(session, q.roomId);
    }

    if (typeof wx.getLaunchOptionsSync === 'function') {
      try { maybeJoin(wx.getLaunchOptionsSync()); } catch (err) {}
    }
    if (typeof wx.onShow === 'function') {
      wx.onShow(maybeJoin);
    }

    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.__taiqiu = {
      session: session,
      sessionMod: sessionMod,
      canvas: canvas,
      config: config
    };

    requestAnimationFrame(frame);
  }

  if (typeof wx !== 'undefined' && wx.createCanvas) boot();
})();
