'use strict';

/**
 * Friend spectate P0: aim dirty sync → shot impulse → local replay → settle snapshot.
 */
var assert = require('assert');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomApi = require('../js/roomApi');
var roomServer = require('../dev/room-server');
var sessionMod = require('../js/session');
var balls = require('../js/balls');
var config = require('../js/config.json');
var storage = require('../js/storage');
var net = require('../js/net');
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

function fresh(opts) {
  storage.resetMemory();
  net.resetMemory();
  roomApi.resetMemory();
  return sessionMod.create(viewport(), config, opts || { skipSplash: true });
}

function rackBalls() {
  return [
    { id: 'cue', n: 0, nx: 0.5, ny: 0.78, pocketed: false },
    { id: 'b1', n: 1, nx: 0.5, ny: 0.32, pocketed: false },
    { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
  ];
}

function openRoom(store) {
  store = store || storeMod.createStore();
  var made = store.create({ openId: 'h', nick: '房主', balls: rackBalls() });
  store.join({ roomId: made.roomId, openId: 'g', nick: '客座' });
  return { store: store, roomId: made.roomId };
}

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

check('shot response echoes angle/power/spin and phase=rolling', function () {
  var room = openRoom();
  var shot = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 1.25,
    power: 0.6,
    spin: 0.1
  });
  assert.strictEqual(shot.ok, true);
  assert.strictEqual(shot.angle, 1.25);
  assert.strictEqual(shot.power, 0.6);
  assert.strictEqual(shot.spin, 0.1);
  assert.strictEqual(shot.shotSeq, 1);
  assert.strictEqual(shot.phase, 'rolling');
  assert.strictEqual(shot.state.phase, 'rolling');
  assert.strictEqual(shot.state.angle, 1.25);
  assert.strictEqual(shot.state.power, 0.6);
  assert.ok(shot.impulse);
  assert.strictEqual(shot.impulse.angle, 1.25);
  assert.strictEqual(shot.impulse.power, 0.6);
  assert.strictEqual(shot.state.turnOpenId, 'h');
  assert.strictEqual(shot.state.balls[1].nx, 0.5);
});

check('aimAngle alias is accepted and echoed as angle', function () {
  var room = openRoom();
  var shot = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    aimAngle: -0.8,
    power: 0.4
  });
  assert.strictEqual(shot.ok, true);
  assert.strictEqual(shot.angle, -0.8);
  assert.strictEqual(shot.power, 0.4);
  assert.strictEqual(shot.state.lastShot.aimAngle, -0.8);
});

check('guest reads impulse immediately after host fire, then later settled snapshot', function () {
  var room = openRoom();
  var opening = JSON.stringify(room.store.state(room.roomId).state.balls);
  var fire = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 0.33,
    power: 0.72,
    reason: 'rolling',
    phase: 'rolling'
  });
  assert.strictEqual(fire.ok, true);
  assert.strictEqual(fire.phase, 'rolling');

  var guestNow = room.store.state(room.roomId);
  assert.strictEqual(guestNow.state.phase, 'rolling');
  assert.strictEqual(guestNow.angle, 0.33);
  assert.strictEqual(guestNow.power, 0.72);
  assert.strictEqual(guestNow.shotSeq, 1);
  assert.strictEqual(guestNow.impulse.angle, 0.33);
  assert.strictEqual(JSON.stringify(guestNow.state.balls), opening);
  assert.strictEqual(guestNow.state.balls[1].nx, 0.5);

  var settled = [
    { id: 'cue', n: 0, nx: 0.41, ny: 0.61, pocketed: false },
    { id: 'b1', n: 1, nx: 0.62, ny: 0.29, pocketed: false },
    { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
  ];
  var settle = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    reason: 'miss',
    events: [{ type: 'miss' }],
    ballsSnapshot: settled
  });
  assert.strictEqual(settle.ok, true);
  assert.strictEqual(settle.state.phase, 'Aim');
  assert.strictEqual(settle.state.turnOpenId, 'g');
  assert.strictEqual(settle.angle, 0.33);
  assert.strictEqual(settle.power, 0.72);

  var guestLater = room.store.state(room.roomId);
  assert.strictEqual(guestLater.state.balls[0].nx, 0.41);
  assert.strictEqual(guestLater.state.balls[1].nx, 0.62);
  assert.strictEqual(guestLater.state.phase, 'Aim');
  assert.ok(guestLater.state.ballsSeq >= 1);
});

