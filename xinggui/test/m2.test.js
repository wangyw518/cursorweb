'use strict';

var assert = require('assert');
var config = require('../js/config.json');
var fx = require('../js/fx');
var sessionMod = require('../js/session');
var storage = require('../js/storage');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures++;
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

function star(id, x, y) {
  return {
    id: id,
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    tier: 1,
    phase: 0,
    radius: 6
  };
}

function withQuality(quality) {
  var copy = JSON.parse(JSON.stringify(config));
  copy.fxQuality = quality;
  return copy;
}

function closeSquare(session) {
  sessionMod.handlePointer(session, 120, 220);
  sessionMod.handlePointer(session, 190, 220);
  sessionMod.handlePointer(session, 190, 290);
  sessionMod.handlePointer(session, 120, 290);
  return sessionMod.handlePointer(session, 120, 220);
}

function loadSquare(session) {
  session.field.stars = [
    star(0, 120, 220),
    star(1, 190, 220),
    star(2, 190, 290),
    star(3, 120, 290),
    star(4, 155, 255)
  ];
}

function mockStrokeCtx() {
  var strokes = [];
  var fonts = [];
  var fillTexts = [];
  var strokeTexts = [];
  var fillRects = [];
  var ctx = {
    strokes: strokes,
    fonts: fonts,
    fillTexts: fillTexts,
    strokeTexts: strokeTexts,
    fillRects: fillRects,
    globalAlpha: 1,
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    strokeStyle: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    font: '',
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    arc: function () {},
    fill: function () {},
    setLineDash: function () {},
    translate: function () {},
    scale: function () {},
    createRadialGradient: function () {
      return { addColorStop: function () {} };
    },
    stroke: function () {
      strokes.push({
        style: String(ctx.strokeStyle),
        width: ctx.lineWidth,
        alpha: ctx.globalAlpha
      });
    },
    fillRect: function (x, y, w, h) {
      fillRects.push({
        x: x,
        y: y,
        w: w,
        h: h,
        style: String(ctx.fillStyle),
        alpha: ctx.globalAlpha
      });
    },
    fillText: function (text, x, y) {
      fonts.push(ctx.font);
      fillTexts.push({ text: text, x: x, y: y, font: ctx.font });
    },
    strokeText: function (text, x, y) {
      strokeTexts.push({ text: text, x: x, y: y, font: ctx.font, width: ctx.lineWidth });
    }
  };
  return ctx;
}

check('center spawnBurst emits 48-64 and respects cap', function () {
  var parts = fx.spawnBurst(10, 20, config, config.colors.scorePop);
  assert.ok(parts.length >= fx.CENTER_BURST_MIN, 'got ' + parts.length);
  assert.ok(parts.length <= fx.CENTER_BURST_MAX, 'got ' + parts.length);
  assert.ok(parts.length <= config.burstParticleCap);
  assert.ok(Math.abs(parts[0].maxLife - config.burstLifeMs / 1000) < 1e-6);
  var empty = fx.spawnBurst();
  assert.deepStrictEqual(empty, []);
  var capped = fx.spawnBurst(1, 2, config, config.colors.scorePop, { count: 400 });
  assert.strictEqual(capped.length, config.burstParticleCap);
});

check('per-vertex spawnBurst is 8-12', function () {
  var parts = fx.spawnBurst(0, 0, config, config.colors.pathHead, { kind: 'vertex' });
  assert.ok(parts.length >= fx.VERTEX_BURST_MIN, 'got ' + parts.length);
  assert.ok(parts.length <= fx.VERTEX_BURST_MAX, 'got ' + parts.length);
});

check('mid-tier halves particles but popup/flash helpers stay intact', function () {
  var mid = withQuality('mid');
  var center = fx.spawnBurst(0, 0, mid, mid.colors.scorePop);
  assert.ok(center.length >= Math.floor(fx.CENTER_BURST_MIN / 2));
  assert.ok(center.length <= Math.floor(fx.CENTER_BURST_MAX / 2));
  var vertex = fx.spawnBurst(0, 0, mid, mid.colors.pathHead, { kind: 'vertex' });
  assert.ok(vertex.length >= Math.floor(fx.VERTEX_BURST_MIN / 2));
  assert.ok(vertex.length <= Math.floor(fx.VERTEX_BURST_MAX / 2));
  var scoreStyle = fx.popupStyle({ kind: 'score' });
  assert.ok(scoreStyle.size >= 26 && scoreStyle.size <= 28);
  assert.strictEqual(fx.popupStyle({ kind: 'perfect' }).size, 20);
});

