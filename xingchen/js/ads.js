(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenAds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var last = null;

  /** Mock rewarded stub. No network. No wager or payout copy. */
  function watch(payload) {
    last = payload || { mock: true };
    return { ok: true, mock: true, kind: 'ad', grant: (payload && payload.grant) || 5, payload: last };
  }

  function lastAd() {
    return last;
  }

  return {
    watch: watch,
    lastAd: lastAd
  };
});
