(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiRingDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. M1 will detect closed rings with a winding-number test.
   */
  function detectClosedRing(/* starIds, stars */) {
    return {
      closed: false,
      vertices: [],
      perfect: false,
      kind: null
    };
  }

  return {
    detectClosedRing: detectClosedRing
  };
});
