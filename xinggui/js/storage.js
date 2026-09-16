(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. Local best-score persistence lands later.
   */
  function load() {
    return { best: 0 };
  }

  function save(/* data */) {}

  return {
    load: load,
    save: save
  };
});
