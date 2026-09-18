(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenLevel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = [
    { id: 1, target: 80, shots: 3 },
    { id: 2, target: 160, shots: 3 },
    { id: 3, target: 240, shots: 4 }
  ];

  function list(config) {
    return (config && config.levels && config.levels.length) ? config.levels : DEFAULTS;
  }

  function specById(config, id) {
    var rows = list(config);
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return rows[0];
  }

  function create(config, id, override) {
    var spec = specById(config, id || 1);
    var level = {
      id: spec.id,
      target: spec.target,
      shots: spec.shots,
      remaining: spec.shots,
      score: 0,
      won: false,
      lost: false
    };
    if (override) {
      if (override.target != null) level.target = override.target;
      if (override.shots != null) {
        level.shots = override.shots;
        level.remaining = override.shots;
      }
      if (override.remaining != null) level.remaining = override.remaining;
      if (override.score != null) level.score = override.score;
      if (override.id != null) level.id = override.id;
    }
    return level;
  }

  function addScore(level, n) {
    level.score += n || 0;
    return level.score;
  }

  function spendShot(level) {
    level.remaining = Math.max(0, level.remaining - 1);
    return level.remaining;
  }

  function evaluate(level) {
    if (level.score >= level.target) {
      level.won = true;
      level.lost = false;
      return 'win';
    }
    if (level.remaining <= 0) {
      level.lost = true;
      level.won = false;
      return 'lose';
    }
    return 'continue';
  }

  function hasNext(config, id) {
    var rows = list(config);
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return i < rows.length - 1;
    }
    return false;
  }

  function nextId(config, id) {
    var rows = list(config);
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id && rows[i + 1]) return rows[i + 1].id;
    }
    return id;
  }

  return {
    DEFAULTS: DEFAULTS,
    list: list,
    create: create,
    addScore: addScore,
    spendShot: spendShot,
    evaluate: evaluate,
    hasNext: hasNext,
    nextId: nextId
  };
});
