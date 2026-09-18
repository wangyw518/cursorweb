/**
 * WeChat friend 2P client.
 * Transports: memory (tests / same device), HTTP room server, wx.cloud.callFunction.
 * APIs: create / join / shot / state. Balls are felt-normalized (nx, ny).
 */
(function (root, factory) {
  var storeMod = typeof require === 'function' ? require('./roomStore') : root.TaiqiuRoomStore;
  var api = factory(storeMod);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (storeMod) {
  'use strict';

  var PREFIX = 'taiqiu.room.';
  var store = storeMod.createStore();
  var cfg = {
    transport: 'memory',
    httpUrl: '',
    cloudEnv: '',
    cloudFn: 'taiqiuRoom',
    pollMs: 450
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function done(result, cb) {
    if (typeof cb === 'function') {
      try { cb(result); } catch (err) {}
    }
    return result;
  }

  function detectTransport(opts) {
    opts = opts || {};
    if (opts.transport) return opts.transport;
    if (opts.httpUrl) return 'http';
    if (opts.cloudEnv) return 'cloud';
    return 'memory';
  }

  function configure(opts) {
    opts = opts || {};
    if (opts.httpUrl != null) cfg.httpUrl = String(opts.httpUrl);
    if (opts.cloudEnv != null) cfg.cloudEnv = String(opts.cloudEnv);
    if (opts.cloudFn) cfg.cloudFn = opts.cloudFn;
    if (opts.pollMs) cfg.pollMs = opts.pollMs;
    cfg.transport = detectTransport(opts);
    return clone(cfg);
  }

  function snapshotBalls(list, felt) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      var row = {
        id: b.id,
        n: b.n,
        x: b.x,
        y: b.y,
        vx: 0,
        vy: 0,
        pocketed: !!b.pocketed
      };
      if (felt && felt.w) {
        row.nx = (b.x - felt.x) / felt.w;
        row.ny = (b.y - felt.y) / felt.h;
      }
      out.push(row);
    }
    return out;
  }

  function applyBalls(list, snap, felt) {
    if (!snap || !list) return list;
    var map = {};
    var i;
    for (i = 0; i < snap.length; i++) map[snap[i].id] = snap[i];
    for (i = 0; i < list.length; i++) {
      var s = map[list[i].id];
      if (!s) continue;
      if (felt && felt.w && s.nx != null && s.ny != null) {
        list[i].x = felt.x + s.nx * felt.w;
        list[i].y = felt.y + s.ny * felt.h;
      } else {
        if (s.x != null) list[i].x = s.x;
        if (s.y != null) list[i].y = s.y;
      }
      list[i].vx = 0;
      list[i].vy = 0;
      list[i].pocketed = !!s.pocketed;
    }
    return list;
  }

  function parseBody(raw) {
    if (!raw) return { ok: false, reason: 'empty' };
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (err) { return { ok: false, reason: 'bad-json' }; }
  }

  function httpCall(action, payload, cb) {
    var base = String(cfg.httpUrl || '').replace(/\/$/, '');
    if (!base) return done({ ok: false, reason: 'no-http-url', pending: false }, cb);
    var path = '/api/rooms';
    var method = 'POST';
    if (action === 'join') path = '/api/rooms/' + encodeURIComponent(payload.roomId) + '/join';
    else if (action === 'shot') path = '/api/rooms/' + encodeURIComponent(payload.roomId) + '/shot';
    else if (action === 'state') {
      path = '/api/rooms/' + encodeURIComponent(payload.roomId);
      method = 'GET';
    }
    var url = base + path;
    var body = payload || {};

    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url: url,
        method: method,
        data: method === 'GET' ? {} : body,
        header: { 'content-type': 'application/json' },
        success: function (res) { done(parseBody(res.data), cb); },
        fail: function () { done({ ok: false, reason: 'http-fail' }, cb); }
      });
      return { ok: true, pending: true, action: action };
    }

    if (typeof require === 'function') {
      try {
        var http = require('http');
        var https = require('https');
        var u = require('url').parse(url);
        var lib = u.protocol === 'https:' ? https : http;
        var data = method === 'GET' ? '' : JSON.stringify(body);
        var req = lib.request({
          hostname: u.hostname,
          port: u.port,
          path: u.path,
          method: method,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(data)
          }
        }, function (res) {
          var chunks = '';
          res.on('data', function (c) { chunks += c; });
          res.on('end', function () { done(parseBody(chunks), cb); });
        });
        req.on('error', function () { done({ ok: false, reason: 'http-fail' }, cb); });
        if (data) req.write(data);
        req.end();
        return { ok: true, pending: true, action: action };
      } catch (err) {
        return done({ ok: false, reason: 'http-fail' }, cb);
      }
    }
    return done({ ok: false, reason: 'http-fail' }, cb);
  }

  function cloudCall(action, payload, cb) {
    try {
      if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
        return done({ ok: false, reason: 'no-cloud' }, cb);
      }
      wx.cloud.callFunction({
        name: cfg.cloudFn || 'taiqiuRoom',
        data: Object.assign({ action: action }, payload || {}),
        success: function (res) {
          var result = res && res.result ? res.result : { ok: false, reason: 'cloud-empty' };
          done(result, cb);
        },
        fail: function () { done({ ok: false, reason: 'cloud-fail' }, cb); }
      });
      return { ok: true, pending: true, action: action };
    } catch (err) {
      return done({ ok: false, reason: 'cloud-fail' }, cb);
    }
  }

  function call(action, payload, cb) {
    if (cfg.transport === 'http') return httpCall(action, payload, cb);
    if (cfg.transport === 'cloud') return cloudCall(action, payload, cb);
    return done(store.dispatch(action, payload), cb);
  }

  function createRoom(payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    return call('create', payload || {}, cb);
  }

  function joinRoom(roomId, cb) {
    return call('join', { roomId: roomId }, cb);
  }

  function shot(roomId, payload, cb) {
    payload = payload || {};
    payload.roomId = roomId;
    return call('shot', payload, cb);
  }

  function state(roomId, cb) {
    return call('state', { roomId: roomId }, cb);
  }

  function pushState(roomId, patch) {
    patch = patch || {};
    return shot(roomId, {
      fromSeat: patch.fromSeat != null ? patch.fromSeat : 0,
      token: patch.token,
      reason: patch.reason || 'sync',
      balls: patch.balls,
      scores: patch.scores,
      turn: patch.turn,
      phase: patch.phase,
      targetN: patch.targetN,
      matchOver: patch.matchOver,
      winner: patch.winner,
      guestJoined: patch.guestJoined
    });
  }

  function pullState(roomId) {
    var res = state(roomId);
    return res && res.state ? res.state : null;
  }

  function resetMemory() {
    store.reset();
    configure({ transport: 'memory', httpUrl: '', cloudEnv: '' });
  }

  function initCloud(env) {
    if (!env) return false;
    cfg.cloudEnv = env;
    cfg.transport = 'cloud';
    try {
      if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.init) {
        wx.cloud.init({ env: env, traceUser: true });
        return true;
      }
    } catch (err) {}
    return false;
  }

  return {
    PREFIX: PREFIX,
    configure: configure,
    initCloud: initCloud,
    createRoom: createRoom,
    joinRoom: joinRoom,
    shot: shot,
    state: state,
    pushState: pushState,
    pullState: pullState,
    snapshotBalls: snapshotBalls,
    applyBalls: applyBalls,
    resetMemory: resetMemory,
    store: store,
    configOf: function () { return clone(cfg); }
  };
});
