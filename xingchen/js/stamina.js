(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStamina = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function maxOf(config) {
    return (config && config.staminaMax) != null ? config.staminaMax : 30;
  }

  function clamp(n, config) {
    var max = maxOf(config);
    if (!(n >= 0)) n = 0;
    if (n > max) n = max;
    return n;
  }

  function canShoot(stamina) {
    return (stamina || 0) > 0;
  }

  function spend(stamina, config) {
    var cost = (config && config.staminaPerShot) != null ? config.staminaPerShot : 1;
    if (!canShoot(stamina)) {
      return { ok: false, stamina: clamp(stamina, config), spent: 0 };
    }
    return { ok: true, stamina: clamp(stamina - cost, config), spent: cost };
  }

  /**
   * Share-assist stub. Virtual 星力 only — no cash / withdraw copy.
   */
  function shareAssist(stamina, config) {
    var gain = (config && config.shareStamina) != null ? config.shareStamina : 1;
    var next = clamp((stamina || 0) + gain, config);
    return {
      kind: 'share',
      stub: true,
      gained: next - (stamina || 0),
      stamina: next
    };
  }

  /**
   * Rewarded-ad stub. Restores 星力. No real-money reward language.
   */
  function watchAd(stamina, config) {
    var gain = (config && config.adStamina) != null ? config.adStamina : 3;
    var next = clamp((stamina || 0) + gain, config);
    return {
      kind: 'ad',
      stub: true,
      gained: next - (stamina || 0),
      stamina: next
    };
  }

  function tryPlatformShare() {
    try {
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        wx.shareAppMessage({
          title: '奇境弹球',
          query: 'from=share'
        });
      }
    } catch (err) {}
    return true;
  }

  function tryPlatformAd() {
    try {
      if (typeof wx !== 'undefined' && wx.createRewardedVideoAd) {
        return { kind: 'ad', stub: false };
      }
    } catch (err) {}
    return { kind: 'ad', stub: true };
  }

  return {
    maxOf: maxOf,
    clamp: clamp,
    canShoot: canShoot,
    spend: spend,
    shareAssist: shareAssist,
    watchAd: watchAd,
    tryPlatformShare: tryPlatformShare,
    tryPlatformAd: tryPlatformAd
  };
});
