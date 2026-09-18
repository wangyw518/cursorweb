/**
 * Simple local AI. Aims at the current target center with light noise,
 * picks power from a distance table, and rarely attempts a dirty line.
 * Shots must go through Cue.strike — this module only plans.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuAi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LABEL = '简单AI';
  var FOUL_RATE = 0.08;
  var AIM_JITTER = 0.055;
  var THINK_MIN = 0.6;
  var THINK_MAX = 1.2;
  var POWER_TABLE = [
    { maxDist: 70, power: 0.36 },
    { maxDist: 120, power: 0.48 },
    { maxDist: 180, power: 0.62 },
    { maxDist: 260, power: 0.76 },
    { maxDist: 360, power: 0.88 },
    { maxDist: Infinity, power: 0.96 }
  ];

  function cfgOf(config) {
    return (config && config.ai) || {};
  }

  function powerForDistance(dist, config) {
    var table = (config && config.ai && config.ai.powerTable) || POWER_TABLE;
    var d = dist == null ? 0 : dist;
    var i;
    for (i = 0; i < table.length; i++) {
      if (d <= table[i].maxDist) return table[i].power;
    }
    return 0.96;
  }

  function thinkDelay(rng, config) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    var extra = cfgOf(config);
    var min = extra.thinkMin != null ? extra.thinkMin : THINK_MIN;
    var max = extra.thinkMax != null ? extra.thinkMax : THINK_MAX;
    if (!(max > min)) return min;
    return min + rand() * (max - min);
  }

  function rotate(ax, ay, rad) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    return { ax: ax * c - ay * s, ay: ax * s + ay * c };
  }

  function plan(cueBall, target, config, rng) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    var extra = cfgOf(config);
    if (!cueBall || !target) return { ok: false };
    var dx = target.x - cueBall.x;
    var dy = target.y - cueBall.y;
    var dist = Math.hypot(dx, dy) || 1;
    var ax = dx / dist;
    var ay = dy / dist;
    var jitter = extra.aimJitter != null ? extra.aimJitter : AIM_JITTER;
    ax += (rand() - 0.5) * jitter;
    ay += (rand() - 0.5) * jitter;
    var foulRate = extra.foulRate != null ? extra.foulRate : FOUL_RATE;
    var foulAttempt = rand() < foulRate;
    if (foulAttempt) {
      var side = rand() < 0.5 ? -1 : 1;
      var off = 0.34 + rand() * 0.28;
      var spun = rotate(ax, ay, off * side);
      ax = spun.ax;
      ay = spun.ay;
    }
    var n = Math.hypot(ax, ay) || 1;
    ax /= n;
    ay /= n;
    var power = powerForDistance(dist, config);
    if (power > 1) power = 1;
    if (power < 0.12) power = 0.12;
    var spd = ((config && config.powerSpeed) || 1280) * power;
    return {
      ok: true,
      ax: ax,
      ay: ay,
      angle: Math.atan2(ay, ax),
      power: power,
      vx: ax * spd,
      vy: ay * spd,
      dist: dist,
      foulAttempt: foulAttempt
    };
  }

  return {
    LABEL: LABEL,
    FOUL_RATE: FOUL_RATE,
    POWER_TABLE: POWER_TABLE,
    plan: plan,
    powerForDistance: powerForDistance,
    thinkDelay: thinkDelay
  };
});
