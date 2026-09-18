/**
 * Friend 2P room client.
 *
 * Config flag `room.roomApiBase`:
 *   empty → LocalMockRoom (in-memory + wx / localStorage)
 *   set   → fetch the real HTTP API below
 *
 * Draft endpoints (same names for mock and real):
 *   POST /room/create → { roomId, role: 'host', state }
 *   POST /room/join   { roomId, nick?, openId? } → { role: 'guest', state }
 *   POST /room/aim    { roomId, shotSeq, angle, power, aimLine? }
 *   POST /room/shot   { roomId, shotSeq, aimAngle, power, spin?, events[], ballsSnapshot }
 *   GET  /room/state?roomId= → full authoritative snapshot
 *
 * Turn rules (authoritative on the room):
 *   legal pocket of 1–8 → same seat continues
 *   miss / foul         → switch seat
 *   first legal 9       → that seat wins
 *   waiting seat cannot submit a shot
 */
(function (root, factory) {
  var storeMod = typeof require === 'function' ? require('./roomStore') : root.TaiqiuRoomStore;
  var api = factory(storeMod);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuRoomApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (storeMod) {
  'use strict';

  var STORAGE_KEY = 'taiqiu.rooms.v1';
  var PREFIX = 'taiqiu.room.';

  var cfg = {
    roomApiBase: '',
    pollMs: 450,
    cloudEnv: '',
    cloudFn: 'taiqiuRoom'
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

  function roleOfSeat(seat) {
    return seat === 1 ? 'guest' : 'host';
  }

  function seatOfRole(role, fallback) {
    if (role === 'guest' || role === 1) return 1;
    if (role === 'host' || role === 0) return 0;
    return fallback;
  }

  function snapshotBalls(list, felt) {
    var out = [];
    var i;
    if (!list) return out;
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

  function readStorage() {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        var fromWx = wx.getStorageSync(STORAGE_KEY);
        if (fromWx && typeof fromWx === 'object') return fromWx;
        if (typeof fromWx === 'string' && fromWx) return JSON.parse(fromWx);
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (err2) {}
    return null;
  }

  function writeStorage(rooms) {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY, rooms);
        return;
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
      }
    } catch (err2) {}
  }

  function clearStorage() {
    try {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) {
        wx.removeStorageSync(STORAGE_KEY);
      } else if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY, {});
      }
    } catch (err) {}
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    } catch (err2) {}
  }

  function decorateState(state) {
    if (!state) return state;
    var next = clone(state);
    if (next.turnRole == null) next.turnRole = roleOfSeat(next.turn);
    if (next.shotSeq == null) next.shotSeq = next.seq || 0;
    if (!next.ballsSnapshot && next.balls) next.ballsSnapshot = clone(next.balls);
    if (!next.balls && next.ballsSnapshot) next.balls = clone(next.ballsSnapshot);
    if (!next.nicknames) next.nicknames = { host: '', guest: '' };
    if (!next.stars) next.stars = { host: 0, guest: 0 };
    if (next.turnOpenId == null) {
      next.turnOpenId = next.turn === 1 ? next.guestOpenId : next.hostOpenId;
    }
    return next;
  }

  function decorateCreate(res) {
    if (!res || !res.ok) return res;
    return {
      ok: true,
      action: 'create',
      roomId: res.roomId,
      role: 'host',
      seat: 0,
      token: res.token,
      deadlineAt: res.deadlineAt,
      state: decorateState(res.state)
    };
  }

  function decorateJoin(res) {
    if (!res || !res.ok) return res;
    return {
      ok: true,
      action: 'join',
      roomId: res.roomId,
      role: 'guest',
      seat: 1,
      token: res.token,
      deadlineAt: res.deadlineAt,
      state: decorateState(res.state)
    };
  }

  function decorateShot(res) {
    if (!res) return res;
    if (!res.ok) {
      if (res.state) res.state = decorateState(res.state);
      return res;
    }
    return {
      ok: true,
      action: 'shot',
      roomId: res.roomId,
      deadlineAt: res.deadlineAt,
      state: decorateState(res.state)
    };
  }

  function decorateAim(res) {
    if (!res) return res;
    if (!res.ok) {
      if (res.state) res.state = decorateState(res.state);
      return res;
    }
    return {
      ok: true,
      action: 'aim',
      roomId: res.roomId,
      deadlineAt: res.deadlineAt,
      aim: res.aim || (res.state && res.state.aim),
      state: decorateState(res.state)
    };
  }

  function decorateGet(res) {
    if (!res || !res.ok) return res;
    var state = decorateState(res.state);
    return {
      ok: true,
      action: 'state',
      roomId: res.roomId || state.roomId,
      state: state,
      turn: state.turn,
      turnRole: state.turnRole,
      turnOpenId: state.turnOpenId,
      shotSeq: state.shotSeq,
      ballsSnapshot: state.ballsSnapshot,
      matchOver: state.matchOver,
      winner: state.winner,
      winnerOpenId: state.winnerOpenId,
      guestJoined: state.guestJoined,
      deadlineAt: state.deadlineAt,
      nicknames: state.nicknames,
      stars: state.stars,
      aim: state.aim,
      foulCode: state.foulCode,
      foulHint: state.foulHint,
      pocketScore: state.pocketScore,
      zoneBonus: state.zoneBonus
    };
  }

  function normalizeShotPayload(roomId, payload) {
    payload = payload || {};
    var fromSeat = payload.fromSeat;
    if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
    var snap = payload.ballsSnapshot || payload.balls || null;
    return {
      roomId: roomId || payload.roomId,
      fromSeat: fromSeat,
      role: payload.role || (fromSeat === 1 ? 'guest' : 'host'),
      token: payload.token,
      shotSeq: payload.shotSeq,
      aimAngle: payload.aimAngle,
      power: payload.power,
      spin: payload.spin,
      events: payload.events || [],
      ballsSnapshot: snap,
      balls: snap,
      reason: payload.reason,
      scores: payload.scores,
      phase: payload.phase,
      targetN: payload.targetN,
      matchOver: payload.matchOver,
      winner: payload.winner,
      winnerOpenId: payload.winnerOpenId,
      guestJoined: payload.guestJoined,
      openId: payload.openId,
      nick: payload.nick,
      stars: payload.stars,
      foulCode: payload.foulCode,
      foulHint: payload.foulHint,
      pocketScore: payload.pocketScore,
      zoneBonus: payload.zoneBonus,
      deadlineAt: payload.deadlineAt
    };
  }

  function normalizeAimPayload(roomId, payload) {
    payload = payload || {};
    var fromSeat = payload.fromSeat;
    if (fromSeat !== 0 && fromSeat !== 1) fromSeat = seatOfRole(payload.role, null);
    return {
      roomId: roomId || payload.roomId,
      fromSeat: fromSeat,
      role: payload.role || (fromSeat === 1 ? 'guest' : 'host'),
      token: payload.token,
      openId: payload.openId,
      shotSeq: payload.shotSeq,
      angle: payload.angle != null ? payload.angle : payload.aimAngle,
      power: payload.power,
      aimLine: payload.aimLine
    };
  }

  /**
   * In-memory + wx/localStorage room that implements the draft contract.
   * Two same-origin pages share rooms through storage; Node tests share the process map.
   */
  function LocalMockRoom(options) {
    options = options || {};
    this.store = options.store || storeMod.createStore();
    this.persist = options.persist !== false;
    this.storageKey = options.storageKey || STORAGE_KEY;
    if (this.persist) this._hydrate();
  }

  LocalMockRoom.prototype._hydrate = function () {
    if (!this.persist || !this.store.hydrate) return;
    var dumped = readStorage();
    if (dumped && typeof dumped === 'object') this.store.hydrate(dumped);
  };

  LocalMockRoom.prototype._flush = function () {
    if (!this.persist || !this.store.dump) return;
    writeStorage(this.store.dump());
  };

  LocalMockRoom.prototype.create = function (payload) {
    this._hydrate();
    var res = decorateCreate(this.store.create(payload || {}));
    this._flush();
    return res;
  };

  LocalMockRoom.prototype.join = function (roomIdOrPayload) {
    this._hydrate();
    var payload = typeof roomIdOrPayload === 'string'
      ? { roomId: roomIdOrPayload }
      : (roomIdOrPayload || {});
    var res = decorateJoin(this.store.join(payload));
    this._flush();
    return res;
  };

  LocalMockRoom.prototype.aim = function (roomId, payload) {
    if (roomId && typeof roomId === 'object' && !payload) {
      payload = roomId;
      roomId = payload.roomId;
    }
    this._hydrate();
    var body = normalizeAimPayload(roomId, payload);
    var res = decorateAim(this.store.aim(body.roomId, body));
    this._flush();
    return res;
  };

  LocalMockRoom.prototype.shot = function (roomId, payload) {
    if (roomId && typeof roomId === 'object' && !payload) {
      payload = roomId;
      roomId = payload.roomId;
    }
    this._hydrate();
    var body = normalizeShotPayload(roomId, payload);
    var res = decorateShot(this.store.shot(body.roomId, body));
    this._flush();
    return res;
  };

  LocalMockRoom.prototype.state = function (roomId) {
    if (roomId && typeof roomId === 'object') roomId = roomId.roomId;
    this._hydrate();
    return decorateGet(this.store.state(roomId));
  };

  LocalMockRoom.prototype.reset = function () {
    this.store.reset();
    if (this.persist) clearStorage();
  };

  var mock = new LocalMockRoom();

  function parseBody(raw) {
    if (!raw) return { ok: false, reason: 'empty' };
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (err) { return { ok: false, reason: 'bad-json' }; }
  }

  function httpUrl(path) {
    var base = String(cfg.roomApiBase || '').replace(/\/$/, '');
    return base + path;
  }

  function httpCall(method, path, body, cb) {
    var url = httpUrl(path);
    if (!cfg.roomApiBase) return done({ ok: false, reason: 'no-room-api-base' }, cb);

    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url: url,
        method: method,
        data: method === 'GET' ? {} : (body || {}),
        header: { 'content-type': 'application/json' },
        success: function (res) { done(parseBody(res.data), cb); },
        fail: function () { done({ ok: false, reason: 'http-fail' }, cb); }
      });
      return { ok: true, pending: true, action: path };
    }

    if (typeof fetch === 'function') {
      var opts = {
        method: method,
        headers: { 'content-type': 'application/json' }
      };
      if (method !== 'GET') opts.body = JSON.stringify(body || {});
      fetch(url, opts).then(function (res) {
        return res.text();
      }).then(function (text) {
        done(parseBody(text), cb);
      }).catch(function () {
        done({ ok: false, reason: 'http-fail' }, cb);
      });
      return { ok: true, pending: true, action: path };
    }

    if (typeof require === 'function') {
      try {
        var http = require('http');
        var https = require('https');
        var u = require('url').parse(url);
        var lib = u.protocol === 'https:' ? https : http;
        var data = method === 'GET' ? '' : JSON.stringify(body || {});
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
        return { ok: true, pending: true, action: path };
      } catch (err) {
        return done({ ok: false, reason: 'http-fail' }, cb);
      }
    }
    return done({ ok: false, reason: 'http-fail' }, cb);
  }

  function usingHttp() {
    return !!(cfg.roomApiBase && String(cfg.roomApiBase).trim());
  }

  function configure(opts) {
    opts = opts || {};
    if (opts.roomApiBase != null) cfg.roomApiBase = String(opts.roomApiBase);
    else if (opts.httpUrl != null && opts.httpUrl !== '') cfg.roomApiBase = String(opts.httpUrl);
    if (opts.pollMs) cfg.pollMs = opts.pollMs;
    if (opts.cloudEnv != null) cfg.cloudEnv = String(opts.cloudEnv);
    if (opts.cloudFn) cfg.cloudFn = opts.cloudFn;
    return clone(cfg);
  }

  function create(payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    if (usingHttp()) return httpCall('POST', '/room/create', payload, cb);
    return done(mock.create(payload), cb);
  }

  function join(roomId, cb) {
    var payload = roomId && typeof roomId === 'object' ? roomId : { roomId: roomId };
    if (usingHttp()) return httpCall('POST', '/room/join', payload, cb);
    return done(mock.join(payload), cb);
  }

  function aim(roomId, payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    if (roomId && typeof roomId === 'object' && !payload) {
      payload = roomId;
      roomId = payload.roomId;
      cb = arguments[1];
    }
    var body = normalizeAimPayload(roomId, payload);
    if (usingHttp()) return httpCall('POST', '/room/aim', body, cb);
    return done(mock.aim(body.roomId, body), cb);
  }

  function shot(roomId, payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    if (roomId && typeof roomId === 'object' && !payload) {
      payload = roomId;
      roomId = payload.roomId;
      cb = arguments[1];
    }
    var body = normalizeShotPayload(roomId, payload);
    if (usingHttp()) return httpCall('POST', '/room/shot', body, cb);
    return done(mock.shot(body.roomId, body), cb);
  }

  function state(roomId, cb) {
    var id = roomId;
    if (roomId && typeof roomId === 'object') id = roomId.roomId;
    if (usingHttp()) {
      return httpCall('GET', '/room/state?roomId=' + encodeURIComponent(id), null, cb);
    }
    return done(mock.state(id), cb);
  }

  function resetMemory() {
    mock.reset();
    configure({ roomApiBase: '', httpUrl: '', cloudEnv: '' });
    cfg.roomApiBase = '';
  }

  return {
    PREFIX: PREFIX,
    STORAGE_KEY: STORAGE_KEY,
    LocalMockRoom: LocalMockRoom,
    mock: mock,
    configure: configure,
    create: create,
    join: join,
    aim: aim,
    shot: shot,
    state: state,
    createRoom: create,
    joinRoom: join,
    snapshotBalls: snapshotBalls,
    applyBalls: applyBalls,
    resetMemory: resetMemory,
    roleOfSeat: roleOfSeat,
    seatOfRole: seatOfRole,
    configOf: function () { return clone(cfg); },
    usingHttp: usingHttp
  };
});
