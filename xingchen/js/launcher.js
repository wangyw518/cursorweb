(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenLauncher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(dock, config) {
    return {
      x: dock.x,
      y: dock.y,
      w: dock.w || 78,
      h: dock.h || 30,
      dragMaxPx: (config && config.dragMaxPx) || 132,
      dragging: false,
      ax: 0,
      ay: -1,
      power: 0,
      angle: -Math.PI / 2
    };
  }

  function restBall(launcher, radius) {
    return { x: launcher.x, y: launcher.y, vx: 0, vy: 0, r: radius || 9 };
  }

  function inCapsule(launcher, x, y, pad) {
    var half = launcher.w * 0.5;
    var r = launcher.h * 0.5 + (pad || 0);
    var left = launcher.x - half + launcher.h * 0.5;
    var right = launcher.x + half - launcher.h * 0.5;
    var cx = Math.max(left, Math.min(x, right));
    return Math.hypot(x - cx, y - launcher.y) <= r;
  }

  function inGrab(launcher, x, y, ball, slop) {
    var bx = ball ? ball.x : launcher.x;
    var by = ball ? ball.y : launcher.y;
    var grab = (ball && ball.r ? ball.r : 9) + (slop == null ? 36 : slop);
    if (Math.hypot(x - bx, y - by) <= grab) return true;
    return inCapsule(launcher, x, y, slop == null ? 16 : slop * 0.5);
  }

  function applyDrag(launcher, x, y, ball) {
    var bx = ball ? ball.x : launcher.x;
    var by = ball ? ball.y : launcher.y;
    var dx = bx - x;
    var dy = by - y;
    var dist = Math.hypot(dx, dy);
    launcher.power = Math.max(0, Math.min(1, dist / launcher.dragMaxPx));
    if (dist > 0.001) {
      launcher.angle = Math.atan2(dy, dx);
      launcher.ax = Math.cos(launcher.angle);
      launcher.ay = Math.sin(launcher.angle);
    }
    return launcher;
  }

  function beginDrag(launcher, x, y, ball) {
    launcher.dragging = true;
    applyDrag(launcher, x, y, ball);
    return launcher;
  }

  function moveDrag(launcher, x, y, ball) {
    if (!launcher.dragging) return launcher;
    applyDrag(launcher, x, y, ball);
    return launcher;
  }

  function cancelDrag(launcher) {
    launcher.dragging = false;
    launcher.power = 0;
    launcher.angle = -Math.PI / 2;
    launcher.ax = 0;
    launcher.ay = -1;
    return launcher;
  }

  function endDrag(launcher, config) {
    var power = launcher.power;
    var angle = launcher.angle;
    var ax = launcher.ax;
    var ay = launcher.ay;
    launcher.dragging = false;
    var min = (config && config.minPower) != null ? config.minPower : 0.14;
    if (power < min) {
      cancelDrag(launcher);
      return { fired: false, power: power, angle: angle };
    }
    var spd = ((config && config.powerSpeed) || 900) * power;
    launcher.power = 0;
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

  return {
    create: create,
    restBall: restBall,
    inGrab: inGrab,
    inCapsule: inCapsule,
    beginDrag: beginDrag,
    moveDrag: moveDrag,
    applyDrag: applyDrag,
    endDrag: endDrag,
    cancelDrag: cancelDrag
  };
});
