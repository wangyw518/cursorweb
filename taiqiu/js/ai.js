/**
 * Weak practice-AI stub. Aims at the lowest object ball with jitter.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuAi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function plan(cueBall, target, config, rng) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    if (!cueBall || !target) return { ok: false };
    var dx = target.x - cueBall.x;
    var dy = target.y - cueBall.y;
    var len = Math.hypot(dx, dy) || 1;
    var jitter = 0.16;
    var ax = dx / len + (rand() - 0.5) * jitter;
    var ay = dy / len + (rand() - 0.5) * jitter;
    var n = Math.hypot(ax, ay) || 1;
    ax /= n;
    ay /= n;
    var power = 0.58 + rand() * 0.18;
    if (power > 1) power = 1;
    var spd = ((config && config.powerSpeed) || 1280) * power;
    return {
      ok: true,
      ax: ax,
      ay: ay,
      power: power,
      vx: ax * spd,
      vy: ay * spd
    };
  }

  return { plan: plan };
});
