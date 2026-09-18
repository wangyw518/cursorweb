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
var net = require('../js/net');
var share = require('../js/share');

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
  net.resetMemory();
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

check('legal pocket of 1-8 keeps the table, same turn, and applies 落点加成', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var two = balls.findByN(s.balls, 2);
  var twoX = two.x;
  var twoY = two.y;
  var award = sessionMod.debugForceStop(s, {
    pocketTarget: true,
    firstContact: true,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.ok(award.legal);
  assert.strictEqual(award.starApplied, true);
  assert.strictEqual(award.pocketBonus, config.pocketBonus);
  assert.strictEqual(award.landingBonus, 36);
  assert.strictEqual(award.coins, config.pocketBonus + 36);
  assert.strictEqual(s.best, award.coins);
  assert.strictEqual(storage.load().best, award.coins);
  assert.strictEqual(balls.findByN(s.balls, 1).pocketed, true);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 2);
  assert.strictEqual(s.turn, 0);
  assert.ok(Math.abs(two.x - twoX) < 0.01);
  assert.ok(Math.abs(two.y - twoY) < 0.01);
  assert.strictEqual(s.settle, null);
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

check('miss keeps positions, returns to Aim, and does not beat best', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: true });
  var best = s.best;
  sessionMod.newGame(s);
  var cueBall = balls.cueBall(s.balls);
  var one = balls.findByN(s.balls, 1);
  cueBall.x += 6;
  cueBall.y -= 4;
  var cueX = cueBall.x;
  var cueY = cueBall.y;
  var oneX = one.x;
  var oneY = one.y;
  var miss = sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(miss.coins, 0);
  assert.strictEqual(miss.legal, false);
  assert.strictEqual(s.best, best);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.settle, null);
  assert.ok(Math.abs(cueBall.x - cueX) < 0.01);
  assert.ok(Math.abs(cueBall.y - cueY) < 0.01);
  assert.ok(Math.abs(one.x - oneX) < 0.01);
  assert.ok(Math.abs(one.y - oneY) < 0.01);
  assert.strictEqual(one.pocketed, false);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
});

check('after a miss settle → next aim, object balls stay (not racked)', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  var moved = [];
  var i;
  for (i = 0; i < s.balls.length; i++) {
    var b = s.balls[i];
    if (b.id === 'cue') continue;
    b.x += 7 + i;
    b.y += 5 - i;
    moved.push({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed });
  }
  cueBall.x += 11;
  cueBall.y -= 6;
  var cueX = cueBall.x;
  var cueY = cueBall.y;
  sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.settle, null);
  assert.strictEqual(s.matchOver, false);
  for (i = 0; i < moved.length; i++) {
    var live = balls.findById(s.balls, moved[i].id);
    assert.ok(Math.abs(live.x - moved[i].x) < 0.01, live.id + ' x reracked');
    assert.ok(Math.abs(live.y - moved[i].y) < 0.01, live.id + ' y reracked');
    assert.strictEqual(live.pocketed, false);
  }
  assert.ok(Math.abs(cueBall.x - cueX) < 0.01);
  assert.ok(Math.abs(cueBall.y - cueY) < 0.01);
  var stillRack = s.balls.every(function (ball) {
    if (ball.id === 'cue') return true;
    var home = balls.rackPositions(s.table, ball.r).filter(function (p) { return p.n === ball.n; })[0];
    return home && Math.abs(ball.x - home.x) < 0.4 && Math.abs(ball.y - home.y) < 0.4;
  });
  assert.strictEqual(stillRack, false);
});

check('continueShot vs rack is gated: miss continues, 新开一局 / 再来一局 racks', function () {
  var s = fresh();
  var one = balls.findByN(s.balls, 1);
  one.x += 14;
  one.y += 9;
  var two = balls.findByN(s.balls, 2);
  two.x -= 6;
  var oneX = one.x;
  var twoX = two.x;
  sessionMod.continueShot(s);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - oneX) < 0.01);
  assert.ok(Math.abs(balls.findByN(s.balls, 2).x - twoX) < 0.01);

  var rerack = s.ui.rerack;
  assert.strictEqual(rerack.label, '新开一局');
  sessionMod.handlePointerDown(s, rerack.x + 8, rerack.y + 8);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
  assert.strictEqual(balls.remainingCount(s.balls), 9);
  var home1 = balls.rackPositions(s.table, one.r).filter(function (p) { return p.n === 1; })[0];
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - home1.x) < 0.4);
});

check('scratch respots cue in the kitchen and keeps object balls', function () {
  var s = fresh();
  var one = balls.findByN(s.balls, 1);
  var oneX = one.x;
  var oneY = one.y;
  sessionMod.debugForceStop(s, { scratch: true, firstContact: true });
  var cueBall = balls.cueBall(s.balls);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(cueBall.pocketed, false);
  assert.ok(Math.abs(cueBall.x - s.table.felt.cx) < 0.5);
  assert.ok(Math.abs(cueBall.y - s.table.kitchenY) < 0.5);
  assert.ok(Math.abs(one.x - oneX) < 0.01);
  assert.ok(Math.abs(one.y - oneY) < 0.01);
});

check('illegal 9 is spotted and does not win the match', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { pocketNine: true, firstContact: false });
  var nine = balls.findByN(s.balls, 9);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.matchOver, false);
  assert.strictEqual(nine.pocketed, false);
  assert.ok(nine.y < s.table.felt.cy);
});