check('score popup is bold 26-28 with stroke; 完美/combo are ~20px', function () {
  var score = fx.popupStyle({ kind: 'score', text: '+120' });
  assert.strictEqual(score.weight, 'bold');
  assert.ok(score.size >= 26 && score.size <= 28);
  assert.strictEqual(score.stroke, true);
  assert.strictEqual(fx.popupStyle({ kind: 'perfect' }).size, 20);
  assert.strictEqual(fx.popupStyle({ kind: 'combo' }).size, 20);

  var ctx = mockStrokeCtx();
  fx.drawPopup(ctx, { text: '+120', life: 1, kind: 'score', hex: config.colors.scorePop }, config.colors);
  assert.ok(/bold 27px/.test(ctx.fillTexts[0].font));
  assert.strictEqual(ctx.strokeTexts.length, 1);
  fx.drawPopup(ctx, { text: '完美', life: 1, kind: 'perfect', hex: config.colors.perfect }, config.colors);
  assert.ok(/20px/.test(ctx.fillTexts[1].font));
  fx.drawPopup(ctx, { text: '×2', life: 1, kind: 'combo', hex: config.colors.combo }, config.colors);
  assert.ok(/20px/.test(ctx.fillTexts[2].font));
});

check('close path draw order thickens then flashes white', function () {
  var ctx = mockStrokeCtx();
  var ring = [
    { x: 120, y: 220 },
    { x: 190, y: 220 },
    { x: 190, y: 290 },
    { x: 120, y: 290 }
  ];
  fx.drawNeonPath(ctx, ring, config, { thicken: true, closed: true, whiteFlash: true });
  assert.ok(ctx.strokes.length >= 3);
  assert.ok(ctx.strokes[0].width >= 20, 'first pass should thicken');
  var whiteAt = -1;
  for (var i = 0; i < ctx.strokes.length; i++) {
    if (ctx.strokes[i].style.toUpperCase() === '#FFFFFF') {
      whiteAt = i;
      break;
    }
  }
  assert.ok(whiteAt > 0, 'white flash after thicken');
});

check('frozen juice colors', function () {
  assert.strictEqual(config.colors.path, '#A78BFA');
  assert.strictEqual(config.colors.pathHead, '#22D3EE');
  assert.strictEqual(config.colors.combo, '#F472B6');
  assert.strictEqual(config.colors.scorePop, '#FDE68A');
  assert.strictEqual(config.hitStopFrames, 3);
  assert.strictEqual(config.glowInnerR, 6);
  assert.strictEqual(config.glowOuterR, 14);
});

check('session close flashes before particles and keeps hit-stop', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), config, 1);
  loadSquare(session);
  var closed = closeSquare(session);
  assert.strictEqual(closed.kind, 'close');
  assert.ok(session.score > 0);
  assert.ok(session.closeFx);
  assert.ok(session.closeFx.flashFrames > 0);
  assert.ok(session.closeFx.pendingBurst);
  assert.strictEqual(session.particles.length, 0);
  assert.ok(session.flash > 0);
  assert.ok(session.pulse > 0);
  assert.ok(session.popups.length > 0);
  assert.strictEqual(session.popups[0].kind, 'score');
  assert.ok(session.hitStop > 0);

  sessionMod.update(session, config.fixedDt);
  assert.ok(session.closeFx.flashFrames > 0, 'flash still held through first tick');
  assert.strictEqual(session.particles.length, 0);
  assert.ok(session.hitStop > 0);

  sessionMod.update(session, config.fixedDt);
  assert.ok(!session.closeFx || !session.closeFx.pendingBurst);
  assert.ok(session.particles.length >= fx.CENTER_BURST_MIN);
  assert.ok(session.particles.length <= config.burstParticleCap);
});

check('mid-tier close never cuts flash or hit-stop', function () {
  storage.resetMemory();
  var session = sessionMod.create(viewport(), withQuality('mid'), 1);
  loadSquare(session);
  var closed = closeSquare(session);
  assert.strictEqual(closed.kind, 'close');
  assert.ok(session.flash > 0);
  assert.ok(session.hitStop > 0);
  assert.ok(session.closeFx && session.closeFx.flashFrames > 0);
  sessionMod.update(session, config.fixedDt);
  sessionMod.update(session, config.fixedDt);
  assert.ok(session.particles.length > 0);
  assert.ok(session.particles.length <= config.burstParticleCap);
});

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall m2 checks passed');
