function applySize(canvas, ctx, logical) {
  var dpr = logical.dpr;
  canvas.width = Math.floor(logical.w * dpr);
  canvas.height = Math.floor(logical.h * dpr);
  if (canvas.style) {
    canvas.style.width = logical.w + 'px';
    canvas.style.height = logical.h + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createWx() {
  var canvas = wx.createCanvas();
  var ctx = canvas.getContext('2d');
  var info = wx.getSystemInfoSync();
  var logical = {
    w: info.windowWidth,
    h: info.windowHeight,
    dpr: info.pixelRatio || 1
  };
  applySize(canvas, ctx, logical);

  var handlers = { tap: [], loop: null };

  wx.onTouchStart(function (res) {
    if (!res.touches || !res.touches.length) return;
    var t = res.touches[0];
    for (var i = 0; i < handlers.tap.length; i++) {
      handlers.tap[i]({ x: t.clientX, y: t.clientY });
    }
  });

  if (typeof wx.onWindowResize === 'function') {
    wx.onWindowResize(function () {
      var next = wx.getSystemInfoSync();
      logical.w = next.windowWidth;
      logical.h = next.windowHeight;
      logical.dpr = next.pixelRatio || 1;
      applySize(canvas, ctx, logical);
    });
  }

  return {
    canvas: canvas,
    ctx: ctx,
    logical: logical,
    now: function () {
      return Date.now();
    },
    onTap: function (fn) {
      handlers.tap.push(fn);
    },
    loop: function (fn) {
      var last = Date.now();
      function frame() {
        var t = Date.now();
        var dt = (t - last) / 1000;
        last = t;
        fn(dt);
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(frame);
        } else {
          setTimeout(frame, 16);
        }
      }
      frame();
    }
  };
}

function createBrowser() {
  var canvas = document.getElementById('game') || document.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }
  var ctx = canvas.getContext('2d');
  var logical = { w: 0, h: 0, dpr: 1 };

  function resize() {
    logical.w = window.innerWidth;
    logical.h = window.innerHeight;
    logical.dpr = window.devicePixelRatio || 1;
    applySize(canvas, ctx, logical);
  }
  resize();
  window.addEventListener('resize', resize);

  var taps = [];
  function emit(x, y) {
    for (var i = 0; i < taps.length; i++) taps[i]({ x: x, y: y });
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var rect = canvas.getBoundingClientRect();
    emit(ev.clientX - rect.left, ev.clientY - rect.top);
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.repeat) return;
    if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyJ') {
      ev.preventDefault();
      emit(logical.w * 0.25, logical.h * 0.5);
    } else if (ev.code === 'ShiftRight' || ev.code === 'ShiftLeft' || ev.code === 'ArrowRight' || ev.code === 'KeyK') {
      ev.preventDefault();
      emit(logical.w * 0.75, logical.h * 0.5);
    } else if (ev.code === 'Enter' || ev.code === 'KeyR') {
      emit(logical.w * 0.5, logical.h * 0.78);
    }
  });

  return {
    canvas: canvas,
    ctx: ctx,
    logical: logical,
    now: function () {
      return performance.now();
    },
    onTap: function (fn) {
      taps.push(fn);
    },
    loop: function (fn) {
      var last = performance.now();
      function frame(t) {
        var dt = (t - last) / 1000;
        last = t;
        fn(dt);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  };
}

function createHeadless() {
  var logical = { w: 375, h: 667, dpr: 1 };
  return {
    canvas: null,
    ctx: null,
    logical: logical,
    now: function () {
      return 0;
    },
    onTap: function () {},
    loop: function () {}
  };
}

function create() {
  if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') return createWx();
  if (typeof document !== 'undefined') return createBrowser();
  return createHeadless();
}

module.exports = { create: create, createHeadless: createHeadless };
