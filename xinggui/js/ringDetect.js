(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiRingDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. Closed-ring / perfect-ring scoring lands in a later milestone.
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
