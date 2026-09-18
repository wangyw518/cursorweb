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
var roomApi = require('../js/roomApi');
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

check('near-rail pull maps on-screen drag length to full power', function () {
  var bounds = { x: 0, y: 0, w: 375, h: 667, pad: 4 };
  var edge = cue.create(config);
  cue.beginDrag(edge, 40, 4, { x: 40, y: 24, r: 8, pocketed: false }, bounds);
  assert.ok(edge.power >= 0.99, 'pull to the screen edge must reach max power, got ' + edge.power);
  var center = cue.create(config);
  cue.beginDrag(center, 180, 240, { x: 180, y: 200, r: 8, pocketed: false }, bounds);
  assert.ok(center.power < 0.45, 'a short center pull should stay partial, got ' + center.power);
  var far = cue.create(config);
  cue.beginDrag(far, 180, 200 + config.dragMaxPx, { x: 180, y: 200, r: 8, pocketed: false }, bounds);
  assert.ok(far.power >= 0.99);
});

function hashObjectBalls(list) {
  return balls.hashObjectBalls(list);
}

function placeCueOnRail(session, side) {
  var cueBall = balls.cueBall(session.balls);
  var f = session.table.felt;
  var r = cueBall.r + 1.6;
  if (side === 'top') {
    cueBall.x = f.cx;
    cueBall.y = f.y + r;
  } else if (side === 'bot') {
    cueBall.x = f.cx;
    cueBall.y = f.y + f.h - r;
  } else if (side === 'left') {
    cueBall.x = f.x + r;
    cueBall.y = f.cy - f.h * 0.2;
  } else {
    cueBall.x = f.x + f.w - r;
    cueBall.y = f.cy - f.h * 0.2;
  }
  cueBall.vx = 0;
  cueBall.vy = 0;
  return cueBall;
}

check('Aim/pull for 60 frames leaves object-ball x/y hash unchanged', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  var i;
  for (i = 0; i < s.balls.length; i++) {
    if (s.balls[i].id === 'cue') continue;
    s.balls[i].vx = 80 + i * 3;
    s.balls[i].vy = -40 - i;
  }
  cueBall.vx = 50;
  cueBall.vy = -20;
  var hash0 = hashObjectBalls(s.balls);
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y + 6);
  for (i = 0; i < 60; i++) {
    sessionMod.handlePointerMove(s, cueBall.x + Math.sin(i / 4) * 18, cueBall.y + 28 + (i % 12));
    sessionMod.update(s, config.fixedDt);
  }
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.cue.dragging, true);
  assert.strictEqual(hashObjectBalls(s.balls), hash0);
  for (i = 0; i < s.balls.length; i++) {
    if (s.balls[i].id === 'cue') continue;
    assert.strictEqual(s.balls[i].vx, 0);
    assert.strictEqual(s.balls[i].vy, 0);
  }
});

check('2P Aim poll does not overwrite object balls unless shotSeq advanced', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  var one = balls.findByN(host.balls, 1);
  var oneX = one.x;
  var hash0 = hashObjectBalls(host.balls);
  var fake = [];
  var i;
  for (i = 0; i < host.balls.length; i++) {
    var b = host.balls[i];
    fake.push({
      id: b.id,
      n: b.n,
      x: b.x + (b.id === 'cue' ? 0 : 40),
      y: b.y + (b.id === 'cue' ? 0 : 25),
      pocketed: false
    });
  }
  host.room.lastSeq = 3;
  sessionMod.ingestState(host, {
    state: {
      roomId: host.room.roomId,
      shotSeq: 3,
      phase: 'Aim',
      turn: 0,
      ballsSnapshot: fake
    }
  });
  assert.strictEqual(hashObjectBalls(host.balls), hash0);
  sessionMod.ingestState(host, {
    state: {
      roomId: host.room.roomId,
      shotSeq: 4,
      phase: 'Aim',
      turn: 1,
      ballsSnapshot: fake
    }
  });
  assert.ok(Math.abs(balls.findByN(host.balls, 1).x - (oneX + 40)) < 0.01);
  assert.strictEqual(host.turn, 1);
});