check('impulse-first never writes balls; settle still credits and switches', function () {
  var room = openRoom();
  room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 1,
    power: 0.5
  });
  var afterFire = room.store.state(room.roomId);
  assert.strictEqual(afterFire.state.stars.host, 0);
  assert.strictEqual(afterFire.state.turnOpenId, 'h');

  var settle = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 2,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 8,
    ballsSnapshot: [
      { id: 'cue', n: 0, nx: 0.5, ny: 0.4, pocketed: false },
      { id: 'b1', n: 1, nx: 0.2, ny: 0.2, pocketed: true },
      { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
    ]
  });
  assert.strictEqual(settle.ok, true);
  assert.strictEqual(settle.stars.host, 32);
  assert.strictEqual(settle.state.turnOpenId, 'h');
  assert.strictEqual(settle.state.balls[1].pocketed, true);
});

check('combined legacy shot still settles and echoes impulse', function () {
  var room = openRoom();
  var miss = room.store.shot(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 0.2,
    power: 0.55,
    reason: 'miss',
    events: [{ type: 'miss' }],
    ballsSnapshot: rackBalls()
  });
  assert.strictEqual(miss.ok, true);
  assert.strictEqual(miss.angle, 0.2);
  assert.strictEqual(miss.power, 0.55);
  assert.strictEqual(miss.state.phase, 'Aim');
  assert.strictEqual(miss.state.turnOpenId, 'g');
});

check('aim dirty write still never mutates balls during rolling setup', function () {
  var room = openRoom();
  var before = JSON.stringify(room.store.state(room.roomId).state.balls);
  var aimed = room.store.aim(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 0.9,
    power: 0.35,
    balls: [{ id: 'b1', n: 1, nx: 0.01, ny: 0.01, pocketed: true }]
  });
  assert.strictEqual(aimed.ok, true);
  assert.strictEqual(JSON.stringify(aimed.state.balls), before);
  room.store.shot(room.roomId, { openId: 'h', shotSeq: 1, angle: 0.9, power: 0.35 });
  var during = room.store.aim(room.roomId, {
    openId: 'h',
    shotSeq: 1,
    angle: 1.2,
    power: 0.8
  });
  assert.strictEqual(during.ok, false);
  assert.strictEqual(during.reason, 'not-aim-phase');
});

check('LocalMockRoom and cloud dispatch echo impulse on fire', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create({ openId: 'h', balls: rackBalls() });
  mock.join({ roomId: made.roomId, openId: 'g' });
  var fire = mock.shot({
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    angle: 0.5,
    power: 0.8
  });
  assert.strictEqual(fire.ok, true);
  assert.strictEqual(fire.angle, 0.5);
  assert.strictEqual(fire.power, 0.8);
  assert.strictEqual(fire.phase, 'rolling');
  var polled = mock.state(made.roomId);
  assert.strictEqual(polled.impulse.power, 0.8);

  var isolated = cloudFn._createStore();
  var created = isolated.dispatch('create', { openId: 'h', balls: rackBalls() });
  isolated.dispatch('join', { roomId: created.roomId, openId: 'g' });
  var cloudShot = isolated.dispatch('shot', {
    roomId: created.roomId,
    openId: 'h',
    shotSeq: 1,
    angle: 2.1,
    power: 0.3
  });
  assert.strictEqual(cloudShot.ok, true);
  assert.strictEqual(cloudShot.angle, 2.1);
  assert.strictEqual(cloudShot.state.phase, 'rolling');
});

