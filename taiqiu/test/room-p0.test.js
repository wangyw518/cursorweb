'use strict';

/**
 * P0 friend-battle room contract:
 *   aim writes only aim (never balls)
 *   authoritative shot clock (default 20s)
 *   state/shot extras: nicknames, stars, foulCode, deadlineAt
 *   reject not-your-turn / stale-seq with authoritative state
 */
var assert = require('assert');
var storeMod = require('../js/roomStore');
var roomApi = require('../js/roomApi');
var cloudFn = require('../cloudfunctions/taiqiuRoom/index');

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

function rackBalls() {
  return [
    { id: 'cue', n: 0, nx: 0.5, ny: 0.78, pocketed: false },
    { id: 'b1', n: 1, nx: 0.5, ny: 0.32, pocketed: false },
    { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
  ];
}

check('create/join issue deadlineAt, nicknames, turnOpenId, stars', function () {
  var store = storeMod.createStore({ now: function () { return 1e12; } });
  var made = store.create({
    openId: 'host-open',
    nick: '房主甲',
    balls: rackBalls()
  });
  assert.strictEqual(made.ok, true);
  assert.strictEqual(made.deadlineAt, 1e12 + 20 * 1000);
  assert.strictEqual(made.state.shotClockSec, 20);
  assert.strictEqual(made.state.deadlineAt, made.deadlineAt);
  assert.strictEqual(made.state.turnOpenId, 'host-open');
  assert.strictEqual(made.state.nicknames.host, '房主甲');
  assert.strictEqual(made.state.stars.host, 0);
  assert.strictEqual(made.state.winnerOpenId, null);

  var joined = store.join({
    roomId: made.roomId,
    openId: 'guest-open',
    nick: '客座乙'
  });
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.deadlineAt, 1e12 + 20 * 1000);
  assert.strictEqual(joined.state.nicknames.guest, '客座乙');
  assert.strictEqual(joined.state.guestOpenId, 'guest-open');
  assert.strictEqual(joined.state.turnOpenId, 'host-open');
});

check('aim writes dirty aim and never mutates balls[]', function () {
  var store = storeMod.createStore({ now: function () { return 5000; } });
  var made = store.create({
    openId: 'h',
    balls: rackBalls()
  });
  store.join({ roomId: made.roomId, openId: 'g', nick: 'G' });
  var before = JSON.stringify(made.state.balls);
  var first = store.aim(made.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 1.25,
    power: 0.4,
    aimLine: [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.2 }],
    balls: [{ id: 'b1', n: 1, nx: 0.11, ny: 0.11, pocketed: true }],
    ballsSnapshot: [{ id: 'b9', n: 9, nx: 0.01, ny: 0.01, pocketed: true }]
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.state.aim.angle, 1.25);
  assert.strictEqual(first.state.aim.power, 0.4);
  assert.deepStrictEqual(first.state.aim.aimLine, [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.2 }]);
  assert.strictEqual(first.state.aim.updatedAt, 5000);
  assert.strictEqual(JSON.stringify(first.state.balls), before);
  assert.strictEqual(first.state.balls[1].nx, 0.5);
  assert.strictEqual(first.state.balls[1].pocketed, false);

  var second = store.aim(made.roomId, {
    openId: 'h',
    shotSeq: 0,
    angle: 0.2,
    power: 0.9
  });
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.state.aim.angle, 0.2);
  assert.strictEqual(second.state.aim.power, 0.9);
  assert.deepStrictEqual(second.state.aim.aimLine, [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.2 }]);
  assert.strictEqual(JSON.stringify(second.state.balls), before);

  var polled = store.state(made.roomId);
  assert.strictEqual(polled.state.aim.angle, 0.2);
  assert.strictEqual(JSON.stringify(polled.state.balls), before);
  assert.strictEqual(polled.aim.power, 0.9);
});

check('aim / shot reject not-your-turn and stale-seq with authoritative state', function () {
  var store = storeMod.createStore();
  var made = store.create({ openId: 'h', balls: rackBalls() });
  store.join({ roomId: made.roomId, openId: 'g' });
  store.aim(made.roomId, { openId: 'h', shotSeq: 1, angle: 0.5, power: 0.3 });

  var guestAim = store.aim(made.roomId, { openId: 'g', shotSeq: 1, angle: 9, power: 1 });
  assert.strictEqual(guestAim.ok, false);
  assert.strictEqual(guestAim.reason, 'not-your-turn');
  assert.ok(guestAim.state);
  assert.strictEqual(guestAim.state.turnOpenId, 'h');
  assert.strictEqual(guestAim.state.aim.angle, 0.5);
  assert.strictEqual(guestAim.state.balls[1].nx, 0.5);

  var staleAim = store.aim(made.roomId, { openId: 'h', shotSeq: 9, angle: 1, power: 1 });
  assert.strictEqual(staleAim.ok, false);
  assert.strictEqual(staleAim.reason, 'stale-seq');
  assert.strictEqual(staleAim.state.shotSeq, 0);

  var guestShot = store.shot(made.roomId, {
    openId: 'g',
    shotSeq: 1,
    reason: 'miss',
    balls: [{ id: 'b1', n: 1, nx: 0.9, ny: 0.9, pocketed: false }]
  });
  assert.strictEqual(guestShot.ok, false);
  assert.strictEqual(guestShot.reason, 'not-your-turn');
  assert.strictEqual(guestShot.state.turn, 0);
  assert.strictEqual(guestShot.state.balls[1].nx, 0.5);

  var skipShot = store.shot(made.roomId, {
    openId: 'h',
    shotSeq: 3,
    reason: 'miss',
    balls: []
  });
  assert.strictEqual(skipShot.ok, false);
  assert.strictEqual(skipShot.reason, 'stale-seq');
  assert.strictEqual(skipShot.state.shotSeq, 0);
});