check('cue at mid of each rail can reach power === 1 on-screen', function () {
  var s = fresh();
  var vp = viewport();
  var sides = ['top', 'bot', 'left', 'right'];
  var i;
  for (i = 0; i < sides.length; i++) {
    var side = sides[i];
    var cueBall = placeCueOnRail(s, side);
    // Practical max drag: 36px inside the viewport (WeChat bezel / home bar).
    var edgeX = cueBall.x;
    var edgeY = cueBall.y;
    if (side === 'top') edgeY = 36;
    if (side === 'bot') edgeY = vp.height - 36;
    if (side === 'left') edgeX = 36;
    if (side === 'right') edgeX = vp.width - 36;
    var stick = cue.create(config);
    cue.beginDrag(stick, cueBall.x, cueBall.y, cueBall, vp);
    cue.moveDrag(stick, edgeX, edgeY, cueBall, vp);
    assert.ok(stick.power === 1, side + ' rail power ' + stick.power + ' !== 1');
    assert.ok(stick.full, side + ' full flag');
    sessionMod.handlePointerDown(s, cueBall.x, cueBall.y);
    sessionMod.handlePointerMove(s, edgeX, edgeY);
    assert.ok(s.cue.power === 1, side + ' session power ' + s.cue.power + ' !== 1');
    assert.ok(s.cue.full, side + ' session full');
    var dx = cueBall.x - edgeX;
    var dy = cueBall.y - edgeY;
    assert.ok(Math.abs(Math.atan2(dy, dx) - s.cue.angle) < 1e-6, side + ' aim angle');
    cue.cancelDrag(s.cue);
  }
});

