(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var last = null;

  /**
   * M1 mock. Records the payload; does not open a native share sheet.
   */
  function share(payload) {
    last = payload || { mock: true };
    return { ok: true, mock: true, payload: last };
  }

  function lastShare() {
    return last;
  }

  return {
    share: share,
    lastShare: lastShare
  };
});
