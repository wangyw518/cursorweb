/**
 * Share stub: score / rank / in-game rewards only.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
      text: rank + ' ' + coins + ' 星币 · 最佳 ' + (best || 0) + ' 星币',
      disclaimer: '虚拟道具，仅限游戏内使用，不可兑换现金'
    };
  }

  function share(settle, best) {
    var payload = compose(settle, best);
    try {
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        wx.shareAppMessage({
          title: payload.text,
          query: 'from=score'
        });
      }
    } catch (err) {}
    return payload;
  }

  return {
    compose: compose,
    share: share
  };
});