check('full charge flashes HUD 满 without needing the stick off-screen', function () {
  var s = fresh();
  var cueBall = placeCueOnRail(s, 'top');
  sessionMod.handlePointerDown(s, cueBall.x, cueBall.y);
  sessionMod.handlePointerMove(s, cueBall.x, 36);
  assert.strictEqual(s.cue.power, 1);
  assert.ok(s.powerFlash > 0);
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

check('simple AI plans at the target center with distance power and a low foul rate', function () {
  var s = fresh();
  var cueBall = balls.cueBall(s.balls);
  var plan = ai.plan(cueBall, s.target, config, function () { return 0.5; });
  assert.ok(plan.ok);
  assert.ok(plan.vy < 0);
  assert.ok(ai.powerForDistance(60) < ai.powerForDistance(240));
  assert.strictEqual(plan.power, ai.powerForDistance(plan.dist, config));
  assert.ok(ai.thinkDelay(function () { return 0; }, config) >= 0.6);
  assert.ok(ai.thinkDelay(function () { return 1; }, config) <= 1.2);
  assert.ok(ai.FOUL_RATE > 0 && ai.FOUL_RATE < 0.2);
  var fouls = 0;
  var i;
  for (i = 0; i < 240; i++) {
    if (ai.plan(cueBall, s.target, config, Math.random).foulAttempt) fouls += 1;
  }
  assert.ok(fouls > 0, 'foul rate must not be zero');
  assert.ok(fouls < 80, 'foul rate must stay low, got ' + fouls);
  var res = sessionMod.fireAi(s);
  assert.strictEqual(res.kind, 'ai');
  assert.strictEqual(s.phase, fsm.PHASE.Shot);
  assert.ok(typeof cue.strike === 'function');
});

check('Cue.strike is the only fire write on the cue ball', function () {
  var ball = { x: 40, y: 80, vx: 0, vy: 0, r: 8, pocketed: false };
  var other = { x: 90, y: 40, vx: 1, vy: 1 };
  var struck = cue.strike(ball, { ax: 0, ay: -1, power: 0.5 }, config);
  assert.strictEqual(struck.fired, true);
  assert.ok(ball.vy < 0);
  assert.strictEqual(other.x, 90);
  assert.strictEqual(other.vx, 1);
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

check('splash shows disclaimer then default tap starts local AI', function () {
  storage.resetMemory();
  var s = sessionMod.create(viewport(), config);
  assert.strictEqual(s.phase, fsm.PHASE.Splash);
  assert.strictEqual(s.ui.aiSplash.label, '人机对战');
  assert.strictEqual(s.ui.practice.label, '练习模式');
  assert.strictEqual(hud.hitTest(s.ui, s.ui.aiSplash.x + 8, s.ui.aiSplash.y + 8, 'Splash', s), 'start-ai');
  assert.strictEqual(hud.hitTest(s.ui, s.ui.practice.x + 8, s.ui.practice.y + 8, 'Splash', s), 'practice');
  var res = sessionMod.handlePointerDown(s, 180, 320);
  assert.strictEqual(res.kind, 'start-ai');
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.mode, 'ai');
  assert.strictEqual(s.room, null);
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

check('好友对局 creates a room and shareAppMessage carries roomId', function () {
  var s = fresh();
  assert.strictEqual(s.ui.room.label, '好友对局');
  assert.strictEqual(s.ui.roomSplash.label, '好友对局');
  var made = sessionMod.createRoom(s);
  assert.ok(made.roomId);
  assert.ok(!made.stub);
  assert.strictEqual(s.role, 'host');
  assert.ok(s.roomPanel);
  assert.strictEqual(s.roomPanel.roomId, made.roomId);
  assert.ok(s.roomPanel.hint.indexOf('占位') === -1);
  assert.ok(s.roomPanel.hint.indexOf('同步') !== -1);
  assert.ok(s.roomPanel.hint.indexOf('roomId=') !== -1);
  var invite = sessionMod.inviteRoom(s);
  assert.strictEqual(invite.kind, 'invite');
  assert.ok(invite.payload.query.indexOf('roomId=') === 0);
  assert.ok(!invite.stub);
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

check('2P guest cannot aim on host turn; out-of-turn shot is rejected', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  sessionMod.pullRoom(host);
  assert.strictEqual(sessionMod.canAim(host), true);
  assert.strictEqual(sessionMod.canAim(guest), false);
  var before = roomApi.state(host.room.roomId);
  var denied = roomApi.shot(host.room.roomId, {
    shotSeq: 1,
    role: 'guest',
    token: guest.room.token,
    events: [{ type: 'miss' }],
    ballsSnapshot: []
  });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.reason, 'not-your-turn');
  assert.strictEqual(roomApi.state(host.room.roomId).state.shotSeq, before.state.shotSeq);
  var wait = sessionMod.handlePointerDown(guest, guest.balls[0].x, guest.balls[0].y);
  assert.strictEqual(wait.kind, 'wait-turn');
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

check('truncateName keeps 6 chars and ellipsizes', function () {
  assert.strictEqual(hud.truncateName('星券台球玩家'), '星券台球玩家');
  assert.strictEqual(hud.truncateName('星券台球玩家甲'), '星券台球玩家…');
  assert.strictEqual(hud.truncateName('HelloW'), 'HelloW');
  assert.strictEqual(hud.truncateName('HelloWorld'), 'HelloW…');
  assert.strictEqual(hud.seatFallback(0), '房主');
  assert.strictEqual(hud.seatFallback(1), '好友');
});

check('versus HUD names fall back to 房主/好友 and never P1/P2', function () {
  var s = fresh();
  sessionMod.createRoom(s);
  s.versus = true;
  s.names = ['星券台球玩家甲乙丙', 'Li'];
  assert.strictEqual(hud.nameOf(s, 0), '星券台球玩家…');
  assert.strictEqual(hud.nameOf(s, 1), 'Li');
  var dbg = sessionMod.getDebugState(s);
  assert.ok(dbg.names);
  assert.strictEqual(JSON.stringify(dbg).indexOf('P1'), -1);
});

check('aim timeout switches turn, keeps object balls, and banners', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  sessionMod.pullRoom(host);
  var one = balls.findByN(host.balls, 1);
  one.x += 15;
  var oneX = one.x;
  var due = Date.now() - 50;
  roomApi.aim(host.room.roomId, {
    fromSeat: 0,
    token: host.room.token,
    aimSeq: 1,
    kind: 'aim',
    aimAngle: -1.2,
    power: 0.2,
    deadlineAt: due
  });
  host.aimDeadlineAt = due;
  var res = sessionMod.timeoutAim(host);
  assert.ok(res);
  assert.strictEqual(res.kind, 'timeout');
  assert.strictEqual(host.turn, 1);
  assert.strictEqual(host.phase, fsm.PHASE.Aim);
  assert.ok(Math.abs(balls.findByN(host.balls, 1).x - oneX) < 0.01);
  assert.ok(host.banner && host.banner.kind === 'foul');
  assert.ok(host.banner.text.indexOf('超时') !== -1);
  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.turn, 1);
  assert.ok(Math.abs(balls.findByN(guest.balls, 1).x - oneX) < 0.01);
});

check('aim preview does not advance shotSeq', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  var before = roomApi.state(host.room.roomId);
  assert.strictEqual(before.state.shotSeq, 0);
  sessionMod.pushAim(host, { kind: 'charging', aimAngle: 0.75, power: 0.55, ax: Math.cos(0.75), ay: Math.sin(0.75) });
  var after = roomApi.state(host.room.roomId);
  assert.strictEqual(after.state.shotSeq, 0);
  assert.ok(after.state.aimSeq >= 1);
  assert.ok(after.state.aim);
  assert.ok(Math.abs(after.state.aim.aimAngle - 0.75) < 1e-6);
  sessionMod.pullRoom(guest);
  assert.ok(guest.remoteAim);
  assert.ok(Math.abs(guest.remoteAim.aimAngle - 0.75) < 1e-6);
});

check('guest sees win settle after host pockets 9', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  sessionMod.pullRoom(host);
  sessionMod.debugForceStop(host, { pocketNine: true, firstContact: true });
  assert.strictEqual(host.phase, fsm.PHASE.Settle);
  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.phase, fsm.PHASE.Settle);
  assert.ok(guest.settle && guest.settle.win);
  assert.ok(guest.settle.scores);
  assert.strictEqual(guest.winner, 0);
});

check('scratch and wrong-ball fouls show a banner', function () {
  var s = fresh();
  sessionMod.debugForceStop(s, { scratch: true, firstContact: true });
  assert.ok(s.banner);
  assert.strictEqual(s.banner.kind, 'foul');
  assert.ok(s.banner.text.indexOf('白球') !== -1);
  sessionMod.newGame(s);
  var foul = sessionMod.debugForceStop(s, { pocketTarget: true, firstContact: false });
  assert.strictEqual(foul.foul, true);
  assert.ok(s.banner && s.banner.text.indexOf('目标球') !== -1);
});

check('HUD 音乐 toggle persists and defaults on', function () {
  var s = fresh();
  assert.strictEqual(s.bgm, true);
  assert.ok(s.ui.bgm);
  var res = sessionMod.handlePointerDown(s, s.ui.bgm.x + 4, s.ui.bgm.y + 4);
  assert.strictEqual(res.kind, 'bgm');
  assert.strictEqual(s.bgm, false);
  assert.strictEqual(storage.load().bgm, false);
  sfx.setBgm(false);
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

check('local AI mode reuses 2P rules without opening a room', function () {
  var s = fresh();
  var started = sessionMod.startAi(s);
  assert.strictEqual(started.mode, 'ai');
  assert.strictEqual(s.mode, 'ai');
  assert.strictEqual(s.versus, true);
  assert.strictEqual(s.localAi, true);
  assert.strictEqual(s.room, null);
  assert.strictEqual(s.names[1], '简单AI');
  assert.strictEqual(hud.nameOf(s, 1), '简单AI');
  assert.strictEqual(hud.turnLabel(s), '轮到你出杆');
  assert.ok(s.aimDeadlineAt > Date.now() + 15000);
  assert.strictEqual(sessionMod.canAim(s), true);

  var one = balls.findByN(s.balls, 1);
  one.x += 12;
  var oneX = one.x;
  var oneY = one.y;
  sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(sessionMod.canAim(s), false);
  assert.strictEqual(hud.turnLabel(s), 'AI出杆中');
  assert.ok(s.aiThink >= 0.6 && s.aiThink <= 1.2);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - oneX) < 0.01);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).y - oneY) < 0.01);
  assert.ok(s.toast && (s.toast.text.indexOf('未进') !== -1 || s.toast.text.indexOf('换人') !== -1));

  var wait = sessionMod.handlePointerDown(s, balls.cueBall(s.balls).x, balls.cueBall(s.balls).y);
  assert.strictEqual(wait.kind, 'wait-turn');

  var left = s.aiThink;
  sessionMod.update(s, Math.max(0.01, left - 0.05));
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - oneX) < 0.01);
  sessionMod.update(s, 0.2);
  assert.strictEqual(s.phase, fsm.PHASE.Shot);
  assert.ok(Math.hypot(balls.cueBall(s.balls).vx, balls.cueBall(s.balls).vy) > 1);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - oneX) < 0.01, 'AI must not write object balls');
});

