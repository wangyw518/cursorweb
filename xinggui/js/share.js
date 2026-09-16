(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. wx.shareAppMessage wiring lands later.
   */
  function share(/* payload */) {
    return false;
  }

  return {
    share: share
  };
});
