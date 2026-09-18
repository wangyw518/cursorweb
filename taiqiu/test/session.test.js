'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var balls = require('../js/balls');
var tiles = require('../js/tiles');
var cue = require('../js/cue');
var fsm = require('../js/fsm');
var ai = require('../js/ai');
var sfx = require('../js/sfx');
var hud = require('../js/hud');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures += 1;
    console.error('FAIL  ' + name);
    console.error('  ' + err.message);
  }
}

function viewport() {
  return {
    width: 375,
    height: 667,
    pixelRatio: 2,
    statusBarHeight: 20,
    safeTop: 20,
    safeBottom: 0
  };
}

function fresh() {
  storage.resetMemory();
  return sessionMod.create(viewport(), config, { skipSplash: true });
}

check('drag aim sets opposite fire direction and clamped power', function () {
  var stick = cue.create(config);
  var ball = { x: 100, y: 200, r: 8, pocketed: false };
  cue.beginDrag(stick, 100, 200 + 64, ball);
  assert.ok(stick.dragging);
  var shot = cue.endDrag(stick, config);
  assert.strictEqual(shot.fired, true);
  assert.ok(shot.vy < 0);
});

check('session starts in Aim with 9-ball order and top view', function () {
  var s = fresh();
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.viewMode, 'top');
  assert.strictEqual(s.aim3d, false);
  assert.strictEqual(s.balls.length, 10);
  assert.strictEqual(s.target.n, 1);
  assert.ok(s.tiles.length > 0);
});

check('aim3d stub does not leave top viewMode', function () {
  var s = fresh();
  var btn = s.ui.mode;
  var res = sessionMod.handlePointerDown(s, btn.x + 8, btn.y + 8);
  assert.strictEqual(res.kind, 'aim3d');
  assert.strictEqual(s.aim3d, true);
  assert.strictEqual(s.viewMode, 'top');
  sessionMod.toggleAim3d(s);
  assert.strictEqual(s.aim3d, false);
  assert.strictEqual(s.viewMode, 'top');
});

check('瞄准3D button sits clear of the top-right WeChat capsule', function () {
  var ui = hud.layout(viewport());
  assert.ok(ui.mode.x + ui.mode.w < viewport().width * 0.5);
  assert.ok(ui.mode.y > viewport().height * 0.55);
});

check('weak AI stub can fire a noisy shot at the object ball', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  var plan = ai.plan(cueBall, s.target, config, function () { return 0.5; });
  assert.ok(plan.ok);
  assert.ok(plan.vy < 0);
  var res = sessionMod.fireAi(s);
  assert.strictEqual(res.kind, 'ai');
  assert.strictEqual(s.phase, fsm.PHASE.Shot);
});

check('sfx helpers are silent-safe without an audio context', function () {
  sfx.reset();
  assert.doesNotThrow(function () {
    sfx.cue();
    sfx.ball();
    sfx.cushion();
    sfx.pocket();
  });
});

check('legal pocket applies 落点加成 星币 and stores best', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var settle = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: true,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(s.phase, fsm.PHASE.Settle);
  assert.ok(settle.legal);
  assert.strictEqual(settle.starApplied, true);
  assert.strictEqual(settle.pocketBonus, config.pocketBonus);
  assert.strictEqual(settle.landingBonus, 36);
  assert.strictEqual(settle.coins, config.pocketBonus + 36);
  assert.strictEqual(s.best, settle.coins);
  assert.strictEqual(storage.load().best, settle.coins);
});

check('foul skips StarZone even if cue sits on 恒星', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: true,
    x: s.tiles[0].x,
    y: s.tiles[0].y
  });
  var best = s.best;
  sessionMod.restart(s);
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var foul = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: false,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(foul.coins, 0);
  assert.strictEqual(foul.starApplied, false);
  assert.strictEqual(foul.foul, true);
  assert.strictEqual(s.best, best);
});

check('miss settles at 0 and does not beat best', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: true });
  var best = s.best;
  sessionMod.restart(s);
  var miss = sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(miss.coins, 0);
  assert.strictEqual(miss.legal, false);
  assert.strictEqual(s.best, best);
});

