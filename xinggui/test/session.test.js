'use strict';

const assert = require('assert');
const sessionLib = require('../js/session.js');
const cfg = require('../config.json');
const math = require('../js/math.js');

function memStore() {
  let best = 0;
  return {
    getBest: function () { return best; },
    setBest: function (n) { if (n > best) best = n; return best; }
  };
}

function liveStar(id, x, y) {
  return {
    id: id, x: x, y: y, vx: 0, vy: 0, angle: 0, turn: 0,
    r: 6, color: '#E8F2FF', twinkle: 0, twinkleSpeed: 1,
    selected: false, selIndex: -1, dead: false, born: 1, pulse: 0
  };
}

function make() {
  return sessionLib.createSession({
    config: cfg,
    w: 390,
    h: 844,
    rng: math.mulberry32(7),
    storage: memStore()
  });
}

exports.titleTapStartsPlay = function () {
  const s = make();
  assert.strictEqual(s.phase, 'title');
  sessionLib.pointerDown(s, 200, 400);
  assert.strictEqual(s.phase, 'play');
};

exports.closeSquareLoopScoresAndClears = function () {
  const s = make();
  sessionLib.startPlay(s);
  s.stars = [
    liveStar(1, 140, 300),
    liveStar(2, 200, 300),
    liveStar(3, 200, 360),
    liveStar(4, 140, 360),
    liveStar(5, 170, 330)
  ];
  s.nextId = 6;
  sessionLib.pointerDown(s, 140, 300);
  sessionLib.pointerMove(s, 200, 300);
  sessionLib.pointerMove(s, 200, 360);
  sessionLib.pointerMove(s, 140, 360);
  sessionLib.pointerMove(s, 142, 302);
  sessionLib.pointerUp(s);
  assert.ok(s.score > 0, 'loop should score');
  assert.strictEqual(s.loops, 1);
  assert.strictEqual(s.combo, 1);
  assert.strictEqual(s.trail.ids.length, 0);
  const inner = s.stars.filter(function (st) { return st.id === 5 && !st.dead; });
  assert.strictEqual(inner.length, 0, 'enclosed star should clear');
};

exports.timerEndsSession = function () {
  const s = make();
  sessionLib.startPlay(s);
  s.timeLeft = 0.01;
  sessionLib.step(s, 1 / 60);
  assert.strictEqual(s.phase, 'settle');
  assert.strictEqual(s.settle.reason, 'time');
};

exports.stretchedTrailBreaks = function () {
  const s = make();
  sessionLib.startPlay(s);
  s.stars = [liveStar(1, 80, 300), liveStar(2, 140, 300)];
  sessionLib.pointerDown(s, 80, 300);
  sessionLib.pointerMove(s, 140, 300);
  s.stars[1].x = 80 + s.w * cfg.linkMaxRatio + 40;
  sessionLib.step(s, 1 / 60);
  assert.strictEqual(s.phase, 'settle');
  assert.strictEqual(s.settle.reason, 'break');
};

exports.undoLastAndDoubleTapClear = function () {
  const s = make();
  sessionLib.startPlay(s);
  s.stars = [liveStar(1, 80, 300), liveStar(2, 140, 300), liveStar(3, 200, 300)];
  sessionLib.pointerDown(s, 80, 300);
  sessionLib.pointerMove(s, 140, 300);
  sessionLib.pointerUp(s);
  assert.strictEqual(s.trail.ids.length, 2);
  sessionLib.pointerDown(s, 140, 300);
  sessionLib.pointerUp(s);
  assert.strictEqual(s.trail.ids.length, 1);
  s.clock = 1;
  sessionLib.pointerDown(s, 20, 20);
  s.clock = 1.2;
  sessionLib.pointerDown(s, 22, 24);
  assert.strictEqual(s.trail.ids.length, 0);
};

exports.replayFromSettle = function () {
  const s = make();
  sessionLib.startPlay(s);
  sessionLib.endSession(s, 'time');
  const y = s.h * 0.64 + 26;
  const act = sessionLib.pointerDown(s, s.w / 2, y);
  assert.strictEqual(act, 'replay');
  assert.strictEqual(s.phase, 'play');
  assert.strictEqual(s.score, 0);
};
