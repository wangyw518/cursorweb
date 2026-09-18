'use strict';

var assert = require('assert');
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

check('createRoom / joinRoom / pushState / pullState share one table snapshot', function () {
  net.resetMemory();
  var made = net.createRoom();
  assert.ok(made.ok);
  assert.strictEqual(made.seat, 0);
  assert.strictEqual(made.roomId.length, 6);
  var joined = net.joinRoom(made.roomId);
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.seat, 1);
  assert.strictEqual(joined.state.guestJoined, true);

  var balls = [
    { id: 'cue', n: 0, x: 10, y: 20, vx: 0, vy: 0, pocketed: false },
    { id: 'b1', n: 1, x: 40, y: 50, vx: 1, vy: 0, pocketed: false }
  ];
  net.pushState(made.roomId, {
    balls: net.snapshotBalls(balls),
    turn: 1,
    scores: [8, 0]
  });
  var pulled = net.pullState(made.roomId);
  assert.strictEqual(pulled.turn, 1);
  assert.strictEqual(pulled.scores[0], 8);
  var guestBalls = [
    { id: 'cue', n: 0, x: 0, y: 0, vx: 0, vy: 0, pocketed: false },
    { id: 'b1', n: 1, x: 0, y: 0, vx: 0, vy: 0, pocketed: false }
  ];
  net.applyBalls(guestBalls, pulled.balls);
  assert.strictEqual(guestBalls[0].x, 10);
  assert.strictEqual(guestBalls[1].y, 50);
});

check('missing room join fails closed', function () {
  net.resetMemory();
  var miss = net.joinRoom('ZZZZZZ');
  assert.strictEqual(miss.ok, false);
});

check('room invite query carries roomId for shareAppMessage', function () {
  var payload = share.composeRoom('AB12CD');
  assert.strictEqual(payload.kind, 'room');
  assert.strictEqual(payload.query, 'roomId=AB12CD');
  assert.ok(payload.text.indexOf('星券台球') !== -1);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('net tests passed');
