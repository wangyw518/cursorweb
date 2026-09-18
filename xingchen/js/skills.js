(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIST = ['fire', 'ice', 'split'];
  var LABELS = { fire: '炎核', ice: '霜核', split: '裂核' };

  function create() {
    return {
      armed: null,
      used: { fire: false, ice: false, split: false }
    };
  }

  function reset(state) {
    state.armed = null;
    state.used.fire = false;
    state.used.ice = false;
    state.used.split = false;
    return state;
  }

  function arm(state, skill) {
    if (LIST.indexOf(skill) === -1) return { ok: false, reason: 'unknown' };
    if (state.used[skill]) return { ok: false, reason: 'used' };
    if (state.armed === skill) {
      state.armed = null;
      return { ok: true, reason: 'toggle-off', armed: null };
    }
    state.armed = skill;
    return { ok: true, reason: 'armed', armed: skill };
  }

  function consume(state) {
    var skill = state.armed;
    if (skill) state.used[skill] = true;
    state.armed = null;
    return skill;
  }

  function splitMax(config) {
    var n = (config && config.splitMaxBalls) != null ? config.splitMaxBalls : 2;
    if (n < 1) return 1;
    if (n > 2) return 2;
    return n;
  }

  function splitVelocities(vx, vy, config) {
    var angle = Math.atan2(vy, vx);
    var speed = Math.hypot(vx, vy);
    var spread = (config && config.splitAngle) != null ? config.splitAngle : 0.28;
    var scale = (config && config.splitPowerScale) != null ? config.splitPowerScale : 0.78;
    var maxBalls = splitMax(config);
    var out = [{ vx: vx, vy: vy }];
    if (maxBalls >= 2) {
      out.push({
        vx: Math.cos(angle + spread) * speed * scale,
        vy: Math.sin(angle + spread) * speed * scale
      });
    }
    return out;
  }

  function iceFriction(config) {
    var base = (config && config.friction) != null ? config.friction : 2.05;
    var mul = (config && config.iceFrictionMul) != null ? config.iceFrictionMul : 2.4;
    return base * mul;
  }

  function label(skill) {
    return LABELS[skill] || skill;
  }

  return {
    LIST: LIST,
    LABELS: LABELS,
    create: create,
    reset: reset,
    arm: arm,
    consume: consume,
    splitVelocities: splitVelocities,
    splitMax: splitMax,
    iceFriction: iceFriction,
    label: label
  };
});
