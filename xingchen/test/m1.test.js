'use strict';

var assert = require('assert');

var config = require('../js/config.json');
var cells = require('../js/cells');
var score = require('../js/score');
var table = require('../js/table');
var hud = require('../js/hud');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var stopDetect = require('../js/stopDetect');

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

function freshSession() {
  storage.resetMemory();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storage.KEY);
  } catch (err) {}
  return sessionMod.create(viewport(), config);
}

function tickUntilStopped(session, maxSteps) {
  var i;
  for (i = 0; i < (maxSteps || 400); i++) {
    sessionMod.update(session, config.fixedDt);
    if (
      session.phase === 'scored' ||
      session.phase === 'settle' ||
      session.phase === 'between'
    ) return session.award;
  }
  return session.award;
}

function epicCell(session) {
  var i;
  for (i = 0; i < session.cells.length; i++) {
    if (session.cells[i].rarity === 'epic') return session.cells[i];
  }
  return session.cells[0];
}

function bronzeCell(session) {
  var i;
  for (i = 0; i < session.cells.length; i++) {
    if (session.cells[i].rarity === 'bronze') return session.cells[i];
  }
  return session.cells[session.cells.length - 1];
}

check('display name is 奇境弹球', function () {
  assert.strictEqual(config.displayName, '奇境弹球');
});

check('grid pick uses the cell under the ball center', function () {
  var board = {
    bounds: { x: 0, y: 0, w: 200, h: 240 }
  };
  var grid = cells.create(board, { gridCols: 5, gridRows: 6 });
  assert.ok(grid.length === 30);
  var epic = grid.filter(function (c) { return c.rarity === 'epic'; })[0];
  var hit = cells.pick(grid, epic.cx, epic.cy);
  assert.strictEqual(hit.cell.rarity, 'epic');
  var award = score.fromCell(hit.cell, config);
  assert.strictEqual(award.score, 180);
  assert.strictEqual(award.name, '星谕');

  var miss = cells.pick(grid, -20, -20);
  assert.strictEqual(miss.cell, null);
  assert.strictEqual(score.fromCell(null, config).miss, true);
});

check('rarity scores are 20 / 50 / 100 / 180', function () {
  assert.strictEqual(config.rarities.bronze.score, 20);
  assert.strictEqual(config.rarities.silver.score, 50);
  assert.strictEqual(config.rarities.gold.score, 100);
  assert.strictEqual(config.rarities.epic.score, 180);
});

check('OOB (center past bounds) scores 0 immediately and beats stop detect', function () {
  var session = freshSession();
  var b = session.table.bounds;
  assert.strictEqual(table.isOutOfBounds(b, b.x + 10, b.y + 10), false);
  assert.strictEqual(table.isOutOfBounds(b, b.x - 1, b.y + 10), true);

  sessionMod.debugPlace(session, b.x - 2, b.y + b.h * 0.5, 0, 0);
  sessionMod.update(session, config.fixedDt);
  assert.ok(session.award, 'OOB awards on the first flight tick');
  assert.strictEqual(session.award.oob, true);
  assert.strictEqual(session.award.score, 0);
  assert.strictEqual(session.stop.stopped, false);
});

check('stopped on an epic cell awards 180 and can write local best', function () {
  var session = freshSession();
  var cell = epicCell(session);
  session.shotsLeft = 0;
  sessionMod.debugPlace(session, cell.cx, cell.cy, 0, 0);
  var award = tickUntilStopped(session, 20);
  assert.ok(award);
  assert.strictEqual(award.rarity, 'epic');
  assert.strictEqual(award.score, 180);
  assert.ok(session.settle);
  assert.strictEqual(session.settle.isNew, true);
  assert.strictEqual(session.settle.won, true);
  assert.strictEqual(storage.load().best, 180);
});

check('settle shows gap to best when not a record; replay restores aim', function () {
  storage.resetMemory();
  storage.save({ best: 400, stamina: 30, crystals: 0, bestLevel: 1 });
  var session = sessionMod.create(viewport(), config);
  assert.strictEqual(session.best, 400);
  var cell = bronzeCell(session);
  session.shotsLeft = 0;
  sessionMod.debugPlace(session, cell.cx, cell.cy, 0, 0);
  tickUntilStopped(session, 20);
  assert.strictEqual(session.settle.score, 20);
  assert.strictEqual(session.settle.won, false);
  assert.strictEqual(session.settle.isNew, false);
  assert.strictEqual(session.settle.gap, 380);

  var i;
  for (i = 0; i < 30; i++) sessionMod.update(session, config.fixedDt);
  assert.strictEqual(session.phase, 'settle');

  var replay = hud.hitTest(
    session.ui,
    session.ui.settleScore.x,
    session.ui.replay.y + 10,
    'settle'
  );
  assert.strictEqual(replay, 'replay');
  sessionMod.handlePointerDown(
    session,
    session.ui.settleScore.x,
    session.ui.replay.y + 10
  );
  assert.strictEqual(session.phase, 'aim');
  assert.strictEqual(session.best, 400);
});

check('level is reach target within K shots', function () {
  assert.strictEqual(config.levels[0].shots, 5);
  assert.strictEqual(config.levels[0].target, 160);
  var session = freshSession();
  assert.strictEqual(session.shotsLeft, 5);
  assert.strictEqual(session.level.target, 160);
  var cell = bronzeCell(session);
  sessionMod.debugPlace(session, cell.cx, cell.cy, 0, 0);
  tickUntilStopped(session, 20);
  assert.strictEqual(session.levelScore, 20);
  assert.ok(session.phase === 'between' || session.phase === 'aim');
  assert.strictEqual(session.settle, null);
});

check('session has no timer field in the loop', function () {
  assert.ok(!Object.prototype.hasOwnProperty.call(config, 'sessionMs'));
  var session = freshSession();
  assert.strictEqual(session.timer, undefined);
  assert.strictEqual(session.remainingMs, undefined);
});

check('stop hold is 120ms before a table stop scores', function () {
  var session = freshSession();
  var cell = bronzeCell(session);
  sessionMod.debugPlace(session, cell.cx, cell.cy, 0, 0);
  sessionMod.update(session, 0.06);
  assert.strictEqual(session.phase, 'flight');
  assert.ok(session.stop.holdMs >= 60);
  assert.strictEqual(stopDetect.isStopped(session.stop), false);
  sessionMod.update(session, 0.06);
  assert.ok(
    session.phase === 'scored' ||
    session.phase === 'settle' ||
    session.phase === 'between'
  );
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m1 ok');
