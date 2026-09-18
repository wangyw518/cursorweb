(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIST = [
    { id: 'fire', name: '炎破', hint: '击碎一柱障石', colorKey: 'fire' },
    { id: 'ice', name: '霜凝', hint: '摩擦力增强，更易停驻', colorKey: 'ice' },
    { id: 'split', name: '双生', hint: '双球齐发', colorKey: 'split' }
  ];

  function find(id) {
    var i;
    for (i = 0; i < LIST.length; i++) {
      if (LIST[i].id === id) return LIST[i];
    }
    return null;
  }

  function toggle(current, id) {
    if (!find(id)) return current || null;
    return current === id ? null : id;
  }

  function rotate(vx, vy, deg) {
    var rad = (deg * Math.PI) / 180;
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    return { vx: vx * c - vy * s, vy: vx * s + vy * c };
  }

  /**
   * Pre-shot element. fire = break first obstacle; ice = more friction;
   * split = two balls with a small angle offset.
   */
  function plan(skillId, shot, config) {
    var frictionMul = 1;
    var breakOnHit = skillId === 'fire';
    if (skillId === 'ice') {
      frictionMul = (config && config.iceFrictionMul) || 1.75;
    }
    var balls = [{ vx: shot.vx, vy: shot.vy, kind: 'main' }];
    if (skillId === 'split') {
      var deg = (config && config.splitAngleDeg) != null ? config.splitAngleDeg : 14;
      var a = rotate(shot.vx, shot.vy, -deg * 0.5);
      var b = rotate(shot.vx, shot.vy, deg * 0.5);
      balls = [
        { vx: a.vx, vy: a.vy, kind: 'split-a' },
        { vx: b.vx, vy: b.vy, kind: 'split-b' }
      ];
    }
    return {
      skill: skillId || null,
      frictionMul: frictionMul,
      breakOnHit: breakOnHit,
      balls: balls
    };
  }

  function shotConfig(config, frictionMul) {
    var next = {};
    var key;
    for (key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) next[key] = config[key];
    }
    var base = config.friction == null ? 2.05 : config.friction;
    next.friction = base * (frictionMul == null ? 1 : frictionMul);
    return next;
  }

  return {
    LIST: LIST,
    find: find,
    toggle: toggle,
    rotate: rotate,
    plan: plan,
    shotConfig: shotConfig
  };
});
