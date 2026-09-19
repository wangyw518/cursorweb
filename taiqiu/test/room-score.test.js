'use strict';

/**
 * Friend-battle stars: credit only the current turnOpenId side.
 * Host pocket → stars.host; guest pocket → stars.guest.
 * No hardcoded 32; two different legal shots accumulate differently.
 */
var assert = require('assert');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomApi = require('../js/roomApi');
var roomServer = require('../dev/room-server');
var cloudFn = require('../cloudfunctions/taiqiuRoom/index');
var sessionMod = require('../js/session');
var hud = require('../js/hud');
var config = require('../js/config.json');
var storage = require('../js/storage');
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

function openRoom() {
  var store = storeMod.createStore();
  var made = store.create({ openId: 'host-open', nick: '房主甲' });
  store.join({ roomId: made.roomId, openId: 'guest-open', nick: '客座乙' });
  return { store: store, roomId: made.roomId };
}

check('create stars start at 0/0 and ignore client hardcoded 32', function () {
  var store = storeMod.createStore();
  var made = store.create({
    openId: 'h',
    stars: { host: 32, guest: 32 },
    scores: [32, 32],
    pocketScore: 32,
    zoneBonus: 32
  });
  assert.strictEqual(made.state.stars.host, 0);
  assert.strictEqual(made.state.stars.guest, 0);
  assert.deepStrictEqual(made.state.scores, [0, 0]);
  assert.strictEqual(made.state.pocketScore, null);
  assert.strictEqual(made.state.zoneBonus, null);
  assert.notStrictEqual(made.state.stars.host, 32);
});

check('host legal pocket credits only stars.host; shot/state echo fields', function () {
  var room = openRoom();
  var shot = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'legal',
    events: [{ type: 'legal', pocketScore: 24, zoneBonus: 8 }],
    pocketScore: 24,
    zoneBonus: 8
  });
  assert.strictEqual(shot.ok, true);
  assert.strictEqual(shot.pocketScore, 24);
  assert.strictEqual(shot.zoneBonus, 8);
  assert.strictEqual(shot.stars.host, 32);
  assert.strictEqual(shot.stars.guest, 0);
  assert.strictEqual(shot.state.stars.host, 32);
  assert.strictEqual(shot.state.stars.guest, 0);
  assert.strictEqual(shot.state.pocketScore, 24);
  assert.strictEqual(shot.state.zoneBonus, 8);
  assert.strictEqual(shot.state.scores[0], 32);
  assert.strictEqual(shot.state.scores[1], 0);

  var polled = room.store.state(room.roomId);
  assert.strictEqual(polled.pocketScore, 24);
  assert.strictEqual(polled.zoneBonus, 8);
  assert.strictEqual(polled.stars.host, 32);
  assert.strictEqual(polled.stars.guest, 0);
  assert.strictEqual(polled.state.stars.guest, 0);
});

check('guest legal pocket credits only stars.guest', function () {
  var room = openRoom();
  room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'miss',
    events: [{ type: 'miss' }]
  });
  var guestShot = room.store.shot(room.roomId, {
    openId: 'guest-open',
    shotSeq: 2,
    reason: 'legal',
    events: [{ type: 'legal', pocketScore: 24, zoneBonus: 16 }],
    pocketScore: 24,
    zoneBonus: 16
  });
  assert.strictEqual(guestShot.ok, true);
  assert.strictEqual(guestShot.pocketScore, 24);
  assert.strictEqual(guestShot.zoneBonus, 16);
  assert.strictEqual(guestShot.stars.host, 0);
  assert.strictEqual(guestShot.stars.guest, 40);
  assert.notStrictEqual(guestShot.stars.guest, 32);
  assert.strictEqual(guestShot.state.stars.host, 0);
  assert.strictEqual(guestShot.state.scores[1], 40);
});

check('two different legal shots accumulate differently and are not locked at 32', function () {
  var room = openRoom();
  var first = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 8
  });
  assert.strictEqual(first.stars.host, 32);
  var second = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 2,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 36
  });
  assert.strictEqual(second.pocketScore, 24);
  assert.strictEqual(second.zoneBonus, 36);
  assert.strictEqual(second.stars.host, 92);
  assert.strictEqual(second.stars.guest, 0);
  assert.notStrictEqual(second.stars.host, 32);
  assert.notStrictEqual(second.stars.host, first.stars.host);

  room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 3,
    reason: 'miss'
  });
  var guestA = room.store.shot(room.roomId, {
    openId: 'guest-open',
    shotSeq: 4,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 16
  });
  var guestB = room.store.shot(room.roomId, {
    openId: 'guest-open',
    shotSeq: 5,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 24
  });
  assert.strictEqual(guestA.stars.guest, 40);
  assert.strictEqual(guestB.stars.guest, 88);
  assert.notStrictEqual(guestA.stars.guest, guestB.stars.guest);
  assert.notStrictEqual(guestB.stars.guest, 32);
  assert.strictEqual(guestB.stars.host, 92);
});

