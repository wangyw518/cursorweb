'use strict';

var assert = require('assert');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomServer = require('../dev/room-server');
var roomApi = require('../js/roomApi');
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

check('LocalMockRoom create / join returns host then guest and one table', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create({ ballsSnapshot: [{ id: 'b1', n: 1, nx: 0.5, ny: 0.4, pocketed: false }] });
  assert.strictEqual(made.ok, true);
  assert.strictEqual(made.role, 'host');
  assert.ok(made.roomId);
  assert.strictEqual(made.state.turnRole, 'host');
  assert.strictEqual(made.state.shotSeq, 0);

  var joined = mock.join({ roomId: made.roomId });
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.role, 'guest');
  assert.strictEqual(joined.state.guestJoined, true);
  assert.strictEqual(joined.state.roomId, made.roomId);

  var snap = mock.state(made.roomId);
  assert.strictEqual(snap.ok, true);
  assert.strictEqual(snap.state.turn, 0);
  assert.strictEqual(snap.state.ballsSnapshot[0].n, 1);
});

check('LocalMockRoom miss switches turn', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create();
  mock.join(made.roomId);
  var afterMiss = mock.shot({
    roomId: made.roomId,
    shotSeq: 1,
    aimAngle: 1.2,
    power: 0.6,
    role: 'host',
    token: made.token,
    events: [{ type: 'miss' }],
    ballsSnapshot: [{ id: 'b1', n: 1, nx: 0.42, ny: 0.51, pocketed: false }]
  });
  assert.strictEqual(afterMiss.ok, true);
  assert.strictEqual(afterMiss.state.turn, 1);
  assert.strictEqual(afterMiss.state.turnRole, 'guest');
  assert.strictEqual(afterMiss.state.ballsSnapshot[0].nx, 0.42);
  assert.strictEqual(afterMiss.state.matchOver, false);
});

check('LocalMockRoom legal pocket continues the same seat', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create();
  mock.join(made.roomId);
  var legal = mock.shot({
    roomId: made.roomId,
    shotSeq: 1,
    aimAngle: -1.5,
    power: 0.8,
    role: 'host',
    token: made.token,
    events: [{ type: 'pocket', n: 1, legal: true }, { type: 'legal' }],
    ballsSnapshot: [{ id: 'b1', n: 1, nx: 0.2, ny: 0.2, pocketed: true }]
  });
  assert.strictEqual(legal.ok, true);
  assert.strictEqual(legal.state.turn, 0);
  assert.strictEqual(legal.state.turnRole, 'host');
  assert.strictEqual(legal.state.matchOver, false);
});

check('LocalMockRoom rejects a shot that is not your turn', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create();
  var joined = mock.join(made.roomId);
  var bad = mock.shot({
    roomId: made.roomId,
    shotSeq: 1,
    aimAngle: 0,
    power: 0.4,
    role: 'guest',
    token: joined.token,
    events: [{ type: 'miss' }],
    ballsSnapshot: []
  });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'not-your-turn');
  assert.strictEqual(mock.state(made.roomId).state.turn, 0);
  assert.strictEqual(mock.state(made.roomId).state.shotSeq, 0);
});

check('LocalMockRoom storage lets a second client join the same roomId', function () {
  var bag = {};
  var prev = global.wx;
  global.wx = {
    getStorageSync: function (k) {
      return bag[k] ? JSON.parse(bag[k]) : '';
    },
    setStorageSync: function (k, v) {
      bag[k] = JSON.stringify(v);
    },
    removeStorageSync: function (k) {
      delete bag[k];
    }
  };
  try {
    var pageA = new roomApi.LocalMockRoom({ persist: true });
    var made = pageA.create({ balls: [{ id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false }] });
    var pageB = new roomApi.LocalMockRoom({ persist: true });
    var joined = pageB.join(made.roomId);
    assert.strictEqual(joined.ok, true);
    assert.strictEqual(joined.role, 'guest');
    pageA.shot({
      roomId: made.roomId,
      shotSeq: 1,
      role: 'host',
      token: made.token,
      events: [{ type: 'miss' }],
      ballsSnapshot: [{ id: 'cue', n: 0, nx: 0.4, ny: 0.7, pocketed: false }]
    });
    var pulled = pageB.state(made.roomId);
    assert.strictEqual(pulled.state.turnRole, 'guest');
    assert.strictEqual(pulled.state.ballsSnapshot[0].nx, 0.4);
  } finally {
    global.wx = prev;
  }
});

check('roomApi module create/join/shot/state use LocalMockRoom when roomApiBase is empty', function () {
  roomApi.resetMemory();
  assert.strictEqual(roomApi.configOf().roomApiBase, '');
  assert.strictEqual(roomApi.usingHttp(), false);
  var made = roomApi.create();
  assert.strictEqual(made.role, 'host');
  var joined = roomApi.join(made.roomId);
  assert.strictEqual(joined.role, 'guest');
  var miss = roomApi.shot(made.roomId, {
    shotSeq: 1,
    role: 'host',
    token: made.token,
    events: [{ type: 'miss' }],
    ballsSnapshot: [{ id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false }]
  });
  assert.strictEqual(miss.state.turnRole, 'guest');
  var polled = roomApi.state(made.roomId);
  assert.strictEqual(polled.state.turn, 1);
  assert.ok(polled.ballsSnapshot);
});

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
            if (err4) {
              started.server.close();
              return cb(err4);
            }
            httpJson(port, 'POST', '/room/create', {}, function (err5, created2) {
              if (err5) {
                started.server.close();
                return cb(err5);
              }
              httpJson(port, 'POST', '/room/join', { roomId: created2.roomId }, function (err6, joined2) {
                if (err6) {
                  started.server.close();
                  return cb(err6);
                }
                httpJson(port, 'POST', '/room/shot', {
                  roomId: created2.roomId,
                  shotSeq: 1,
                  aimAngle: 0.4,
                  power: 0.7,
                  role: 'host',
                  token: created2.token,
                  events: [{ type: 'miss' }],
                  ballsSnapshot: [{ id: 'b1', n: 1, nx: 0.22, ny: 0.61, pocketed: false }]
                }, function (err7, shot2) {
                  if (err7) {
                    started.server.close();
                    return cb(err7);
                  }
                  httpJson(port, 'GET', '/room/state?roomId=' + created2.roomId, null, function (err8, state2) {
                    started.server.close();
                    if (err8) return cb(err8);
                    cb(null, {
                      created: created,
                      joined: joined,
                      shot: shot,
                      state: state,
                      created2: created2,
                      joined2: joined2,
                      shot2: shot2,
                      state2: state2
                    });
                  });
                });
              });
            });
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
    assert.strictEqual(result.created2.role, 'host');
    assert.strictEqual(result.joined2.role, 'guest');
    assert.strictEqual(result.shot2.state.turn, 1);
    assert.strictEqual(result.shot2.state.ballsSnapshot[0].nx, 0.22);
    assert.strictEqual(result.state2.state.turn, 1);
    console.log('ok  HTTP POST /room/create|/join|/shot and GET /room/state');
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP room poll');
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
