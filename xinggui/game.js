'use strict';

const config = require('./config.json');
const math = require('./js/math.js');
const platform = require('./js/platform.js');
const storageLib = require('./js/storage.js');
const sessionLib = require('./js/session.js');
const skyLib = require('./js/sky.js');

const view = platform.createView();
const seedQuery = platform.querySeed();
const rng = math.mulberry32(seedQuery ? math.hashString(String(seedQuery)) : (Date.now() >>> 0));
const storage = storageLib.createStorage(platform, config.storageKey);

const session = sessionLib.createSession({
  config: config,
  w: view.w,
  h: view.h,
  rng: rng,
  storage: storage
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
