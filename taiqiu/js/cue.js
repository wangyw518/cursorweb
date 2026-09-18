/**
 * Cue aim: drag pull-back, dashed aim, power, fire.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuCue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(config) {
    return {
      dragging: false,
      ax: 0,
      ay: -1,
      power: 0,
      angle: -Math.PI / 2,
      dragMaxPx: (config && config.dragMaxPx) || 128
    };
  }

  function inGrab(cueBall, x, y, slop) {
    if (!cueBall || cueBall.pocketed) return false;
    var pad = slop == null ? 40 : slop;
    return Math.hypot(x - cueBall.x, y - cueBall.y) <= cueBall.r + pad;
  }

  function applyDrag(cue, x, y, cueBall) {
    var dx = cueBall.x - x;
    var dy = cueBall.y - y;
    var dist = Math.hypot(dx, dy);
    cue.power = Math.max(0, Math.min(1, dist / cue.dragMaxPx));
    if (dist > 0.001) {
      cue.angle = Math.atan2(dy, dx);
      cue.ax = Math.cos(cue.angle);
      cue.ay = Math.sin(cue.angle);
    }
    return cue;
  }

  function beginDrag(cue, x, y, cueBall) {
    cue.dragging = true;
    applyDrag(cue, x, y, cueBall);
    return cue;
  }

  function moveDrag(cue, x, y, cueBall) {
    if (!cue.dragging) return cue;
    applyDrag(cue, x, y, cueBall);
    return cue;
  }

  function cancelDrag(cue) {
    cue.dragging = false;
    cue.power = 0;
    cue.angle = -Math.PI / 2;
    cue.ax = 0;
    cue.ay = -1;
    return cue;
  }

  function endDrag(cue, config) {
    var power = cue.power;
    var ax = cue.ax;
    var ay = cue.ay;
    var angle = cue.angle;
    cue.dragging = false;
    var min = (config && config.minPower) != null ? config.minPower : 0.12;
    if (power < min) {
      cancelDrag(cue);
      return { fired: false, power: power, angle: angle };
    }
    var spd = ((config && config.powerSpeed) || 1280) * power;
    cue.power = 0;
    return {
      fired: true,
      power: power,
      angle: angle,
      ax: ax,
      ay: ay,
      vx: ax * spd,
      vy: ay * spd
    };
  }

  function stickPose(cue, cueBall) {
    if (!cueBall) return null;
    var back = 36 + cue.power * 54;
    var len = 198;
    var tx = cueBall.x - cue.ax * (cueBall.r + 3 + cue.power * 10);
    var ty = cueBall.y - cue.ay * (cueBall.r + 3 + cue.power * 10);
    return {
      tipX: tx,
      tipY: ty,
      tailX: tx - cue.ax * len,
      tailY: ty - cue.ay * len,
      pull: back
    };
  }

  return {
    create: create,
    inGrab: inGrab,
    applyDrag: applyDrag,
    beginDrag: beginDrag,
    moveDrag: moveDrag,
    cancelDrag: cancelDrag,
    endDrag: endDrag,
    stickPose: stickPose
  };
});
