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

check('create / join / shot / state share one table snapshot', function () {
  net.resetMemory();
  var made = net.createRoom({
    balls: [{ id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false }]
  });
  assert.ok(made.ok);
  assert.strictEqual(made.role, 'host');
  assert.strictEqual(made.seat, 0);
  assert.strictEqual(made.roomId.length, 6);
  var joined = net.joinRoom(made.roomId);
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.role, 'guest');
  assert.strictEqual(joined.seat, 1);
  assert.strictEqual(joined.state.guestJoined, true);

  var shot = net.shot(made.roomId, {
    fromSeat: 0,
    token: made.token,
    reason: 'miss',
    balls: net.snapshotBalls([
      { id: 'cue', n: 0, x: 10, y: 20, pocketed: false },
      { id: 'b1', n: 1, x: 40, y: 50, pocketed: false }
    ])
  });
  assert.strictEqual(shot.ok, true);
  assert.strictEqual(shot.state.turn, 1);
  var pulled = net.state(made.roomId);
  assert.strictEqual(pulled.state.turn, 1);
  assert.strictEqual(pulled.state.balls[1].y, 50);
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
