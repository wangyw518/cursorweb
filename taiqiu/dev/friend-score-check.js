#!/usr/bin/env node
/**
 * Dual-client friend-score check against the room server.
 *
 *   node taiqiu/dev/friend-score-check.js            # start ephemeral server
 *   node taiqiu/dev/friend-score-check.js 8788        # attach to a running 8788
 *
 * A pockets (24+8) → only stars.host.
 * B pockets (24+16) → only stars.guest.
 * Totals are not locked at 32.
 */
'use strict';

var http = require('http');
var roomServer = require('./room-server');

function httpJson(port, method, pathname, body, cb) {
  var data = body ? JSON.stringify(body) : '';
  var req = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: pathname,
    method: method,
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(data)
    }
  }, function (res) {
    var chunks = '';
    res.on('data', function (c) { chunks += c; });
    res.on('end', function () {
      try { cb(null, JSON.parse(chunks || '{}')); } catch (err) { cb(err); }
    });
  });
  req.on('error', cb);
  if (data) req.write(data);
  req.end();
}

function fail(closeFn, message) {
  if (closeFn) closeFn();
  console.error('FAIL  ' + message);
  process.exit(1);
}

function run(port, closeFn) {
  httpJson(port, 'POST', '/room/create', {
    openId: 'host-a',
    nick: '房主甲'
  }, function (err, created) {
    if (err) return fail(closeFn, err.message);
    if (!created.ok) return fail(closeFn, 'create failed');
    if (created.state.stars.host !== 0 || created.state.stars.guest !== 0) {
      return fail(closeFn, 'create stars must start at 0/0');
    }
    console.log('CREATE ok room=' + created.roomId +
      ' stars=' + JSON.stringify(created.state.stars));

    httpJson(port, 'POST', '/room/join', {
      roomId: created.roomId,
      openId: 'guest-b',
      nick: '好友乙'
    }, function (err2, joined) {
      if (err2) return fail(closeFn, err2.message);
      if (!joined.ok) return fail(closeFn, 'join failed');

      httpJson(port, 'POST', '/room/shot', {
        roomId: created.roomId,
        openId: 'host-a',
        shotSeq: 1,
        reason: 'legal',
        pocketScore: 24,
        zoneBonus: 8
      }, function (err3, hostShot) {
        if (err3) return fail(closeFn, err3.message);
        if (!hostShot.ok) return fail(closeFn, 'host shot failed ' + hostShot.reason);
        if (hostShot.pocketScore !== 24 || hostShot.zoneBonus !== 8) {
          return fail(closeFn, 'host shot must echo pocketScore/zoneBonus');
        }
        if (hostShot.stars.host !== 32 || hostShot.stars.guest !== 0) {
          return fail(closeFn, 'host pocket must credit only stars.host');
        }
        console.log('HOST  pocketScore=24 zoneBonus=8 stars=' + JSON.stringify(hostShot.stars));

        httpJson(port, 'POST', '/room/shot', {
          roomId: created.roomId,
          openId: 'host-a',
          shotSeq: 2,
          reason: 'miss'
        }, function (err4, miss) {
          if (err4) return fail(closeFn, err4.message);
          if (!miss.ok) return fail(closeFn, 'host miss failed');

          httpJson(port, 'POST', '/room/shot', {
            roomId: created.roomId,
            openId: 'guest-b',
            shotSeq: 3,
            reason: 'legal',
            pocketScore: 24,
            zoneBonus: 16
          }, function (err5, guestShot) {
            if (err5) return fail(closeFn, err5.message);
            if (!guestShot.ok) return fail(closeFn, 'guest shot failed ' + guestShot.reason);
            if (guestShot.stars.host !== 32 || guestShot.stars.guest !== 40) {
              return fail(closeFn, 'guest pocket must credit only stars.guest');
            }
            if (guestShot.stars.guest === 32) {
              return fail(closeFn, 'guest total locked at 32');
            }
            console.log('GUEST pocketScore=24 zoneBonus=16 stars=' + JSON.stringify(guestShot.stars));

            httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err6, state) {
              if (err6) return fail(closeFn, err6.message);
              if (state.stars.host !== 32 || state.stars.guest !== 40) {
                return fail(closeFn, 'state stars mismatch');
              }
              console.log('STATE pocketScore=' + state.pocketScore +
                ' zoneBonus=' + state.zoneBonus +
                ' stars=' + JSON.stringify(state.stars));
              if (closeFn) closeFn();
              console.log('friend score check passed');
            });
          });
        });
      });
    });
  });
}

var portArg = parseInt(process.argv[2], 10);
if (portArg) {
  run(portArg, null);
} else {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    run(addr.port, function () { started.server.close(); });
  });
}
