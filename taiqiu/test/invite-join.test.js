'use strict';

/**
 * P0 friend-invite: create returns shareable roomId; another openId can join;
 * bad / full / ended rooms return ok:false + reason (+ state when possible).
 * Cloud function and HTTP room-server share store.dispatch.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var http = require('http');
var storeMod = require('../js/roomStore');
var roomApi = require('../js/roomApi');
var roomServer = require('../dev/room-server');
var cloudFn = require('../cloudfunctions/taiqiuRoom/index');
var share = require('../js/share');
var sessionMod = require('../js/session');
var config = require('../js/config.json');

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

check('js/roomStore.js and cloudfunctions/taiqiuRoom/roomStore.js are identical', function () {
  var a = fs.readFileSync(path.join(__dirname, '../js/roomStore.js'), 'utf8');
  var b = fs.readFileSync(path.join(__dirname, '../cloudfunctions/taiqiuRoom/roomStore.js'), 'utf8');
  assert.strictEqual(a, b);
});

check('create returns shareable roomId + share query/path', function () {
  var store = storeMod.createStore();
  var made = store.dispatch('create', { openId: 'host-a', nick: '房主甲' });
  assert.strictEqual(made.ok, true);
  assert.ok(made.roomId);
  assert.strictEqual(made.roomId.length, 6);
  assert.strictEqual(made.share.query, 'roomId=' + made.roomId);
  assert.strictEqual(made.share.path, '?roomId=' + made.roomId);
  assert.strictEqual(made.state.turn, 0);
  assert.strictEqual(made.state.turnOpenId, 'host-a');
  assert.strictEqual(made.state.nicknames.host, '房主甲');
});

check('other openId joins the same roomId; both nicks visible; host first', function () {
  var store = storeMod.createStore();
  var made = store.dispatch('create', { openId: 'host-a', nick: '房主甲' });
  var joined = store.dispatch('join', {
    roomId: made.roomId,
    openId: 'guest-b',
    nick: '好友乙'
  });
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.role, 'guest');
  assert.strictEqual(joined.state.nicknames.host, '房主甲');
  assert.strictEqual(joined.state.nicknames.guest, '好友乙');
  assert.strictEqual(joined.state.guestOpenId, 'guest-b');
  assert.strictEqual(joined.state.turn, 0);
  assert.strictEqual(joined.state.turnRole, 'host');
  assert.strictEqual(joined.state.turnOpenId, 'host-a');

  var hostView = store.dispatch('state', { roomId: made.roomId });
  var guestView = store.dispatch('state', { roomId: made.roomId.toLowerCase() });
  assert.strictEqual(hostView.state.nicknames.guest, '好友乙');
  assert.strictEqual(guestView.state.nicknames.host, '房主甲');
  assert.strictEqual(guestView.state.turnOpenId, 'host-a');
});

check('join missing / full / ended return ok:false reason and state when possible', function () {
  var store = storeMod.createStore();
  var missing = store.dispatch('join', { roomId: 'NOPE12', openId: 'x' });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.reason, 'missing');
  assert.ok(!missing.state);

  var empty = store.dispatch('join', {});
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.reason, 'missing');

  var made = store.dispatch('create', { openId: 'h', nick: 'H' });
  store.dispatch('join', { roomId: made.roomId, openId: 'g', nick: 'G' });
  var third = store.dispatch('join', { roomId: made.roomId, openId: 'z', nick: 'Z' });
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.reason, 'full');
  assert.ok(third.state);
  assert.strictEqual(third.state.nicknames.guest, 'G');

  var rejoin = store.dispatch('join', { roomId: made.roomId, openId: 'g', nick: 'G2' });
  assert.strictEqual(rejoin.ok, true);
  assert.strictEqual(rejoin.role, 'guest');

  var hostBack = store.dispatch('join', { roomId: made.roomId, openId: 'h' });
  assert.strictEqual(hostBack.ok, true);
  assert.strictEqual(hostBack.role, 'host');
  assert.strictEqual(hostBack.seat, 0);

  store.dispatch('shot', {
    roomId: made.roomId,
    openId: 'h',
    shotSeq: 1,
    reason: 'nine',
    events: [{ type: 'nine', legal: true }]
  });
  var late = store.dispatch('join', { roomId: made.roomId, openId: 'late' });
  assert.strictEqual(late.ok, false);
  assert.strictEqual(late.reason, 'ended');
  assert.ok(late.state);
  assert.strictEqual(late.state.matchOver, true);
});

check('cloud function unwrap + dispatch match HTTP create/join', function () {
  var isolated = cloudFn._createStore();
  var viaHttp = cloudFn.unwrapEvent({
    path: '/room/create',
    httpMethod: 'POST',
    body: JSON.stringify({ openId: 'cloud-h', nick: '云房主' })
  });
  assert.strictEqual(viaHttp.action, 'create');
  var made = cloudFn.dispatch(viaHttp, isolated);
  assert.strictEqual(made.ok, true);
  assert.strictEqual(made.share.query, 'roomId=' + made.roomId);

  var joinEv = cloudFn.unwrapEvent({
    path: '/room/join',
    body: { roomId: made.roomId.toLowerCase(), openId: 'cloud-g', nick: '云客' }
  });
  assert.strictEqual(joinEv.action, 'join');
  var joined = cloudFn.dispatch(joinEv, isolated);
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.state.nicknames.host, '云房主');
  assert.strictEqual(joined.state.nicknames.guest, '云客');
  assert.strictEqual(joined.state.turnOpenId, 'cloud-h');

  var miss = cloudFn.dispatch({ action: 'join', roomId: 'ZZZZZZ', openId: 'nope' }, isolated);
  assert.strictEqual(miss.ok, false);
  assert.strictEqual(miss.reason, 'missing');
});

check('share launch query parses roomId for onLaunch / onShow', function () {
  assert.strictEqual(share.roomIdFromLaunch({ query: { roomId: 'AB12CD' } }), 'AB12CD');
  assert.strictEqual(share.roomIdFromLaunch({ query: 'roomId=AB12CD' }), 'AB12CD');
  assert.strictEqual(share.roomIdFromLaunch({ query: { roomid: 'ab12cd' } }), 'ab12cd');
  assert.strictEqual(share.composeRoom('AB12CD').query, 'roomId=AB12CD');
  assert.strictEqual(share.composeRoom('AB12CD').path, '?roomId=AB12CD');
  assert.strictEqual(config.room.shareQuery, 'roomId=XXXXXX');
  assert.strictEqual(config.room.sharePathExample, '?roomId=XXXXXX');
});

check('session create then other openId join; bad roomId toasts reason', function () {
  roomApi.resetMemory();
  var host = sessionMod.create(viewport(), config, { skipSplash: true, nick: '房主甲', openId: 'host-a' });
  var made = sessionMod.createRoom(host);
  assert.ok(made.roomId);
  assert.strictEqual(host.nicknames.host, '房主甲');
  assert.strictEqual(host.turn, 0);

  var guest = sessionMod.create(viewport(), config, { skipSplash: true, nick: '好友乙', openId: 'guest-b' });
  var joined = sessionMod.joinRoom(guest, made.roomId);
  assert.strictEqual(joined.kind, 'join');
  assert.strictEqual(guest.mySeat, 1);
  assert.strictEqual(guest.nicknames.host, '房主甲');
  assert.strictEqual(guest.nicknames.guest, '好友乙');
  sessionMod.pullRoom(host);
  assert.strictEqual(host.nicknames.guest, '好友乙');
  assert.strictEqual(host.turn, 0);

  var lost = sessionMod.create(viewport(), config, { skipSplash: true, openId: 'lost' });
  var fail = sessionMod.joinRoom(lost, 'NOPE12');
  assert.strictEqual(fail.kind, 'join-fail');
  assert.strictEqual(fail.reason, 'missing');
  assert.ok(lost.toast);
  assert.strictEqual(lost.toast.text, '房间无效');
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

function runHttpInvite(cb) {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    var port = addr.port;
    httpJson(port, 'POST', '/room/create', {
      openId: 'host-a',
      nick: '房主甲'
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
        httpJson(port, 'POST', '/room/join', { roomId: 'NOPE12', openId: 'lost' }, function (err3, missing) {
          if (err3) {
            started.server.close();
            return cb(err3);
          }
          httpJson(port, 'POST', '/room/join', {
            roomId: String(created.roomId).toLowerCase(),
            openId: 'guest-c',
            nick: '第三人'
          }, function (err4, full) {
            if (err4) {
              started.server.close();
              return cb(err4);
            }
            httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err5, state) {
              started.server.close();
              if (err5) return cb(err5);
              cb(null, {
                created: created,
                joined: joined,
                missing: missing,
                full: full,
                state: state
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
      assert.ok(httpResult.created.ok);
      assert.ok(httpResult.created.roomId);
      assert.strictEqual(httpResult.created.share.query, 'roomId=' + httpResult.created.roomId);
      assert.strictEqual(httpResult.created.share.path, '?roomId=' + httpResult.created.roomId);
      assert.strictEqual(httpResult.joined.ok, true);
      assert.strictEqual(httpResult.joined.state.nicknames.host, '房主甲');
      assert.strictEqual(httpResult.joined.state.nicknames.guest, '好友乙');
      assert.strictEqual(httpResult.joined.state.turnOpenId, 'host-a');
      assert.strictEqual(httpResult.missing.ok, false);
      assert.strictEqual(httpResult.missing.reason, 'missing');
      assert.strictEqual(httpResult.full.ok, false);
      assert.strictEqual(httpResult.full.reason, 'full');
      assert.ok(httpResult.full.state);
      assert.strictEqual(httpResult.state.state.nicknames.guest, '好友乙');
      console.log('ok  HTTP create → other openId join; bad roomId has reason');
    }
  } catch (fail) {
    failures += 1;
    console.error('FAIL  HTTP invite join');
    console.error('  ' + fail.message);
  }
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('invite join tests passed');
}

if (require.main === module) {
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  runHttpInvite(finish);
} else {
  if (failures) {
    console.error(failures + ' failed');
    process.exit(1);
  }
  console.log('invite join tests passed');
}
