/**
 * HTTP room server for taiqiu 2P.
 *
 * Draft endpoints:
 *   POST /room/create
 *   POST /room/join
 *   POST /room/shot
 *   GET  /room/state?roomId=
 *
 * Legacy aliases (same store):
 *   POST /api/rooms
 *   POST /api/rooms/:id/join
 *   POST /api/rooms/:id/shot
 *   GET  /api/rooms/:id
 *
 *   node taiqiu/dev/room-server.js [port]
 */
'use strict';

var http = require('http');
var urlMod = require('url');
var storeMod = require('../js/roomStore');

function send(res, code, body) {
  var json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(json);
}

function readBody(req, cb) {
  var chunks = '';
  req.on('data', function (c) { chunks += c; });
  req.on('end', function () {
    if (!chunks) return cb({});
    try { cb(JSON.parse(chunks)); } catch (err) { cb(null); }
  });
}

function decorateCreate(res) {
  if (!res || !res.ok) return res;
  res.role = 'host';
  return res;
}

function decorateJoin(res) {
  if (!res || !res.ok) return res;
  res.role = 'guest';
  return res;
}

function createHandler(store) {
  store = store || storeMod.createStore();

  function handle(req, res) {
    if (req.method === 'OPTIONS') return send(res, 204, { ok: true });
    var parsed = urlMod.parse(req.url || '', true);
    var url = parsed.pathname || '';

    if (req.method === 'POST' && url === '/room/create') {
      return readBody(req, function (body) {
        if (!body) return send(res, 400, { ok: false, reason: 'bad-json' });
        send(res, 200, decorateCreate(store.dispatch('create', body)));
      });
    }
    if (req.method === 'POST' && url === '/room/join') {
      return readBody(req, function (body) {
        if (!body) return send(res, 400, { ok: false, reason: 'bad-json' });
        send(res, 200, decorateJoin(store.dispatch('join', body)));
      });
    }
    if (req.method === 'POST' && url === '/room/shot') {
      return readBody(req, function (body) {
        if (!body) return send(res, 400, { ok: false, reason: 'bad-json' });
        send(res, 200, store.dispatch('shot', body));
      });
    }
    if (req.method === 'GET' && url === '/room/state') {
      var roomId = parsed.query && parsed.query.roomId;
      return send(res, 200, store.dispatch('state', { roomId: roomId }));
    }

    if (req.method === 'POST' && url === '/api/rooms') {
      return readBody(req, function (body) {
        if (!body) return send(res, 400, { ok: false, reason: 'bad-json' });
        send(res, 200, decorateCreate(store.dispatch('create', body)));
      });
    }
    var join = url.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/);
    if (req.method === 'POST' && join) {
      return readBody(req, function (body) {
        body = body || {};
        body.roomId = join[1];
        send(res, 200, decorateJoin(store.dispatch('join', body)));
      });
    }
    var shot = url.match(/^\/api\/rooms\/([A-Z0-9]+)\/shot$/);
    if (req.method === 'POST' && shot) {
      return readBody(req, function (body) {
        if (!body) return send(res, 400, { ok: false, reason: 'bad-json' });
        body.roomId = shot[1];
        send(res, 200, store.dispatch('shot', body));
      });
    }
    var get = url.match(/^\/api\/rooms\/([A-Z0-9]+)$/);
    if (req.method === 'GET' && get) {
      return send(res, 200, store.dispatch('state', { roomId: get[1] }));
    }
    send(res, 404, { ok: false, reason: 'not-found' });
  }

  return handle;
}

function listen(port, store, cb) {
  if (typeof store === 'function') { cb = store; store = null; }
  var used = store || storeMod.createStore();
  var server = http.createServer(createHandler(used));
  server.listen(port || 0, '127.0.0.1', function () {
    if (cb) cb(server.address());
  });
  return { server: server, store: used };
}

if (require.main === module) {
  var port = parseInt(process.argv[2], 10) || 8788;
  listen(port, function (addr) {
    console.log('[taiqiu] room API http://127.0.0.1:' + addr.port);
    console.log('  POST /room/create');
    console.log('  POST /room/join');
    console.log('  POST /room/shot');
    console.log('  GET  /room/state?roomId=');
  });
}

module.exports = {
  createHandler: createHandler,
  listen: listen
};
