'use strict';

var assert = require('assert');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomServer = require('../dev/room-server');
var net = require('../js/net');

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

check('create / join / shot / state keep the table and switch on miss', function () {
  var store = storeMod.createStore();
  var made = store.create({
    balls: [{ id: 'b1', n: 1, nx: 0.5, ny: 0.4, pocketed: false }]
  });
  assert.ok(made.ok);
  assert.strictEqual(made.seat, 0);
  var joined = store.join(made.roomId);
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.seat, 1);
  assert.strictEqual(joined.state.guestJoined, true);

  var afterMiss = store.shot(made.roomId, {
    fromSeat: 0,
    token: made.token,
    reason: 'miss',
    balls: [{ id: 'b1', n: 1, nx: 0.42, ny: 0.51, pocketed: false }]
  });
  assert.strictEqual(afterMiss.ok, true);
  assert.strictEqual(afterMiss.state.turn, 1);
  assert.strictEqual(afterMiss.state.balls[0].nx, 0.42);
  assert.strictEqual(afterMiss.state.matchOver, false);

  var polled = store.state(made.roomId);
  assert.strictEqual(polled.state.seq, afterMiss.state.seq);
  assert.strictEqual(polled.state.turn, 1);
});

check('legal pocket continues the same seat; foul switches; 9 wins', function () {
  var store = storeMod.createStore();
  var made = store.create();
  store.join(made.roomId);
  var legal = store.shot(made.roomId, { fromSeat: 0, token: made.token, reason: 'legal', balls: [] });
  assert.strictEqual(legal.state.turn, 0);
  var foul = store.shot(made.roomId, { fromSeat: 0, token: made.token, reason: 'scratch', balls: [] });
  assert.strictEqual(foul.state.turn, 1);
  var win = store.shot(made.roomId, { fromSeat: 1, token: storeMod.tokenFor(made.roomId, 1), reason: 'nine', balls: [] });
  assert.strictEqual(win.state.matchOver, true);
  assert.strictEqual(win.state.winner, 1);
  assert.strictEqual(win.state.phase, 'Settle');
});

check('shot from the waiting seat is rejected', function () {
  var store = storeMod.createStore();
  var made = store.create();
  store.join(made.roomId);
  var bad = store.shot(made.roomId, {
    fromSeat: 1,
    token: storeMod.tokenFor(made.roomId, 1),
    reason: 'miss',
    balls: []
  });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'not-your-turn');
  assert.strictEqual(store.state(made.roomId).state.turn, 0);
});

check('new-game reracks via API and resets turn', function () {
  var store = storeMod.createStore();
  var made = store.create();
  store.shot(made.roomId, { fromSeat: 0, token: made.token, reason: 'miss' });
  var fresh = store.shot(made.roomId, {
    fromSeat: 1,
    token: storeMod.tokenFor(made.roomId, 1),
    reason: 'new-game',
    balls: [{ id: 'b1', n: 1, nx: 0.5, ny: 0.28, pocketed: false }],
    scores: [0, 0]
  });
  assert.strictEqual(fresh.ok, true);
  assert.strictEqual(fresh.state.turn, 0);
  assert.strictEqual(fresh.state.matchOver, false);
  assert.strictEqual(fresh.state.targetN, 1);
});

check('felt-normalized snapshot survives apply on a different table', function () {
  net.resetMemory();
  var snap = net.snapshotBalls(
    [{ id: 'cue', n: 0, x: 120, y: 80, pocketed: false }],
    { x: 100, y: 60, w: 200, h: 400 }
  );
  assert.ok(Math.abs(snap[0].nx - 0.1) < 1e-9);
  var dest = [{ id: 'cue', n: 0, x: 0, y: 0, pocketed: true }];
  net.applyBalls(dest, snap, { x: 10, y: 20, w: 100, h: 200 });
  assert.ok(Math.abs(dest[0].x - 20) < 1e-9);
  assert.ok(Math.abs(dest[0].y - 30) < 1e-9);
  assert.strictEqual(dest[0].pocketed, false);
});

function httpJson(port, method, path, body, cb) {
  var data = body ? JSON.stringify(body) : '';
  var req = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: path,
    method: method,
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(data)
    }
  }, function (res) {
    var chunks = '';
    res.on('data', function (c) { chunks += c; });
    res.on('end', function () { cb(null, JSON.parse(chunks || '{}')); });
  });
  req.on('error', cb);
  if (data) req.write(data);
  req.end();
}

function runHttp(cb) {
  var started = roomServer.listen(0, function (addr) {
    var port = addr.port;
    httpJson(port, 'POST', '/api/rooms', {}, function (err, created) {
      if (err) return cb(err);
      httpJson(port, 'POST', '/api/rooms/' + created.roomId + '/join', {}, function (err2, joined) {
        if (err2) return cb(err2);
        httpJson(port, 'POST', '/api/rooms/' + created.roomId + '/shot', {
          fromSeat: 0,
          token: created.token,
          reason: 'miss',
          balls: [{ id: 'b1', n: 1, nx: 0.3, ny: 0.6, pocketed: false }]
        }, function (err3, shot) {
          if (err3) return cb(err3);
          httpJson(port, 'GET', '/api/rooms/' + created.roomId, null, function (err4, state) {
            started.server.close();
            if (err4) return cb(err4);
            cb(null, { created: created, joined: joined, shot: shot, state: state });
          });
        });
      });
    });
  });
}

var httpPending = 1;
runHttp(function (err, result) {
  httpPending = 0;
  try {
    if (err) throw err;
    assert.ok(result.created.ok);
    assert.strictEqual(result.joined.seat, 1);
    assert.strictEqual(result.shot.state.turn, 1);
    assert.strictEqual(result.shot.state.balls[0].nx, 0.3);
    assert.strictEqual(result.state.state.turn, 1);
    console.log('ok  HTTP create / join / shot / state poll');
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP create / join / shot / state poll');
    console.error('  ' + fail.message);
  }
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('room api tests passed');
});

if (failures && !httpPending) {
  console.error(failures + ' failed');
  process.exit(1);
}