check('shot success refreshes deadlineAt and echoes extras', function () {
  var t = 10000;
  var store = storeMod.createStore({ now: function () { return t; } });
  var made = store.create({ openId: 'h', nick: 'H' });
  store.join({ roomId: made.roomId, openId: 'g', nick: 'G' });
  var firstDeadline = store.state(made.roomId).deadlineAt;
  t = 15000;
  var miss = store.shot(made.roomId, {
    openId: 'h',
    shotSeq: 1,
    reason: 'scratch',
    stars: { host: 0, guest: 0 },
    pocketScore: 0,
    zoneBonus: 0,
    balls: rackBalls()
  });
  assert.strictEqual(miss.ok, true);
  assert.strictEqual(miss.state.foulCode, 'scratch');
  assert.strictEqual(miss.state.foulHint, '白球入袋');
  assert.strictEqual(miss.state.turnOpenId, 'g');
  assert.strictEqual(miss.state.phase, 'Aim');
  assert.strictEqual(miss.deadlineAt, 15000 + 20 * 1000);
  assert.ok(miss.deadlineAt > firstDeadline);
  assert.strictEqual(miss.state.aim, null);
  assert.strictEqual(miss.state.nicknames.host, 'H');
});

check('timeout without shot switches turn, does not rack, increments shotSeq', function () {
  var t = 0;
  var store = storeMod.createStore({ now: function () { return t; } });
  var opening = rackBalls();
  var made = store.create({ openId: 'h', balls: opening, shotClockSec: 20 });
  store.join({ roomId: made.roomId, openId: 'g' });
  store.aim(made.roomId, { openId: 'h', shotSeq: 1, angle: 0.7, power: 0.5 });
  var frozen = JSON.stringify(store.state(made.roomId).state.balls);

  t = 20 * 1000;
  var polled = store.state(made.roomId);
  assert.strictEqual(polled.ok, true);
  assert.strictEqual(polled.state.foulCode, 'shotClock');
  assert.strictEqual(polled.state.foulHint, '超时未击球');
  assert.strictEqual(polled.state.turn, 1);
  assert.strictEqual(polled.state.turnOpenId, 'g');
  assert.strictEqual(polled.state.shotSeq, 1);
  assert.strictEqual(polled.state.phase, 'Aim');
  assert.strictEqual(polled.state.aim, null);
  assert.strictEqual(JSON.stringify(polled.state.balls), frozen);
  assert.strictEqual(polled.state.balls[1].nx, 0.5);
  assert.strictEqual(polled.state.balls[2].n, 9);
  assert.strictEqual(polled.deadlineAt, t + 20 * 1000);

  var lateHost = store.shot(made.roomId, {
    openId: 'h',
    shotSeq: 2,
    reason: 'miss',
    balls: [{ id: 'b1', n: 1, nx: 0.01, ny: 0.01, pocketed: false }]
  });
  assert.strictEqual(lateHost.ok, false);
  assert.strictEqual(lateHost.reason, 'not-your-turn');
  assert.strictEqual(JSON.stringify(lateHost.state.balls), frozen);

  var guestShot = store.shot(made.roomId, {
    openId: 'g',
    shotSeq: 2,
    reason: 'miss',
    balls: [
      { id: 'cue', n: 0, nx: 0.4, ny: 0.7, pocketed: false },
      { id: 'b1', n: 1, nx: 0.5, ny: 0.32, pocketed: false },
      { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
    ]
  });
  assert.strictEqual(guestShot.ok, true);
  assert.strictEqual(guestShot.state.turnOpenId, 'h');
  assert.strictEqual(guestShot.state.balls[0].nx, 0.4);
});

check('nine sets winnerOpenId; LocalMockRoom aim matches store', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create({ openId: 'h', nick: 'Host' });
  mock.join({ roomId: made.roomId, openId: 'g', nick: 'Guest' });
  var aimed = mock.aim({
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    angle: -0.4,
    power: 0.55
  });
  assert.strictEqual(aimed.ok, true);
  assert.strictEqual(aimed.state.aim.power, 0.55);
  var win = mock.shot({
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    reason: 'nine',
    events: [{ type: 'nine', legal: true }]
  });
  assert.strictEqual(win.state.matchOver, true);
  assert.strictEqual(win.state.winner, 0);
  assert.strictEqual(win.state.winnerOpenId, 'h');
  assert.strictEqual(win.state.deadlineAt, null);
});

check('cloud function taiqiuRoom dispatches the same aim/timeout contract', function () {
  var isolated = cloudFn._createStore({ now: function () { return 0; } });
  var made = isolated.dispatch('create', { openId: 'h', nick: '云房主', balls: rackBalls() });
  isolated.dispatch('join', { roomId: made.roomId, openId: 'g', nick: '云客' });
  var aimed = isolated.dispatch('aim', {
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    angle: 0.3,
    power: 0.6,
    balls: [{ id: 'b1', n: 1, nx: 0, ny: 0, pocketed: true }]
  });
  assert.strictEqual(aimed.ok, true);
  assert.strictEqual(aimed.state.balls[1].nx, 0.5);
  assert.strictEqual(aimed.state.nicknames.host, '云房主');
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('room p0 tests passed');
