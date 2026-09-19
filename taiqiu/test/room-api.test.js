'use strict';

var assert = require('assert');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomServer = require('../dev/room-server');
var roomApi = require('../js/roomApi');
var net = require('../js/net');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var config = require('../js/config.json');
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

check('second distinct openId cannot join a full room', function () {
  var store = storeMod.createStore();
  var made = store.create({ names: ['房主', '好友'] });
  var first = store.join({ room: made.roomId, nick: '甲', openId: 'g-1' });
  assert.strictEqual(first.ok, true);
  var second = store.join({ roomId: made.roomId, nick: '乙', openId: 'g-2' });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'full');
  var again = store.join({ roomId: made.roomId, nick: '甲', openId: 'g-1' });
  assert.strictEqual(again.ok, true);
});

check('aim snapshot bumps aimSeq only and keeps shotSeq', function () {
  var store = storeMod.createStore();
  var made = store.create();
  store.join(made.roomId);
  var first = store.aim(made.roomId, {
    fromSeat: 0,
    token: made.token,
    aimSeq: 1,
    kind: 'charging',
    aimAngle: 0.4,
    power: 0.6,
    ax: Math.cos(0.4),
    ay: Math.sin(0.4)
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.state.shotSeq, 0);
  assert.strictEqual(first.state.aimSeq, 1);
  assert.strictEqual(first.state.aim.kind, 'charging');
  assert.ok(first.state.phase === 'Aim' || first.state.phase === 'Pull');
  var fire = store.aim(made.roomId, {
    fromSeat: 0,
    token: made.token,
    aimSeq: 2,
    kind: 'firing',
    aimAngle: 0.4,
    power: 0.9
  });
  assert.strictEqual(fire.state.shotSeq, 0);
  assert.strictEqual(fire.state.aimSeq, 2);
  assert.strictEqual(fire.state.phase, 'Shot');
});

check('GET state after deadline emits foulCode=shotClock, swaps turn, no rerack', function () {
  var store = storeMod.createStore();
  var made = store.create({
    balls: [
      { id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false },
      { id: 'b1', n: 1, nx: 0.41, ny: 0.52, pocketed: false }
    ]
  });
  store.join({ roomId: made.roomId, nick: '好友甲', openId: 'g-1' });
  assert.ok(made.state.deadlineAt > Date.now());
  var map = store.dump();
  map[made.roomId].deadlineAt = Date.now() - 40;
  map[made.roomId].aimDeadlineAt = map[made.roomId].deadlineAt;
  store.hydrate(map);
  var timed = store.state(made.roomId);
  assert.strictEqual(timed.ok, true);
  assert.strictEqual(timed.state.foulCode, 'shotClock');
  assert.strictEqual(timed.state.turn, 1);
  assert.strictEqual(timed.state.turnRole, 'guest');
  assert.strictEqual(timed.state.shotSeq, 1);
  assert.strictEqual(timed.state.matchOver, false);
  assert.strictEqual(timed.state.balls[1].nx, 0.41);
  assert.ok(timed.state.deadlineAt > Date.now());
  assert.ok(timed.state.nicknames.guest);
});

check('aim dirty field does not mutate stored balls[]', function () {
  var store = storeMod.createStore();
  var made = store.create({
    balls: [
      { id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false },
      { id: 'b1', n: 1, nx: 0.33, ny: 0.44, pocketed: false }
    ]
  });
  var aimed = store.aim(made.roomId, {
    fromSeat: 0,
    token: made.token,
    shotSeq: 0,
    angle: 0.5,
    power: 0.4,
    aimLine: [{ x: 1, y: 2 }]
  });
  assert.strictEqual(aimed.ok, true);
  assert.ok(aimed.state.aim);
  assert.strictEqual(aimed.state.aim.angle, 0.5);
  assert.ok(aimed.state.aim.updatedAt);
  assert.ok(!aimed.state.balls || aimed.state.balls.every(function (b) {
    return b.id === 'cue' || b.n === 0;
  }));
  var stored = store.dump()[made.roomId];
  assert.strictEqual(stored.balls.length, 2);
  assert.strictEqual(stored.balls[1].nx, 0.33);
  assert.strictEqual(stored.shotSeq, 0);
});

check('GET state?sinceSeq= strips object balls during Aim', function () {
  var store = storeMod.createStore();
  var made = store.create({
    balls: [
      { id: 'cue', n: 0, nx: 0.5, ny: 0.8, pocketed: false },
      { id: 'b1', n: 1, nx: 0.22, ny: 0.31, pocketed: false }
    ]
  });
  var slim = store.state(made.roomId, { sinceSeq: 0 });
  assert.strictEqual(slim.state.slim, true);
  assert.ok(slim.state.balls.every(function (b) { return b.id === 'cue' || b.n === 0; }));
  var full = store.state(made.roomId);
  assert.ok(full.state.balls.some(function (b) { return b.n === 1; }));
  assert.ok(full.state.deadlineAt);
  assert.ok(full.state.nicknames);
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

check('guest pot accumulates guest stars independently and is not frozen at 32', function () {
  var store = storeMod.createStore();
  var made = store.create();
  var joined = store.join({ roomId: made.roomId });
  store.shot(made.roomId, {
    fromSeat: 0,
    token: made.token,
    reason: 'miss',
    pocketScore: 0,
    zoneBonus: 0
  });
  var guestPot = store.shot(made.roomId, {
    fromSeat: 1,
    token: joined.token,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 36
  });
  assert.strictEqual(guestPot.ok, true);
  assert.strictEqual(guestPot.state.stars.guest, 60);
  assert.strictEqual(guestPot.state.stars.host, 0);
  assert.strictEqual(guestPot.state.scores[1], 60);
  assert.notStrictEqual(guestPot.state.stars.guest, 32);
  var again = store.shot(made.roomId, {
    fromSeat: 1,
    token: joined.token,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 8,
    shotSeq: guestPot.state.shotSeq + 1
  });
  assert.strictEqual(again.state.stars.guest, 92);
  assert.strictEqual(again.state.stars.host, 0);
  var reset = store.shot(made.roomId, {
    fromSeat: 1,
    token: joined.token,
    reason: 'new-game',
    scores: [99, 99],
    stars: { host: 32, guest: 32 }
  });
  assert.strictEqual(reset.state.stars.host, 0);
  assert.strictEqual(reset.state.stars.guest, 0);
  assert.strictEqual(reset.state.scores[0], 0);
  assert.strictEqual(reset.state.scores[1], 0);
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
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
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

function runAimHttp(cb) {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    var port = addr.port;
    httpJson(port, 'POST', '/room/create', {}, function (err, created) {
      if (err) {
        started.server.close();
        return cb(err);
      }
      httpJson(port, 'POST', '/room/aim', {
        roomId: created.roomId,
        fromSeat: 0,
        token: created.token,
        aimSeq: 1,
        kind: 'charging',
        aimAngle: 0.33,
        power: 0.45
      }, function (err2, aimed) {
        started.server.close();
        if (err2) return cb(err2);
        cb(null, { created: created, aimed: aimed });
      });
    });
  });
}

function viewport() {
  return { width: 375, height: 667, pixelRatio: 2, statusBarHeight: 20, safeTop: 20, safeBottom: 0 };
}

function runInviteHttp(cb) {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    var port = addr.port;
    var cfg = JSON.parse(JSON.stringify(config));
    cfg.room = cfg.room || {};
    cfg.room.roomApiBase = 'http://127.0.0.1:' + port;
    cfg.room.httpUrl = cfg.room.roomApiBase;
    storage.resetMemory();
    roomApi.configure({ roomApiBase: cfg.room.roomApiBase });
    var host = sessionMod.create(viewport(), cfg);
    host.displayName = '房主甲';
    var created = sessionMod.createRoom(host);
    function afterHost() {
      if (!host.room || !host.room.roomId) return cb(new Error('host create never attached'));
      var guest = sessionMod.create(viewport(), cfg);
      guest.displayName = '好友乙';
      var pending = sessionMod.enterInvite(guest, {
        query: 'roomId=' + host.room.roomId + '&from=invite'
      });
      var tries = 0;
      function waitJoin() {
        tries += 1;
        if (guest.room && guest.room.roomId === host.room.roomId && guest.mySeat === 1) {
          sessionMod.pullRoom(host);
          setTimeout(function () {
            started.server.close();
            cb(null, { host: host, guest: guest, pending: pending, share: share.composeRoom(host.room.roomId) });
          }, 40);
          return;
        }
        if (guest.joinError) {
          started.server.close();
          return cb(new Error('guest joinError ' + guest.joinError));
        }
        if (tries > 80) {
          started.server.close();
          return cb(new Error('guest join timeout'));
        }
        setTimeout(waitJoin, 25);
      }
      waitJoin();
    }
    if (created && created.roomId) return afterHost();
    var hostTries = 0;
    (function waitHost() {
      hostTries += 1;
      if (host.room && host.room.roomId) return afterHost();
      if (hostTries > 80) {
        started.server.close();
        return cb(new Error('host create timeout'));
      }
      setTimeout(waitHost, 25);
    }());
  });
}

var httpPending = 3;
function finishHttp() {
  if (httpPending) return;
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('room api tests passed');
}

runHttp(function (err, result) {
  httpPending -= 1;
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
  finishHttp();
});

runInviteHttp(function (err, result) {
  httpPending -= 1;
  try {
    if (err) throw err;
    assert.ok(result.share.ok);
    assert.ok(result.share.query.indexOf('roomId=' + result.host.room.roomId) === 0);
    assert.strictEqual(result.share.query, 'roomId=' + result.host.room.roomId);
    assert.strictEqual(result.share.path, '?roomId=' + result.host.room.roomId);
    assert.strictEqual(result.guest.mode, 'room');
    assert.strictEqual(result.guest.phase, 'Aim');
    assert.strictEqual(result.guest.mySeat, 1);
    assert.strictEqual(result.guest.turn, 0);
    assert.strictEqual(result.host.turn, 0);
    assert.ok(result.host.room.guestJoined);
    assert.ok(String(result.guest.names[0]).indexOf('房主') !== -1 || String(result.host.names[0]).indexOf('甲') !== -1);
    assert.ok(String(result.guest.names[1]).indexOf('乙') !== -1 || String(result.host.names[1]).indexOf('乙') !== -1);
    console.log('ok  HTTP enterInvite joins guest without solo splash');
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP enterInvite');
    console.error('  ' + fail.message);
  }
  finishHttp();
});

runAimHttp(function (err, result) {
  httpPending -= 1;
  try {
    if (err) throw err;
    assert.ok(result.aimed.ok);
    assert.strictEqual(result.aimed.state.shotSeq, 0);
    assert.strictEqual(result.aimed.state.aimSeq, 1);
    assert.strictEqual(result.aimed.state.aim.kind, 'charging');
    console.log('ok  HTTP POST /room/aim keeps shotSeq');
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP /room/aim');
    console.error('  ' + fail.message);
  }
  finishHttp();
});

if (failures && !httpPending) {
  console.error(failures + ' failed');
  process.exit(1);
}
