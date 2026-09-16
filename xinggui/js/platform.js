'use strict';

function isWechat() {
  return typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
}

function createView() {
  if (isWechat()) {
    const sys = wx.getSystemInfoSync();
    const canvas = wx.createCanvas();
    const dpr = Math.min(sys.pixelRatio || 1, 2);
    const w = sys.windowWidth;
    const h = sys.windowHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    let safeTop = (sys.statusBarHeight || 20) + 10;
    let safeRight = 12;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.bottom) {
        safeTop = menu.bottom + 8;
        safeRight = Math.max(12, w - menu.left + 8);
      }
    } catch (e) {}
    return {
      canvas: canvas,
      ctx: ctx,
      dpr: dpr,
      w: w,
      h: h,
      safeTop: safeTop,
      safeRight: safeRight,
      wechat: true
    };
  }

  const canvas = document.getElementById('game') || document.createElement('canvas');
  if (!canvas.parentNode && typeof document !== 'undefined') document.body.appendChild(canvas);
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const view = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    dpr: dpr,
    w: 390,
    h: 844,
    safeTop: 28,
    safeRight: 16,
    wechat: false
  };
  resizeBrowser(view);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () { resizeBrowser(view); });
  }
  return view;
}

function resizeBrowser(view) {
  const maxW = Math.min(window.innerWidth, 430);
  const maxH = window.innerHeight;
  const aspect = 390 / 844;
  let w = maxW;
  let h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }
  if (window.innerWidth < 480) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  view.w = w;
  view.h = h;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.canvas.width = Math.round(w * view.dpr);
  view.canvas.height = Math.round(h * view.dpr);
  view.canvas.style.width = w + 'px';
  view.canvas.style.height = h + 'px';
}

function bindInput(view, handlers) {
  if (view.wechat) {
    wx.onTouchStart(function (e) { emit(e, handlers.down); });
    wx.onTouchMove(function (e) { emit(e, handlers.move); });
    wx.onTouchEnd(function (e) { emitEnd(e, handlers.up); });
    wx.onTouchCancel(function (e) { emitEnd(e, handlers.up); });
    return;
  }
  const el = view.canvas;
  const pos = function (ev) {
    const r = el.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (view.w / r.width),
      y: (ev.clientY - r.top) * (view.h / r.height)
    };
  };
  el.addEventListener('pointerdown', function (ev) {
    el.setPointerCapture && el.setPointerCapture(ev.pointerId);
    const p = pos(ev);
    handlers.down(p.x, p.y);
    ev.preventDefault();
  });
  el.addEventListener('pointermove', function (ev) {
    if (ev.buttons || ev.pointerType === 'touch') {
      const p = pos(ev);
      handlers.move(p.x, p.y);
    }
    ev.preventDefault();
  });
  el.addEventListener('pointerup', function (ev) {
    const p = pos(ev);
    handlers.up(p.x, p.y);
    ev.preventDefault();
  });
}

function emit(e, fn) {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t || !fn) return;
  fn(t.clientX, t.clientY);
}

function emitEnd(e, fn) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (!fn) return;
  if (!t) { fn(0, 0); return; }
  fn(t.clientX, t.clientY);
}

function loop(onFrame) {
  let last = now();
  function frame(t) {
    const ts = typeof t === 'number' ? t : now();
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    onFrame(dt, ts / 1000);
    raf(frame);
  }
  raf(frame);
}

function raf(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return setTimeout(function () { fn(now()); }, 16);
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function getStorage(key) {
  try {
    if (isWechat() && wx.getStorageSync) {
      const v = wx.getStorageSync(key);
      return v === '' ? null : v;
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    }
  } catch (e) {}
  return null;
}

function setStorage(key, value) {
  try {
    if (isWechat() && wx.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {}
}

function enableShare(builder) {
  if (!isWechat()) {
    enableShare._builder = builder;
    return;
  }
  try {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    wx.onShareAppMessage(function () { return builder(); });
    if (wx.onShareTimeline) wx.onShareTimeline(function () { return builder(); });
  } catch (e) {}
}

function share(payload) {
  const data = payload || (enableShare._builder && enableShare._builder());
  if (!data) return;
  if (isWechat()) {
    try {
      if (wx.shareAppMessage) {
        wx.shareAppMessage(data);
        return;
      }
    } catch (e) {}
    try { wx.showToast({ title: '点击右上角分享', icon: 'none' }); } catch (err) {}
    return;
  }
  const line = (data.title || '星轨') + (data.query ? '\n' + data.query : '');
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(line).catch(function () {});
  }
}

function querySeed() {
  if (isWechat() && wx.getLaunchOptionsSync) {
    try {
      const q = (wx.getLaunchOptionsSync() || {}).query || {};
      return q.seed || '';
    } catch (e) { return ''; }
  }
  if (typeof location !== 'undefined') {
    try { return new URLSearchParams(location.search).get('seed') || ''; } catch (e) { return ''; }
  }
  return '';
}

function applyViewTransform(ctx, view) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

module.exports = {
  isWechat: isWechat,
  createView: createView,
  bindInput: bindInput,
  loop: loop,
  getStorage: getStorage,
  setStorage: setStorage,
  enableShare: enableShare,
  share: share,
  querySeed: querySeed,
  applyViewTransform: applyViewTransform,
  now: now
};
