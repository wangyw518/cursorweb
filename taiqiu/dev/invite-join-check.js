#!/usr/bin/env node
/**
 * Dual-client invite check against the room server.
 *
 *   node taiqiu/dev/invite-join-check.js            # start ephemeral server
 *   node taiqiu/dev/invite-join-check.js 8788        # attach to a running 8788
 *
 * A create → B join same roomId (nicks + host first).
 * Bad roomId join → ok:false reason=missing.
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

function run(port, closeFn) {
  httpJson(port, 'POST', '/room/create', {
    openId: 'host-a',
    nick: '房主甲'
  }, function (err, created) {
    if (err) throw err;
    if (!created.ok || !created.roomId) {
      throw new Error('create did not return roomId: ' + JSON.stringify(created));
    }
    var shareQuery = created.share && created.share.query;
    console.log('CREATE ok roomId=' + created.roomId);
    console.log('  share.query=' + shareQuery);
    console.log('  share.path=' + (created.share && created.share.path));
    console.log('  preview: ?roomId=' + created.roomId + '&api=http://127.0.0.1:' + port);
    httpJson(port, 'POST', '/room/join', {
      roomId: created.roomId,
      openId: 'guest-b',
      nick: '好友乙'
    }, function (err2, joined) {
      if (err2) throw err2;
      if (!joined.ok) throw new Error('join failed: ' + JSON.stringify(joined));
      console.log('JOIN   ok nicks=' + JSON.stringify(joined.state.nicknames) +
        ' turnOpenId=' + joined.state.turnOpenId + ' turn=' + joined.state.turn);
      if (joined.state.nicknames.host !== '房主甲' || joined.state.nicknames.guest !== '好友乙') {
        throw new Error('nicks not visible on both seats');
      }
      if (joined.state.turn !== 0 || joined.state.turnOpenId !== 'host-a') {
        throw new Error('host must go first');
      }
      httpJson(port, 'POST', '/room/join', { roomId: 'NOPE12', openId: 'lost' }, function (err3, missing) {
        if (err3) throw err3;
        if (missing.ok || missing.reason !== 'missing') {
          throw new Error('bad roomId should be missing: ' + JSON.stringify(missing));
        }
        console.log('JOIN   missing reason=' + missing.reason);
        if (closeFn) closeFn();
        console.log('invite-join-check passed');
      });
    });
  });
}

var attach = parseInt(process.argv[2], 10);
if (attach > 0) {
  run(attach, null);
} else {
  var started = roomServer.listen({ port: 0, host: '127.0.0.1' }, function (addr) {
    run(addr.port, function () { started.server.close(); });
  });
}