check('session host fire posts impulse; guest starts local replay then applies snapshot', function () {
  var host = fresh();
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true });
  sessionMod.joinRoom(guest, host.room.roomId);
  sessionMod.pullRoom(host);

  var cueBall = balls.cueBall(host.balls);
  sessionMod.handlePointerDown(host, cueBall.x, cueBall.y);
  sessionMod.handlePointerMove(host, cueBall.x, cueBall.y + 90);
  var fire = sessionMod.handlePointerUp(host);
  assert.strictEqual(fire.kind, 'fire');
  assert.strictEqual(host.phase, sessionMod.PHASE.Shot);

  var room = roomApi.state(host.room.roomId);
  assert.strictEqual(room.state.phase, 'rolling');
  assert.ok(room.angle != null || (room.impulse && room.impulse.angle != null));
  assert.ok(room.power > 0);
  assert.strictEqual(room.shotSeq, 1);

  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.phase, sessionMod.PHASE.Shot);
  var guestCue = balls.cueBall(guest.balls);
  assert.ok(Math.abs(guestCue.vy) > 1, 'guest cue must start rolling from impulse');

  var oneX = balls.findByN(guest.balls, 1).x;
  var felt = host.table.felt;
  var moved = roomApi.snapshotBalls(host.balls, felt);
  moved[1].nx = 0.71;
  moved[1].ny = 0.22;
  roomApi.shot(host.room.roomId, {
    openId: host.openId,
    shotSeq: 1,
    reason: 'miss',
    events: [{ type: 'miss' }],
    ballsSnapshot: moved,
    settled: true,
    fromSeat: 0,
    token: host.room.token
  });

  guest.phase = sessionMod.PHASE.Aim;
  sessionMod.pullRoom(guest);
  assert.ok(Math.abs(balls.findByN(guest.balls, 1).x - (felt.x + 0.71 * felt.w)) < 1.5);
  assert.notStrictEqual(balls.findByN(guest.balls, 1).x, oneX);
});

function runHttp(cb) {
  var store = storeMod.createStore();
  var started = roomServer.listen({ port: 0, host: '127.0.0.1', store: store }, function (addr) {
    var port = addr.port;
    httpJson(port, 'POST', '/room/create', {
      openId: 'host-a',
      nick: '房主甲',
      balls: rackBalls()
    }, function (err, created) {
      if (err) {
        started.server.close();
        return cb(err);
      }
      httpJson(port, 'POST', '/room/join', {
        roomId: created.roomId,
        openId: 'guest-b',
        nick: '好友乙'
      }, function (err2, joined) {
        if (err2) {
          started.server.close();
          return cb(err2);
        }
        httpJson(port, 'POST', '/room/shot', {
          roomId: created.roomId,
          openId: 'host-a',
          shotSeq: 1,
          angle: 0.44,
          power: 0.66
        }, function (err3, fire) {
          if (err3) {
            started.server.close();
            return cb(err3);
          }
          httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err4, mid) {
            if (err4) {
              started.server.close();
              return cb(err4);
            }
            httpJson(port, 'POST', '/room/shot', {
              roomId: created.roomId,
              openId: 'host-a',
              shotSeq: 1,
              reason: 'miss',
              events: [{ type: 'miss' }],
              ballsSnapshot: [
                { id: 'cue', n: 0, nx: 0.39, ny: 0.58, pocketed: false },
                { id: 'b1', n: 1, nx: 0.58, ny: 0.3, pocketed: false },
                { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
              ]
            }, function (err5, settle) {
              started.server.close();
              if (err5) return cb(err5);
              cb(null, {
                created: created,
                joined: joined,
                fire: fire,
                mid: mid,
                settle: settle
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
    assert.strictEqual(result.fire.ok, true);
    assert.strictEqual(result.fire.angle, 0.44);
    assert.strictEqual(result.fire.power, 0.66);
    assert.strictEqual(result.fire.phase, 'rolling');
    assert.strictEqual(result.mid.phase, 'rolling');
    assert.strictEqual(result.mid.angle, 0.44);
    assert.strictEqual(result.mid.impulse.power, 0.66);
    assert.strictEqual(result.mid.state.balls[1].nx, 0.5);
    assert.strictEqual(result.settle.state.balls[0].nx, 0.39);
    assert.strictEqual(result.settle.state.phase, 'Aim');
    console.log('ok  HTTP fire impulse then settle snapshot');
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP spectate impulse');
    console.error('  ' + fail.message);
  }
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('room watch tests passed');
});

if (failures && !httpPending) {
  console.error(failures + ' failed');
  process.exit(1);
}