check('local AI settle is 你赢了/你输了 with both 星币 and no room', function () {
  var s = fresh();
  s.displayName = '星券玩家甲乙';
  sessionMod.startAi(s);
  var win = sessionMod.debugForceStop(s, { pocketNine: true, firstContact: true });
  assert.strictEqual(s.phase, fsm.PHASE.Settle);
  assert.strictEqual(win.versus, true);
  assert.strictEqual(win.outcome, 'win');
  assert.strictEqual(hud.settleOutcome(s, win), '你赢了');
  assert.ok(win.scores);
  assert.strictEqual(s.room, null);
  sessionMod.handlePointerDown(s, s.ui.replay.x + 8, s.ui.replay.y + 8);
  assert.strictEqual(s.mode, 'ai');
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.room, null);
  assert.strictEqual(s.scores[0], 0);

  sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(s.turn, 1);
  var lose = sessionMod.debugForceStop(s, { pocketNine: true, firstContact: true });
  assert.strictEqual(s.winner, 1);
  assert.strictEqual(lose.outcome, 'lose');
  assert.strictEqual(hud.settleOutcome(s, lose), '你输了');
  var back = sessionMod.handlePointerDown(s, s.ui.back.x + 8, s.ui.back.y + 8);
  assert.strictEqual(back.kind, 'back');
  assert.strictEqual(s.phase, fsm.PHASE.Splash);
});

