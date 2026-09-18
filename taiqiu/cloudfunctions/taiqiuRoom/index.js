/**
 * WeChat cloud function `taiqiuRoom`.
 * event.action = create | join | aim | shot | state
 *
 * Same contract as taiqiu/dev/room-server.js / js/roomStore.js.
 * In-memory Map only (no Redis / new DB). Optional wx OPENID is merged
 * onto the event when the client omitted openId.
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

function wxOpenId() {
  if (!cloud || !cloud.getWXContext) return '';
  try {
    var ctx = cloud.getWXContext();
    return (ctx && (ctx.OPENID || ctx.openId)) || '';
  } catch (err) {
    return '';
  }
}

function withIdentity(event) {
  event = event || {};
  if (!event.openId && !event.openid) {
    var fromWx = wxOpenId();
    if (fromWx) event.openId = fromWx;
  }
  return event;
}

exports.main = async function (event) {
  event = withIdentity(event);
  var action = event.action;
  if (action === 'create' || action === 'join' || action === 'aim' || action === 'shot' || action === 'state') {
    return store.dispatch(action, event);
  }
  return { ok: false, reason: 'unknown-action', action: action };
};

exports._store = store;
exports._createStore = storeMod.createStore;