check('server rejects crediting the waiting seat', function () {
  var room = openRoom();
  var badStars = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 8,
    stars: { host: 32, guest: 32 }
  });
  assert.strictEqual(badStars.ok, false);
  assert.strictEqual(badStars.reason, 'not-your-score');
  assert.strictEqual(badStars.state.stars.host, 0);
  assert.strictEqual(badStars.state.stars.guest, 0);

  var badScores = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'legal',
    scores: [24, 16]
  });
  assert.strictEqual(badScores.ok, false);
  assert.strictEqual(badScores.reason, 'not-your-score');
  assert.strictEqual(room.store.state(room.roomId).state.stars.host, 0);
});

check('mis-sent stars still credit the turn seat from pocketScore/zoneBonus', function () {
  var room = openRoom();
  var shot = room.store.shot(room.roomId, {
    openId: 'host-open',
    shotSeq: 1,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 8,
    stars: { host: 99, guest: 0 }
  });
  assert.strictEqual(shot.ok, true);
  assert.strictEqual(shot.stars.host, 32);
  assert.strictEqual(shot.stars.guest, 0);
  assert.notStrictEqual(shot.stars.host, 99);
});

check('miss / foul add 0; LocalMockRoom and cloud store match', function () {
  roomApi.resetMemory();
  var mock = new roomApi.LocalMockRoom({ persist: false });
  var made = mock.create({ openId: 'h' });
  mock.join({ roomId: made.roomId, openId: 'g' });
  var miss = mock.shot({
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    reason: 'scratch',
    pocketScore: 24,
    zoneBonus: 8,
    events: [{ type: 'scratch' }]
  });
  assert.strictEqual(miss.ok, true);
  assert.strictEqual(miss.pocketScore, 0);
  assert.strictEqual(miss.zoneBonus, 0);
  assert.strictEqual(miss.stars.host, 0);
  assert.strictEqual(miss.stars.guest, 0);

  var isolated = cloudFn._createStore();
  var cloudMade = isolated.dispatch('create', { openId: 'h' });
  isolated.dispatch('join', { roomId: cloudMade.roomId, openId: 'g' });
  var cloudShot = isolated.dispatch('shot', {
    roomId: cloudMade.roomId,
    openId: 'g',
    fromSeat: 1,
    shotSeq: 1,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 36
  });
  assert.strictEqual(cloudShot.ok, false);
  assert.strictEqual(cloudShot.reason, 'not-your-turn');

  isolated.dispatch('shot', {
    roomId: cloudMade.roomId,
    openId: 'h',
    shotSeq: 1,
    reason: 'miss'
  });
  var guest = isolated.dispatch('shot', {
    roomId: cloudMade.roomId,
    openId: 'g',
    shotSeq: 2,
    reason: 'legal',
    pocketScore: 24,
    zoneBonus: 36
  });
  assert.strictEqual(guest.ok, true);
  assert.strictEqual(guest.stars.host, 0);
  assert.strictEqual(guest.stars.guest, 60);
  assert.notStrictEqual(guest.stars.guest, 32);
});

