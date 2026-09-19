#!/usr/bin/env node
/**
 * Dual-client spectate check: impulse first, then settle snapshot.
 *
 *   node taiqiu/dev/friend-watch-check.js            # start ephemeral server
 *   node taiqiu/dev/friend-watch-check.js 8788        # attach to a running 8788
 *
 * Path: aim dirty → host shot impulse (rolling) → guest reads angle/power
 *       → later settle snapshot → guest reads stopped balls.
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

var opening = [
  { id: 'cue', n: 0, nx: 0.5, ny: 0.78, pocketed: false },
  { id: 'b1', n: 1, nx: 0.5, ny: 0.32, pocketed: false },
  { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
];

function run(port, closeFn) {
  httpJson(port, 'POST', '/room/create', {
    openId: 'host-a',
    nick: '房主甲',
    balls: opening
  }, function (err, created) {
    if (err) return fail(closeFn, err.message);
    if (!created.ok) return fail(closeFn, 'create failed');
    console.log('CREATE ok room=' + created.roomId);

    httpJson(port, 'POST', '/room/join', {
      roomId: created.roomId,
      openId: 'guest-b',
      nick: '好友乙'
    }, function (err2, joined) {
      if (err2) return fail(closeFn, err2.message);
      if (!joined.ok) return fail(closeFn, 'join failed');

      httpJson(port, 'POST', '/room/aim', {
        roomId: created.roomId,
        openId: 'host-a',
        shotSeq: 1,
        angle: 0.8,
        power: 0.4
      }, function (errAim, aimed) {
        if (errAim) return fail(closeFn, errAim.message);
        if (!aimed.ok) return fail(closeFn, 'aim failed');
        if (aimed.state.balls[1].nx !== 0.5) {
          return fail(closeFn, 'aim must not write balls');
        }

        httpJson(port, 'POST', '/room/shot', {
          roomId: created.roomId,
          openId: 'host-a',
          shotSeq: 1,
          angle: 0.8,
          power: 0.65
        }, function (err3, fire) {
          if (err3) return fail(closeFn, err3.message);
          if (!fire.ok) return fail(closeFn, 'host fire failed ' + fire.reason);
          if (fire.angle !== 0.8 || fire.power !== 0.65) {
            return fail(closeFn, 'shot must echo angle/power');
          }
          if (fire.phase !== 'rolling') {
            return fail(closeFn, 'shot must set phase=rolling, got ' + fire.phase);
          }
          console.log('FIRE  angle=0.8 power=0.65 phase=' + fire.phase +
            ' shotSeq=' + fire.shotSeq);

          httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err4, mid) {
            if (err4) return fail(closeFn, err4.message);
            if (mid.angle !== 0.8 || mid.power !== 0.65) {
              return fail(closeFn, 'guest must read impulse immediately');
            }
            if (mid.phase !== 'rolling' || mid.state.balls[1].nx !== 0.5) {
              return fail(closeFn, 'guest mid-state must be rolling on pre-shot balls');
            }
            console.log('GUEST impulse angle=' + mid.angle + ' power=' + mid.power +
              ' phase=' + mid.phase);

            httpJson(port, 'POST', '/room/shot', {
              roomId: created.roomId,
              openId: 'host-a',
              shotSeq: 1,
              reason: 'miss',
              events: [{ type: 'miss' }],
              ballsSnapshot: [
                { id: 'cue', n: 0, nx: 0.37, ny: 0.55, pocketed: false },
                { id: 'b1', n: 1, nx: 0.61, ny: 0.27, pocketed: false },
                { id: 'b9', n: 9, nx: 0.5, ny: 0.28, pocketed: false }
              ]
            }, function (err5, settle) {
              if (err5) return fail(closeFn, err5.message);
              if (!settle.ok) return fail(closeFn, 'settle failed ' + settle.reason);
              if (settle.state.balls[0].nx !== 0.37) {
                return fail(closeFn, 'settle must write stopped snapshot');
              }
              console.log('SETTLE balls.cue.nx=' + settle.state.balls[0].nx +
                ' phase=' + settle.state.phase);

              httpJson(port, 'GET', '/room/state?roomId=' + created.roomId, null, function (err6, later) {
                if (err6) return fail(closeFn, err6.message);
                if (later.state.balls[0].nx !== 0.37 || later.state.balls[1].nx !== 0.61) {
                  return fail(closeFn, 'guest later state missing settle snapshot');
                }
                console.log('GUEST snapshot cue.nx=' + later.state.balls[0].nx +
                  ' b1.nx=' + later.state.balls[1].nx);
                if (closeFn) closeFn();
                console.log('friend watch check passed');
              });
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
