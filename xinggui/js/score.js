(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M0 stub. HUD shows a placeholder 0 until ring scoring exists.
   */
  function scoreRing(/* ring, comboWindowMs */) {
    return { score: 0, combo: 0, perfect: false };
  }

  function getScore(/* ring */) {
    return 0;
  }

  return {
    scoreRing: scoreRing,
    getScore: getScore
  };
});
