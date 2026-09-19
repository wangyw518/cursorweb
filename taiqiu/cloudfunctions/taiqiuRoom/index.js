/**
 * WeChat cloud function `taiqiuRoom`.
 * event.action = create | join | aim | shot | state
 *
 * Same store.dispatch as taiqiu/dev/room-server.js / js/roomStore.js.
 * Accepts both wx.callFunction payloads and HTTP-trigger wrappers so the
 * share-card path and LAN 8788 cannot drift apart.
 *
 * Optional persist to collection `taiqiu_rooms` when cloud DB is available.
 */
'use strict';

var cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (err) {
  cloud = null;
}

var storeMod;
try {
  storeMod = require('../../js/roomStore');
} catch (err) {
  storeMod = require('./roomStore');
}

var store = storeMod.createStore();

var ACTIONS = { create: true, join: true, aim: true, shot: true, state: true };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function wxOpenId() {
  if (!cloud || !cloud.getWXContext) return '';
  try {
    var ctx = cloud.getWXContext();
    return (ctx && (ctx.OPENID || ctx.openId)) || '';
  } catch (err) {
    return '';
  }
}

function assign(target, src) {
  if (!src) return target;
  var keys = Object.keys(src);
  var i;
  for (i = 0; i < keys.length; i++) target[keys[i]] = src[keys[i]];
  return target;
}

function unwrapEvent(event) {
  event = event || {};
  var extra = {};
  if (typeof event.body === 'string' && event.body) {
    try { extra = JSON.parse(event.body); } catch (err) { extra = {}; }
  } else if (event.body && typeof event.body === 'object') {
    extra = event.body;
  }
  var merged = {};
  assign(merged, event);
  assign(merged, extra);
  var qs = event.queryStringParameters || event.query || extra.query || {};
  if (typeof qs === 'string') {
    try { qs = JSON.parse(qs); } catch (err) { qs = {}; }
  }
  if (!merged.roomId && qs && (qs.roomId || qs.roomid)) {
    merged.roomId = qs.roomId || qs.roomid;
  }
  if (!merged.action) {
    var path = String(event.path || event.rawPath || event.httpPath || '');
    var method = String(event.httpMethod || event.method || '').toUpperCase();
    if (path.indexOf('/room/create') !== -1 || (method === 'POST' && path === '/api/rooms')) {
      merged.action = 'create';
    } else if (path.indexOf('/room/join') !== -1 || /\/join\/?$/.test(path)) {
      merged.action = 'join';
    } else if (path.indexOf('/room/aim') !== -1 || /\/aim\/?$/.test(path)) {
      merged.action = 'aim';
    } else if (path.indexOf('/room/shot') !== -1 || /\/shot\/?$/.test(path)) {
      merged.action = 'shot';
    } else if (path.indexOf('/room/state') !== -1 || method === 'GET') {
      merged.action = 'state';
    }
    var pathId = path.match(/\/api\/rooms\/([A-Za-z0-9]+)/);
    if (pathId && !merged.roomId) merged.roomId = pathId[1];
  }
  return merged;
}

function withIdentity(event) {
  event = event || {};
  if (!event.openId && !event.openid) {
    var fromWx = wxOpenId();
    if (fromWx) event.openId = fromWx;
  }
  return event;
}

function dispatchRoom(event, usedStore) {
  event = withIdentity(unwrapEvent(event));
  var action = event.action;
  var target = usedStore || store;
  if (ACTIONS[action]) return target.dispatch(action, event);
  return { ok: false, reason: 'unknown-action', action: action };
}

function col() {
  if (!cloud || !cloud.database) return null;
  try { return cloud.database().collection('taiqiu_rooms'); } catch (err) { return null; }
}

async function read(roomId) {
  if (!roomId) return null;
  var id = storeMod.normalizeRoomId ? storeMod.normalizeRoomId(roomId) : String(roomId);
  var c = col();
  if (c) {
    try {
      var res = await c.doc(id).get();
      if (res && res.data) return res.data;
    } catch (err) {}
  }
  return null;
}

async function write(roomId, state) {
  if (!roomId || !state) return;
  var id = storeMod.normalizeRoomId ? storeMod.normalizeRoomId(roomId) : String(roomId);
  var c = col();
  if (c) {
    try { await c.doc(id).set({ data: state }); } catch (err) {}
  }
}

exports.main = async function (event) {
  event = withIdentity(unwrapEvent(event || {}));
  var roomId = event.roomId || event.room || event.id;
  if (event.action !== 'create' && roomId) {
    var existing = await read(roomId);
    if (existing) {
      var dump = store.dump();
      dump[roomId] = clone(existing);
      store.hydrate(dump);
    }
  }
  var result = dispatchRoom(event, store);
  if (result && result.roomId && result.state) {
    await write(result.roomId, result.state);
  }
  return result;
};

exports.dispatch = dispatchRoom;
exports.unwrapEvent = unwrapEvent;
exports._store = store;
exports._createStore = storeMod.createStore;
exports._storeMod = storeMod;
