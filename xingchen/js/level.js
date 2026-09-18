(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenLevel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(config) {
    var shots = (config && config.shotsPerLevel) != null ? config.shotsPerLevel : 3;
    var target = (config && config.scoreTarget) != null ? config.scoreTarget : 150;
    return {
      index: 1,
      score: 0,
      target: target,
      shotsLeft: shots,
      shotsMax: shots,
      won: false,
      over: false
    };
  }

  function consumeShot(level) {
    if (level.shotsLeft > 0) level.shotsLeft -= 1;
    return level;
  }

  /**
   * Bank a finished shot. Level ends on target reached or K shots used.
   * shotsLeft is decremented by consumeShot at fire (or here for debug shots).
   */
  function applyScore(level, shotScore) {
    var pts = shotScore == null ? 0 : shotScore;
    level.score += pts;
    if (level.score >= level.target) {
      level.won = true;
      level.over = true;
    } else if (level.shotsLeft <= 0) {
      level.won = false;
      level.over = true;
    }
    return level;
  }

  function applyShot(level, shotScore) {
    consumeShot(level);
    return applyScore(level, shotScore);
  }

  function remainLabel(level) {
    return (level.shotsMax - level.shotsLeft) + '/' + level.shotsMax;
  }

  return {
    create: create,
    consumeShot: consumeShot,
    applyScore: applyScore,
    applyShot: applyShot,
    remainLabel: remainLabel
  };
});
