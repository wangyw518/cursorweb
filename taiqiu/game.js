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

  function loadShare() {
    if (typeof require === 'function') {
      try {
        return require('./js/share');
      } catch (err) {}
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g.TaiqiuShare;
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
    var share = loadShare();
    if (roomApi && config.room) {
      roomApi.configure(config.room);
    }
    if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.init) {
      try {
        var env = config.room && config.room.cloudEnv;
        if (env) wx.cloud.init({ env: env, traceUser: true });
        else wx.cloud.init({ traceUser: true });
      } catch (err) {}
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

    function roomIdFromOpts(opts) {
      if (share && share.roomIdFromLaunch) return share.roomIdFromLaunch(opts);
      if (!opts) return '';
      var q = opts.query != null ? opts.query : opts;
      if (typeof q === 'string') {
        var match = /(?:^|[?&])roomId=([^&]+)/i.exec(q);
        return match ? decodeURIComponent(match[1]) : '';
      }
      return (q && (q.roomId || q.roomid)) || '';
    }

    function maybeJoin(opts) {
      var id = roomIdFromOpts(opts);
      if (!id) return;
      if (session.room && session.room.roomId &&
          String(session.room.roomId).toUpperCase() === String(id).toUpperCase()) {
        sessionMod.pullRoom(session);
        return;
      }
      if (session.joiningRoomId &&
          String(session.joiningRoomId).toUpperCase() === String(id).toUpperCase()) {
        return;
      }
      sessionMod.joinRoom(session, id);
    }

    if (typeof wx.onLaunch === 'function') {
      wx.onLaunch(maybeJoin);
    }
    if (typeof wx.getLaunchOptionsSync === 'function') {
      try { maybeJoin(wx.getLaunchOptionsSync()); } catch (err) {}
    }
    if (typeof wx.getEnterOptionsSync === 'function') {
      try { maybeJoin(wx.getEnterOptionsSync()); } catch (err) {}
    }
    if (typeof wx.onShow === 'function') {
      wx.onShow(maybeJoin);
    }
    if (typeof wx.showShareMenu === 'function') {
      try { wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] }); } catch (err) {}
    }
    if (typeof wx.onShareAppMessage === 'function') {
      wx.onShareAppMessage(function () {
        var roomId = session.room && session.room.roomId;
        if (roomId && share && share.composeRoom) return share.composeRoom(roomId);
        if (share && share.compose) return share.compose(session.settle, session.best);
        return { title: '星券台球', query: roomId ? ('roomId=' + roomId) : '' };
      });
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
