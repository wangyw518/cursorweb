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

  function composeRoom(roomId) {
    return {
      title: '星券台球',
      kind: 'room',
      roomId: roomId,
      query: 'roomId=' + roomId,
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
    shareRoom: shareRoom
  };
});
