(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenEconomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function capOf(config) {
    return (config && config.staminaMax) || 30;
  }

  function clamp(n, lo, hi) {
    if (!(n >= lo)) return lo;
    if (n > hi) return hi;
    return n;
  }

  function spend(wallet, config) {
    if (!wallet || wallet.stamina <= 0) {
      return { ok: false, reason: 'empty', stamina: wallet ? wallet.stamina : 0 };
    }
    wallet.stamina -= 1;
    return { ok: true, stamina: wallet.stamina, cap: capOf(config) };
  }

  function restore(wallet, amount, config) {
    var cap = capOf(config);
    var add = amount == null ? 0 : amount;
    if (add < 0) add = 0;
    wallet.stamina = clamp((wallet.stamina || 0) + add, 0, cap);
    return { stamina: wallet.stamina, added: add, cap: cap };
  }

  function addCrystals(wallet, n) {
    var add = n > 0 ? n : 0;
    wallet.crystals = (wallet.crystals || 0) + add;
    return wallet.crystals;
  }

  /**
   * Share-assist stub. Real wx.shareAppMessage is optional.
   * Restores virtual 星力 only.
   */
  function shareAssist(wallet, config) {
    var amount = (config && config.staminaShare) != null ? config.staminaShare : 1;
    var out = restore(wallet, amount, config);
    if (typeof wx !== 'undefined' && wx.shareAppMessage) {
      try {
        wx.shareAppMessage({ title: '奇境弹球', query: '' });
      } catch (err) {}
    }
    return { kind: 'share', amount: amount, stamina: out.stamina, stub: true };
  }

  /**
   * Rewarded-ad stub. If wx.createRewardedVideoAd exists it is constructed
   * but restore always succeeds so browser / simulator remain playable.
   */
  function rewardedAd(wallet, config) {
    var amount = (config && config.staminaAd) != null ? config.staminaAd : 3;
    if (typeof wx !== 'undefined' && wx.createRewardedVideoAd) {
      try {
        wx.createRewardedVideoAd({ adUnitId: 'stub-xingchen-starlight' });
      } catch (err) {}
    }
    var out = restore(wallet, amount, config);
    return { kind: 'ad', amount: amount, stamina: out.stamina, stub: true };
  }

  return {
    capOf: capOf,
    spend: spend,
    restore: restore,
    addCrystals: addCrystals,
    shareAssist: shareAssist,
    rewardedAd: rewardedAd
  };
});
