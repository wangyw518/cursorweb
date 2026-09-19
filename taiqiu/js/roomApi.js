/**
 * Friend 2P room client.
 *
 * Config flag `room.roomApiBase`:
 *   empty → LocalMockRoom (in-memory + wx / localStorage)
 *   set   → fetch the real HTTP API below
 *
 * Draft endpoints (same names for mock and real):
 *   POST /room/create → { roomId, role: 'host', state }
 *   POST /room/join   { roomId } → { role: 'guest', state }
 *   POST /room/shot   { roomId, shotSeq, aimAngle, power, spin?, events[], ballsSnapshot }
 *   POST /room/aim    { roomId, shotSeq, angle, power, aimLine? } (Aim|Pull only; no balls[])
 *   GET  /room/state?roomId=&sinceSeq= → snapshot; Aim/Pull + sinceSeq>=shotSeq strips object balls
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
    aimPollMs: 140,
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
    if (next.aimSeq == null) next.aimSeq = next.aim && next.aim.aimSeq != null ? next.aim.aimSeq : 0;
    if (!next.ballsSnapshot && next.balls) next.ballsSnapshot = clone(next.balls);
    if (!next.balls && next.ballsSnapshot) next.balls = clone(next.ballsSnapshot);
    if (!next.names) next.names = ['房主', '好友'];
    if (!next.nicknames) next.nicknames = { host: next.names[0], guest: next.names[1] };
    if (next.deadlineAt == null) next.deadlineAt = next.aimDeadlineAt || 0;
    if (next.aimDeadlineAt == null) next.aimDeadlineAt = next.deadlineAt || 0;
    if (next.turnOpenId == null) next.turnOpenId = '';
    if (next.aim && next.aim.angle == null && next.aim.aimAngle != null) next.aim.angle = next.aim.aimAngle;
    if (next.aim && next.aim.aimAngle == null && next.aim.angle != null) next.aim.aimAngle = next.aim.angle;
    if (next.phase === 'Pull') next.phase = 'Aim';
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
      shotSeq: state.shotSeq,
      ballsSnapshot: state.ballsSnapshot,
      matchOver: state.matchOver,
      winner: state.winner,
      guestJoined: state.guestJoined,
      names: state.names,
      nicknames: state.nicknames,
      aim: state.aim,
      aimSeq: state.aimSeq,
      aimDeadlineAt: state.aimDeadlineAt,
      deadlineAt: state.deadlineAt,
      winnerOpenId: state.winnerOpenId,
      stars: state.stars,
      foulCode: state.foulCode,
      foulHint: state.foulHint,
      turnOpenId: state.turnOpenId,
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
      guestJoined: payload.guestJoined,
      names: payload.names,
      nick: payload.nick,
      displayName: payload.displayName,
      openId: payload.openId,
      winnerOpenId: payload.winnerOpenId,
      pocketScore: payload.pocketScore,
      zoneBonus: payload.zoneBonus,
      nextDeadlineAt: payload.nextDeadlineAt
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
    var res = this.store.aim(roomId, payload || {});
    if (res && res.state) res.state = decorateState(res.state);
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

  LocalMockRoom.prototype.state = function (roomId, opts) {
    if (roomId && typeof roomId === 'object' && roomId.roomId) {
      opts = opts || roomId;
      roomId = roomId.roomId;
    }
    this._hydrate();
    return decorateGet(this.store.state(roomId, opts || {}));
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
        success: function (res) {
          var bodyRes = parseBody(res && res.data);
          if (res && res.statusCode >= 400 && (!bodyRes || bodyRes.ok == null)) {
            done({ ok: false, reason: 'http-fail', status: res.statusCode }, cb);
            return;
          }
          done(bodyRes, cb);
        },
        fail: function (err) {
          done({
            ok: false,
            reason: 'http-fail',
            detail: err && (err.errMsg || err.message) || 'wx.request fail'
          }, cb);
        }
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
      }).catch(function (err) {
        done({ ok: false, reason: 'http-fail', detail: err && err.message }, cb);
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
        req.on('error', function (err) {
          done({ ok: false, reason: 'http-fail', detail: err && err.message }, cb);
        });
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

  var cloudReady = false;

  function usingCloud() {
    return !usingHttp() &&
      !!(cfg.cloudEnv && String(cfg.cloudEnv).trim()) &&
      typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
  }

  function ensureCloud() {
    if (cloudReady) return true;
    try {
      wx.cloud.init({ env: cfg.cloudEnv, traceUser: true });
      cloudReady = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function cloudCall(action, payload, cb) {
    if (!ensureCloud()) return done({ ok: false, reason: 'cloud-fail' }, cb);
    wx.cloud.callFunction({
      name: cfg.cloudFn || 'taiqiuRoom',
      data: Object.assign({ action: action }, payload || {}),
      success: function (res) { done(parseBody(res && res.result), cb); },
      fail: function (err) {
        done({
          ok: false,
          reason: 'cloud-fail',
          detail: err && (err.errMsg || err.message)
        }, cb);
      }
    });
    return { ok: true, pending: true, action: action };
  }

  function configure(opts) {
    opts = opts || {};
    if (opts.roomApiBase != null) cfg.roomApiBase = String(opts.roomApiBase);
    else if (opts.httpUrl != null && opts.httpUrl !== '') cfg.roomApiBase = String(opts.httpUrl);
    if (opts.pollMs) cfg.pollMs = opts.pollMs;
    if (opts.aimPollMs) cfg.aimPollMs = opts.aimPollMs;
    if (opts.cloudEnv != null) cfg.cloudEnv = String(opts.cloudEnv);
    if (opts.cloudFn) cfg.cloudFn = opts.cloudFn;
    return clone(cfg);
  }

  function create(payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    if (usingHttp()) return httpCall('POST', '/room/create', payload, cb);
    if (usingCloud()) return cloudCall('create', payload, cb);
    return done(mock.create(payload), cb);
  }

  function join(roomId, cb) {
    var payload = { roomId: roomId };
    if (roomId && typeof roomId === 'object') {
      payload = {
        roomId: roomId.roomId || roomId.room || roomId.id,
        room: roomId.room || roomId.roomId || roomId.id,
        name: roomId.name || roomId.guestName || roomId.nick || roomId.displayName,
        nick: roomId.nick || roomId.displayName || roomId.name,
        displayName: roomId.displayName || roomId.nick || roomId.name,
        openId: roomId.openId || roomId.openid
      };
    }
    if (usingHttp()) return httpCall('POST', '/room/join', payload, cb);
    if (usingCloud()) return cloudCall('join', payload, cb);
    return done(mock.join(payload), cb);
  }

  function aim(roomId, payload, cb) {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    if (roomId && typeof roomId === 'object' && !payload) {
      payload = roomId;
      roomId = payload.roomId;
      cb = arguments[1];
    }
    var body = payload || {};
    body.roomId = roomId || body.roomId;
    if (usingHttp()) return httpCall('POST', '/room/aim', body, cb);
    if (usingCloud()) return cloudCall('aim', body, cb);
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
    if (usingCloud()) return cloudCall('shot', body, cb);
    return done(mock.shot(body.roomId, body), cb);
  }

  function state(roomId, cb) {
    var id = roomId;
    var sinceSeq;
    if (typeof cb !== 'function' && arguments.length >= 2 && typeof arguments[1] === 'object') {
      sinceSeq = arguments[1] && arguments[1].sinceSeq;
      cb = arguments[2];
    }
    if (roomId && typeof roomId === 'object') {
      id = roomId.roomId;
      if (roomId.sinceSeq != null) sinceSeq = roomId.sinceSeq;
    }
    if (usingHttp()) {
      var q = '/room/state?roomId=' + encodeURIComponent(id);
      if (sinceSeq != null && sinceSeq !== '') q += '&sinceSeq=' + encodeURIComponent(sinceSeq);
      return httpCall('GET', q, null, cb);
    }
    if (usingCloud()) return cloudCall('state', { roomId: id, sinceSeq: sinceSeq }, cb);
    return done(mock.state(id, { sinceSeq: sinceSeq }), cb);
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
    usingHttp: usingHttp,
    usingCloud: usingCloud
  };
});
