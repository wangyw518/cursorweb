/**
 * 晚一步 M0 — WeChat native mini-game entry.
 * Cold-starts into the runner. No lobby.
 */

var config = require('./js/config.json');
var { createSession, restartSession } = require('./js/session');
var { createRunner } = require('./js/runner');
var hud = require('./js/hud');
var { installShareHandlers } = require('./js/share');

function getWx() {
  return typeof wx !== 'undefined' ? wx : null;
}

function systemInfo(api) {
  if (api && typeof api.getSystemInfoSync === 'function') {
    return api.getSystemInfoSync();
  }
  return {
    screenWidth: 667,
    screenHeight: 375,
    windowWidth: 667,
    windowHeight: 375,
    pixelRatio: 2
  };
}

function menuButtonRect(api) {
  try {
    if (api && typeof api.getMenuButtonBoundingClientRect === 'function') {
      return api.getMenuButtonBoundingClientRect();
    }
  } catch (err) {
    // simulator without capsule
  }
  return null;
}

function viewFromInfo(info, menu) {
  var width = info.windowWidth || info.screenWidth;
  var height = info.windowHeight || info.screenHeight;
  return {
    width: width,
    height: height,
    dpr: info.pixelRatio || 1,
    menu: menu,
    menuLeft: menu && typeof menu.left === 'number' ? menu.left : null
  };
}

function applyCanvasSize(canvas, view) {
  canvas.width = Math.round(view.width * view.dpr);
  canvas.height = Math.round(view.height * view.dpr);
}

function nowMs(api) {
  if (api && api.getPerformance && typeof api.getPerformance === 'function') {
    try {
      return api.getPerformance().now();
    } catch (err) {
      // fall through
    }
  }
  if (typeof Date.now === 'function') {
    return Date.now();
  }
  return 0;
}

function bindRaf(api) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame;
  }
  if (api && typeof api.requestAnimationFrame === 'function') {
    return api.requestAnimationFrame.bind(api);
  }
  return function (cb) {
    return setTimeout(function () {
      cb(nowMs(api));
    }, 16);
  };
}

function createGame() {
  var api = getWx();
  if (!api || typeof api.createCanvas !== 'function') {
    console.error('[晚一步] wx.createCanvas is required. Open minigame/ in 微信开发者工具.');
    return null;
  }

  installShareHandlers();

  var canvas = api.createCanvas();
  var ctx = canvas.getContext('2d');
  var info = systemInfo(api);
  var menu = menuButtonRect(api);
  var view = viewFromInfo(info, menu);
  applyCanvasSize(canvas, view);

  var session = createSession();
  var runner = createRunner({
    config: config,
    seed: session.seed,
    width: view.width,
    height: view.height
  });
  var layout = hud.computeLayout(view);
  var raf = bindRaf(api);
  var lastTs = null;
  var running = true;

  function refreshView() {
    info = systemInfo(api);
    menu = menuButtonRect(api);
    view = viewFromInfo(info, menu);
    applyCanvasSize(canvas, view);
    runner.resize(view.width, view.height);
    layout = hud.computeLayout(view);
  }

  function restart() {
    session = restartSession();
    runner.restart(session.seed);
    lastTs = null;
  }

  function onPointer(x, y) {
    var model = runner.getHudModel();
    var action = hud.hitTest(x, y, layout, model.dead);
    if (action === 'restart') {
      restart();
      return;
    }
    if (action === 'jump') {
      runner.jump();
      return;
    }
    if (action === 'dash') {
      runner.dash();
    }
  }

  function touchPoint(e) {
    var list = (e && (e.changedTouches || e.touches)) || [];
    var t = list[0];
    if (!t) {
      return null;
    }
    return {
      x: typeof t.clientX === 'number' ? t.clientX : t.x,
      y: typeof t.clientY === 'number' ? t.clientY : t.y
    };
  }

  if (typeof api.onTouchStart === 'function') {
    api.onTouchStart(function (e) {
      var p = touchPoint(e);
      if (p) {
        onPointer(p.x, p.y);
      }
    });
  }

  if (typeof api.onWindowResize === 'function') {
    api.onWindowResize(function () {
      refreshView();
    });
  }

  function loop(ts) {
    if (!running) {
      return;
    }
    if (lastTs == null) {
      lastTs = ts;
    }
    var frameDt = (ts - lastTs) / 1000;
    lastTs = ts;
    runner.updateFrame(frameDt);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    runner.render(ctx);
    var model = runner.getHudModel();
    model.menuLeft = view.menuLeft;
    hud.drawHud(ctx, model, layout, config);

    raf(loop);
  }

  raf(loop);
  return {
    runner: runner,
    restart: restart
  };
}

createGame();