check('2P session HUD reads own stars key; host and guest accumulate separately', function () {
  var host = fresh({ skipSplash: true, nick: '房主甲', openId: 'host-a' });
  sessionMod.createRoom(host);
  var guest = sessionMod.create(viewport(), config, { skipSplash: true, nick: '好友乙', openId: 'guest-b' });
  sessionMod.joinRoom(guest, host.room.roomId);
  sessionMod.pullRoom(host);

  assert.strictEqual(hud.ownStarKey(host), 'host');
  assert.strictEqual(hud.ownStarKey(guest), 'guest');
  assert.strictEqual(hud.ownStars(host), 0);
  assert.strictEqual(hud.ownStars(guest), 0);

  var stellar = host.tiles.filter(function (t) { return t.kind === 'stellar'; })[0];
  sessionMod.debugForceStop(host, {
    pocketTarget: true,
    firstContact: true,
    x: stellar.x,
    y: stellar.y
  });
  assert.strictEqual(host.stars.host, config.pocketBonus + 36);
  assert.strictEqual(host.stars.guest, 0);
  assert.notStrictEqual(host.stars.host, 32);
  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.stars.host, config.pocketBonus + 36);
  assert.strictEqual(guest.stars.guest, 0);
  assert.strictEqual(hud.ownStars(host), config.pocketBonus + 36);
  assert.strictEqual(hud.ownStars(guest), 0);
  assert.strictEqual(hud.versusScoreText(host), '你 ' + (config.pocketBonus + 36) + ' · 对方 0');
  assert.strictEqual(hud.versusScoreText(guest), '你 0 · 对方 ' + (config.pocketBonus + 36));

  sessionMod.debugForceStop(host, { pocketTarget: false, firstContact: true });
  sessionMod.pullRoom(guest);
  assert.strictEqual(guest.turn, 1);

  var meteor = guest.tiles.filter(function (t) { return t.kind === 'meteor'; })[0];
  sessionMod.debugForceStop(guest, {
    pocketTarget: true,
    firstContact: true,
    x: meteor.x,
    y: meteor.y
  });
  assert.strictEqual(guest.stars.guest, config.pocketBonus + 16);
  assert.strictEqual(guest.stars.host, config.pocketBonus + 36);
  assert.notStrictEqual(guest.stars.guest, 32);
  sessionMod.pullRoom(host);
  assert.strictEqual(host.stars.guest, config.pocketBonus + 16);
  assert.strictEqual(hud.ownStars(guest), config.pocketBonus + 16);
  assert.strictEqual(hud.ownStars(host), config.pocketBonus + 36);
  assert.notStrictEqual(hud.ownStars(host), hud.ownStars(guest));

  var comet = guest.tiles.filter(function (t) { return t.kind === 'comet'; })[0];
  sessionMod.debugForceStop(guest, {
    pocketTarget: true,
    firstContact: true,
    x: comet.x,
    y: comet.y
  });
  assert.strictEqual(guest.stars.guest, config.pocketBonus + 16 + config.pocketBonus + 24);
  assert.notStrictEqual(guest.stars.guest, config.pocketBonus + 16);
  sessionMod.pullRoom(host);
  assert.strictEqual(host.stars.guest, guest.stars.guest);
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

function runHttpScore(cb) {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    var port = addr.port;
    httpJson(port, 'POST', '/room/create', { openId: 'host-a', nick: '房主甲' }, function (err, created) {
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
          reason: 'legal',
          pocketScore: 24,
          zoneBonus: 8
        }, function (err3, hostShot) {
          if (err3) {
            started.server.close();
            return cb(err3);
          }
          httpJson(port, 'POST', '/room/shot', {
            roomId: created.roomId,
            openId: 'host-a',
            shotSeq: 2,
            reason: 'miss'
          }, function (err4, miss) {
            if (err4) {
              started.server.close();
              return cb(err4);
            }
            httpJson(port, 'POST', '/room/shot', {
              roomId: created.roomId,
              openId: 'guest-b',
              shotSeq: 3,
              reason: 'legal',
              pocketScore: 24,
              zoneBonus: 16
            }, function (err5, guestShot) {
              if (err5) {
                started.server.close();
                return cb(err5);
              }
              httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err6, state) {
                if (err6) {
                  started.server.close();
                  return cb(err6);
                }
                httpJson(port, 'POST', '/room/shot', {
                  roomId: created.roomId,
                  openId: 'guest-b',
                  shotSeq: 4,
                  reason: 'legal',
                  pocketScore: 24,
                  zoneBonus: 8,
                  stars: { host: 64, guest: 40 }
                }, function (err7, rejected) {
                  started.server.close();
                  if (err7) return cb(err7);
                  cb(null, {
                    created: created,
                    joined: joined,
                    hostShot: hostShot,
                    miss: miss,
                    guestShot: guestShot,
                    state: state,
                    rejected: rejected
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

function finish(err, httpResult) {
  try {
    if (err) throw err;
    if (httpResult) {
      assert.strictEqual(httpResult.created.state.stars.host, 0);
      assert.strictEqual(httpResult.created.state.stars.guest, 0);
      assert.strictEqual(httpResult.hostShot.ok, true);
      assert.strictEqual(httpResult.hostShot.pocketScore, 24);
      assert.strictEqual(httpResult.hostShot.zoneBonus, 8);
      assert.strictEqual(httpResult.hostShot.stars.host, 32);
      assert.strictEqual(httpResult.hostShot.stars.guest, 0);
      assert.strictEqual(httpResult.guestShot.stars.host, 32);
      assert.strictEqual(httpResult.guestShot.stars.guest, 40);
      assert.notStrictEqual(httpResult.guestShot.stars.guest, 32);
      assert.strictEqual(httpResult.state.stars.host, 32);
      assert.strictEqual(httpResult.state.stars.guest, 40);
      assert.strictEqual(httpResult.rejected.ok, false);
      assert.strictEqual(httpResult.rejected.reason, 'not-your-score');
      console.log('ok  HTTP host pocket → host stars; guest pocket → guest stars');
    }
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP friend score');
    console.error('  ' + fail.message);
  }
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('room score tests passed');
}

if (require.main === module) {
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  runHttpScore(finish);
} else {
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('room score tests passed');
}
