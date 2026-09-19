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

  function parseQueryString(raw) {
    var out = {};
    if (raw == null || raw === '') return out;
    if (typeof raw === 'object') {
      Object.keys(raw).forEach(function (key) {
        if (raw[key] == null) return;
        out[key] = String(raw[key]);
      });
      return out;
    }
    String(raw).replace(/^\?/, '').split('&').forEach(function (part) {
      if (!part) return;
      var kv = part.split('=');
      if (!kv[0]) return;
      var key = decodeURIComponent(kv[0]);
      var val = decodeURIComponent(kv[1] || '');
      out[key] = val;
    });
    return out;
  }

  function roomIdOf(dict) {
    if (!dict) return '';
    var id = dict.roomId || dict.roomid || dict.room_id || dict.room || dict.id || '';
    return String(id || '').trim();
  }

  function parseInvite(opts) {
    opts = opts || {};
    var query = parseQueryString(opts.query != null ? opts.query : null);
    var roomId = roomIdOf(query) || roomIdOf(opts);
    var extra = opts.referrerInfo && (opts.referrerInfo.extraData || opts.referrerInfo);
    if (!roomId && extra) {
      var extraQuery = typeof extra === 'string' ? parseQueryString(extra) : extra;
      roomId = roomIdOf(extraQuery);
      if (!roomId && extraQuery && extraQuery.query != null) {
        roomId = roomIdOf(parseQueryString(extraQuery.query));
      }
    }
    if (!roomId && opts.scene && typeof opts.scene === 'object') {
      roomId = roomIdOf(opts.scene);
    }
    return {
      roomId: roomId,
      from: query.from || (extra && extra.from) || '',
      query: query
    };
  }

  function compose(settle, best) {
    var coins = settle && settle.coins != null ? settle.coins : 0;
    var rank = best && coins >= best ? '本局最佳' : '练习成绩';
    return {
      ok: true,
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

  function roomIdFromQuery(q) {
    return roomIdOf(typeof q === 'string' ? parseQueryString(q) : q);
  }

  function roomIdFromLaunch(opts) {
    return parseInvite(opts).roomId;
  }

  function composeRoom(roomId) {
    var id = String(roomId || '').trim();
    if (!id) {
      return {
        ok: false,
        title: '星券台球',
        kind: 'room',
        roomId: '',
        query: '',
        path: '',
        reason: 'no-room-id',
        text: '来一局星券台球',
        disclaimer: DISCLAIMER
      };
    }
    return {
      ok: true,
      title: '星券台球',
      kind: 'room',
      roomId: id,
      query: 'roomId=' + id,
      path: '?roomId=' + id,
      text: '来一局星券台球',
      disclaimer: DISCLAIMER
    };
  }

  function postMessage(payload) {
    if (!payload || !payload.ok) return payload;
    if (payload.kind === 'room' && !payload.roomId) return payload;
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
    parseInvite: parseInvite,
    parseQueryString: parseQueryString,
    roomIdFromQuery: roomIdFromQuery,
    roomIdFromLaunch: roomIdFromLaunch
  };
});
