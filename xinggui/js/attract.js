(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiAttract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. Nearby-star attraction is reserved for a later milestone.
   * applyAttract is exported so the key/API stays frozen; session does not use it.
   */
  function applyAttract(/* stars, focus, radius, dt */) {
    return null;
  }

  return {
    applyAttract: applyAttract
  };
});
