(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var last = null;

  /** Mock share. Does not open a native sheet. Grants stamina via session. */
  function share(payload) {
    last = payload || { mock: true };
    return { ok: true, mock: true, kind: 'share', grant: (payload && payload.grant) || 1, payload: last };
  }

  function lastShare() {
    return last;
  }

  return {
    share: share,
    lastShare: lastShare
  };
});
