/**
 * Share stub: score / rank / in-game rewards, plus room invite (roomId query).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DISCLAIMER = '虚拟道具，仅限游戏内使用，不可兑换现金';

  function compose(settle, best) {
    var coins = settle && settle.coins != null ? settle.coins : 0;
    var rank = best && coins >= best ? '本局最佳' : '练习成绩';
    return {
      title: '星券台球',
      kind: 'score',
      rank: rank,
      coins: coins,
      best: best || 0,
      unit: '星币',
      query: 'from=score',
      text: rank + ' ' + coins + ' 星币 · 最佳 ' + (best || 0) + ' 星币',
      disclaimer: DISCLAIMER
    };
  }

  function parseQueryString(raw) {
    var out = {};
    if (!raw) return out;
    if (typeof raw === 'object') return raw;
    String(raw).replace(/^\?/, '').split('&').forEach(function (part) {
      if (!part) return;
      var kv = part.split('=');
      if (!kv[0]) return;
      var key = decodeURIComponent(kv[0]);
      var val = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      out[key] = val;
    });
    return out;
  }

  function roomIdFromQuery(q) {
    if (!q) return '';
    if (typeof q === 'string') q = parseQueryString(q);
    var id = q.roomId || q.roomid || q.room_id || '';
    return String(id || '').trim();
  }

  function roomIdFromLaunch(opts) {
    if (!opts) return '';
    var fromQuery = roomIdFromQuery(opts.query != null ? opts.query : opts);
    if (fromQuery) return fromQuery;
    if (opts.referrerInfo && opts.referrerInfo.extraData) {
      return roomIdFromQuery(opts.referrerInfo.extraData);
    }
    return '';
  }

  function composeRoom(roomId) {
    roomId = String(roomId || '').trim();
    return {
      title: '星券台球',
      kind: 'room',
      roomId: roomId,
      query: 'roomId=' + roomId,
      path: '?roomId=' + roomId,
      text: '来一局星券台球',
      disclaimer: DISCLAIMER
    };
  }

  function postMessage(payload) {
    try {
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        wx.shareAppMessage({
          title: payload.text,
          query: payload.query || ''
        });
      }
    } catch (err) {}
    return payload;
  }

  function share(settle, best) {
    return postMessage(compose(settle, best));
  }

  function shareRoom(roomId) {
    return postMessage(composeRoom(roomId));
  }

  return {
    compose: compose,
    composeRoom: composeRoom,
    share: share,
    shareRoom: shareRoom,
    parseQueryString: parseQueryString,
    roomIdFromQuery: roomIdFromQuery,
    roomIdFromLaunch: roomIdFromLaunch
  };
});