check('replay returns to Aim with a fresh 9-ball rack', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: true });
  var replay = s.ui.replay;
  sessionMod.handlePointerDown(s, replay.x + 10, replay.y + 10);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
});

check('firing enters Shot then can reach Settle through the GDD machine', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y + 8);
  sessionMod.handlePointerMove(s, cueBall.x, cueBall.y + 90);
  var up = sessionMod.handlePointerUp(s, cueBall.x, cueBall.y + 90);
  assert.strictEqual(up.kind, 'fire');
  assert.strictEqual(s.phase, fsm.PHASE.Shot);
  var i;
  for (i = 0; i < 720; i++) sessionMod.update(s, config.fixedDt);
  assert.strictEqual(s.phase, fsm.PHASE.Settle);
  assert.ok(s.settle);
  assert.strictEqual(s.settle.disclaimer, config.disclaimer);
});

check('splash shows disclaimer then start enters Aim', function () {
  storage.resetMemory();
  var s = sessionMod.create(viewport(), config);
  assert.strictEqual(s.phase, fsm.PHASE.Splash);
  sessionMod.handlePointerDown(s, 180, 320);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
});

check('share stub is score-only and has no cash copy', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: true });
  var btn = s.ui.share;
  var res = sessionMod.handlePointerDown(s, btn.x + 8, btn.y + 8);
  assert.strictEqual(res.kind, 'share');
  assert.ok(res.payload.text.indexOf('星币') !== -1);
  ['赚钱', '红包', '提现', '到账'].forEach(function (word) {
    assert.strictEqual(res.payload.text.indexOf(word), -1);
  });
});

check('zone pick under cue center uses StarZone names', function () {
  var s = fresh();
  var tile = s.tiles[3];
  var picked = tiles.pickAt(s.tiles, tile.x, tile.y);
  assert.ok(['新星', '流星', '彗星', '恒星'].indexOf(picked.label) !== -1);
});

function mockCtx() {
  var noop = function () {};
  var grad = { addColorStop: noop };
  var log = { strokes: [], fills: [], lineWidths: [] };
  return new Proxy({
    createLinearGradient: function () { return grad; },
    createRadialGradient: function () { return grad; },
    measureText: function () { return { width: 10 }; },
    _log: log
  }, {
    get: function (target, key) {
      if (key in target) return target[key];
      return noop;
    },
    set: function (target, key, value) {
      if (key === 'strokeStyle') target._log.strokes.push(value);
      if (key === 'fillStyle') target._log.fills.push(value);
      if (key === 'lineWidth') target._log.lineWidths.push(value);
      target[key] = value;
      return true;
    }
  });
}

check('legal StarZone land flash is a 1-frame tile stroke, not particles only', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var settle = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: true,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(settle.pocketBonus, config.pocketBonus);
  assert.strictEqual(settle.landingBonus, 36);
  assert.strictEqual(settle.coins, config.pocketBonus + 36);
  assert.ok(s.landFlash);
  assert.strictEqual(s.landFlash.tileId, zone.id);
  assert.strictEqual(s.landFlash.frames, 1);
  assert.ok(s.particles.length > 0);
  var ctx = mockCtx();
  sessionMod.render(s, ctx);
  assert.ok(ctx._log.strokes.indexOf('#FFFFFF') !== -1);
  assert.ok(ctx._log.fills.some(function (fill) {
    return String(fill).indexOf('255, 255, 255') !== -1;
  }));
  assert.ok(ctx._log.lineWidths.some(function (w) { return w >= 3; }));
  assert.strictEqual(s.landFlash, null);
  sessionMod.render(s, mockCtx());
  assert.strictEqual(s.landFlash, null);
});

check('foul skips land flash and zone bonus UI', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var foul = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: false,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(foul.foul, true);
  assert.strictEqual(foul.starApplied, false);
  assert.strictEqual(foul.landingBonus, 0);
  assert.strictEqual(s.landFlash, null);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('session tests passed');