check('legal pocket of 9 wins and only then opens 再来一局', function () {
  var s = fresh();
  var zone = s.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  var settle = sessionMod.debugForceStop(s, {
    pocketNine: true,
    firstContact: true,
    x: zone.x,
    y: zone.y
  });
  assert.strictEqual(s.phase, fsm.PHASE.Settle);
  assert.ok(settle.win);
  assert.strictEqual(settle.reason, 'legal');
  assert.strictEqual(s.winner, 0);
  assert.strictEqual(s.ui.replay.label, '再来一局');
  var replay = s.ui.replay;
  sessionMod.handlePointerDown(s, replay.x + 10, replay.y + 10);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
  assert.strictEqual(balls.remainingCount(s.balls), 9);
  assert.strictEqual(s.matchOver, false);
});

check('firing enters Shot then returns to Aim without reracking', function () {
  var s = fresh();
  var one = balls.findByN(s.balls, 1);
  var oneStart = { x: one.x, y: one.y };
  var cueBall = balls.cueBall(s.balls);
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y + 8);
  sessionMod.handlePointerMove(s, cueBall.x, cueBall.y + 90);
  var up = sessionMod.handlePointerUp(s, cueBall.x, cueBall.y + 90);
  assert.strictEqual(up.kind, 'fire');
  assert.strictEqual(s.phase, fsm.PHASE.Shot);
  var i;
  for (i = 0; i < 720; i++) sessionMod.update(s, config.fixedDt);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.settle, null);
  assert.strictEqual(s.matchOver, false);
  assert.strictEqual(s.balls.length, 10);
  var stillRack = s.balls.every(function (b) {
    if (b.id === 'cue') return true;
    var home = balls.rackPositions(s.table, b.r).filter(function (p) { return p.n === b.n; })[0];
    return home && Math.abs(b.x - home.x) < 0.4 && Math.abs(b.y - home.y) < 0.4 && !b.pocketed;
  });
  assert.ok(!stillRack || Math.hypot(cueBall.x - s.table.felt.cx, cueBall.y - s.table.kitchenY) > 2,
    'live shot must keep the in-play table, not silently start a new rack');
  assert.ok(one.pocketed || Math.hypot(one.x - oneStart.x, one.y - oneStart.y) > 0.2 ||
    Math.hypot(cueBall.x - s.table.felt.cx, cueBall.y - s.table.kitchenY) > 2);
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
  sessionMod.debugForceStop(s, { pocketNine: true, firstContact: true });
  var btn = s.ui.share;
  var res = sessionMod.handlePointerDown(s, btn.x + 8, btn.y + 8);
  assert.strictEqual(res.kind, 'share');
  assert.ok(res.payload.text.indexOf('星币') !== -1);
  ['赚钱', '红包', '提现', '到账'].forEach(function (word) {
    assert.strictEqual(res.payload.text.indexOf(word), -1);
  });
});

check('好友对局 stub shows a roomId share placeholder', function () {
  var s = fresh();
  assert.strictEqual(s.ui.room.label, '好友对局');
  assert.strictEqual(s.ui.roomSplash.label, '好友对局');
  var made = sessionMod.createRoom(s);
  assert.ok(made.roomId);
  assert.ok(s.roomPanel);
  assert.strictEqual(s.roomPanel.roomId, made.roomId);
  assert.ok(s.roomPanel.hint.indexOf('占位') !== -1);
  var invite = sessionMod.inviteRoom(s);
  assert.strictEqual(invite.kind, 'invite');
  assert.ok(invite.payload.query.indexOf('roomId=') === 0);
});

check('WeChat 2P room create / join / shareAppMessage roomId / sync after shot', function () {
  var host = fresh();
  var made = sessionMod.createRoom(host);
  assert.ok(made.roomId);
  assert.strictEqual(host.versus, true);
  assert.strictEqual(host.mySeat, 0);
  var invite = sessionMod.inviteRoom(host);
  assert.strictEqual(invite.kind, 'invite');
  assert.strictEqual(invite.payload.query, 'roomId=' + made.roomId);
  var composed = share.composeRoom(made.roomId);
  assert.strictEqual(composed.query, 'roomId=' + made.roomId);

  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  var joined = sessionMod.joinRoom(guest, made.roomId);
  assert.strictEqual(joined.kind, 'join');
  assert.strictEqual(guest.mySeat, 1);
  assert.strictEqual(guest.versus, true);
  sessionMod.pullRoom(host);

  var one = balls.findByN(host.balls, 1);
  var oneX = one.x;
  sessionMod.debugForceStop(host, { pocketTarget: false, firstContact: true });
  assert.strictEqual(host.turn, 1);
  assert.strictEqual(host.phase, fsm.PHASE.Aim);
  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.turn, 1);
  assert.ok(Math.abs(balls.findByN(guest.balls, 1).x - oneX) < 0.01);
  assert.strictEqual(sessionMod.canAim(host), false);
  assert.strictEqual(sessionMod.canAim(guest), true);
});

check('2P miss switches turn; legal 1-8 keeps the shooter', function () {
  var s = fresh();
  sessionMod.createRoom(s);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, s.room.roomId);
  sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: true });
  assert.strictEqual(s.turn, 0);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(s.turn, 1);
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