check('practice mode has no clock, no turn switch, and no win headline', function () {
  var s = fresh();
  var started = sessionMod.startPractice(s);
  assert.strictEqual(started.mode, 'practice');
  assert.strictEqual(s.versus, false);
  assert.strictEqual(s.aimDeadlineAt, 0);
  assert.strictEqual(hud.turnLabel(s), '');
  sessionMod.debugForceStop(s, { pocketTarget: false, firstContact: true });
  assert.strictEqual(s.turn, 0);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.settle, null);
  var settle = sessionMod.debugForceStop(s, { pocketNine: true, firstContact: true });
  assert.strictEqual(s.phase, fsm.PHASE.Settle);
  assert.ok(settle.win);
  assert.strictEqual(hud.settleOutcome(s, settle), '本局星币');
  assert.ok((s.scores[0] || 0) >= settle.coins);
  sessionMod.handlePointerDown(s, s.ui.replay.x + 8, s.ui.replay.y + 8);
  assert.strictEqual(s.mode, 'practice');
  assert.strictEqual(s.scores[0], 0);
  assert.strictEqual(balls.lowestNumbered(s.balls).n, 1);
});

check('AI timeout is local, keeps object balls, and hands the table to 简单AI', function () {
  var s = fresh();
  sessionMod.startAi(s);
  var one = balls.findByN(s.balls, 1);
  one.x += 9;
  var oneX = one.x;
  s.aimDeadlineAt = Date.now() - 20;
  var res = sessionMod.timeoutAim(s);
  assert.strictEqual(res.kind, 'timeout');
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.phase, fsm.PHASE.Aim);
  assert.strictEqual(s.room, null);
  assert.ok(Math.abs(balls.findByN(s.balls, 1).x - oneX) < 0.01);
  assert.ok(s.banner && s.banner.kind === 'foul');
  assert.strictEqual(hud.turnLabel(s), 'AI出杆中');
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('session tests passed');
