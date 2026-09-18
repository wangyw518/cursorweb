(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var IDS = ['fire', 'ice', 'split'];

  function defs(config) {
    return (config && config.skills) || {};
  }

  function freshUses(config) {
    var src = defs(config);
    return {
      fire: (src.fire && src.fire.usesPerLevel) || 1,
      ice: (src.ice && src.ice.usesPerLevel) || 2,
      split: (src.split && src.split.usesPerLevel) || 1
    };
  }

  function canSelect(uses, id) {
    return !!(uses && uses[id] > 0);
  }

  function toggle(selected, uses, id) {
    if (!canSelect(uses, id)) return selected;
    return selected === id ? null : id;
  }

  function consume(uses, id) {
    if (!id || !uses || !(uses[id] > 0)) return false;
    uses[id] -= 1;
    return true;
  }

  function shotConfig(base, armed) {
    var next = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) next[key] = base[key];
    }
    if (armed === 'ice') {
      next.friction = base.iceFriction == null ? 3.55 : base.iceFriction;
    }
    return next;
  }

  function splitTwin(ball, vx, vy, config) {
    var deg = (config && config.splitAngleDeg) != null ? config.splitAngleDeg : 16;
    var a = deg * Math.PI / 180;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    var rvx = vx * cos - vy * sin;
    var rvy = vx * sin + vy * cos;
    var n = Math.hypot(vx, vy) || 1;
    var px = -vy / n;
    var py = vx / n;
    return {
      x: ball.x + px * 11,
      y: ball.y + py * 11,
      vx: rvx,
      vy: rvy,
      r: ball.r,
      twin: true
    };
  }

  return {
    IDS: IDS,
    defs: defs,
    freshUses: freshUses,
    canSelect: canSelect,
    toggle: toggle,
    consume: consume,
    shotConfig: shotConfig,
    splitTwin: splitTwin
  };
});
