'use strict';

const config = require('./config.json');
const math = require('./js/math.js');
const platform = require('./js/platform.js');
const storageLib = require('./js/storage.js');
const sessionLib = require('./js/session.js');
const skyLib = require('./js/sky.js');

const view = platform.createView();
const query = platform.queryAll();
const seedQuery = query.seed || '';
const rng = math.mulberry32(seedQuery ? math.hashString(String(seedQuery)) : (Date.now() >>> 0));
const storage = storageLib.createStorage(platform, config.storageKey);
const timed = parseInt(query.t, 10);
if (timed > 0 && timed < 600) config.sessionSeconds = timed;
const shotMode = query.shot && !platform.isWechat();
if (shotMode) config.hitStopFrames = 50;

function detectLowEnd() {
  try {
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      const s = wx.getSystemInfoSync();
      if (typeof s.benchmarkLevel === 'number' && s.benchmarkLevel >= 0 && s.benchmarkLevel < 18) return true;
    }
  } catch (e) {}
  return view.dpr <= 1 && view.w * view.h < 280000;
}

const session = sessionLib.createSession({
  config: config,
  w: view.w,
  h: view.h,
  rng: rng,
  storage: storage,
  quality: { low: detectLowEnd() }
});
const sky = skyLib.createSky(view.w, view.h, rng);

platform.enableShare(function () {
  return sessionLib.sharePayload(session);
});

platform.bindInput(view, {
  down: function (x, y) {
    const act = sessionLib.pointerDown(session, x, y);
    if (act === 'share') platform.share(sessionLib.sharePayload(session));
  },
  move: function (x, y) {
    sessionLib.pointerMove(session, x, y);
  },
  up: function () {
    sessionLib.pointerUp(session);
  }
});

if (typeof window !== 'undefined') {
  window.__xinggui = { session: session, view: view };
}

if (shotMode) {
  setTimeout(function () {
    const taps = sessionLib.scriptGlowShot(session);
    let i = 0;
    function poke() {
      if (i >= taps.length) return;
      const p = taps[i];
      if (i === 0) sessionLib.pointerDown(session, p.x, p.y);
      else sessionLib.pointerMove(session, p.x, p.y);
      i += 1;
      if (i >= taps.length) sessionLib.pointerUp(session);
      else setTimeout(poke, 160);
    }
    poke();
  }, 420);
}

const STEP = 1 / 60;
let acc = 0;

platform.loop(function (dt, time) {
  sessionLib.resize(session, view.w, view.h);
  acc += dt;
  if (acc > 0.1) acc = 0.1;
  while (acc >= STEP) {
    sessionLib.step(session, STEP);
    skyLib.updateSky(sky, STEP, view.w);
    acc -= STEP;
  }

  const ctx = view.ctx;
  platform.applyViewTransform(ctx, view);
  ctx.clearRect(0, 0, view.w, view.h);
  sessionLib.draw(session, ctx, sky, view, time);
});
