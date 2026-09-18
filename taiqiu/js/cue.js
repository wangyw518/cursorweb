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

  function asBounds(space) {
    if (!space) return null;
    if (space.w > 0 && space.h > 0) {
      return {
        x: space.x || 0,
        y: space.y || 0,
        w: space.w,
        h: space.h,
        pad: space.pad == null ? 8 : space.pad
      };
    }
    if (space.width > 0 && space.height > 0) {
      return {
        x: 0,
        y: 0,
        w: space.width,
        h: space.height,
        pad: space.pad == null ? 8 : space.pad
      };
    }
    return null;
  }

  function clampToViewport(x, y, space, pad) {
    var bounds = asBounds(space);
    if (!bounds) return { x: x, y: y };
    var m = pad != null ? pad : bounds.pad;
    return {
      x: Math.max(bounds.x + m, Math.min(bounds.x + bounds.w - m, x)),
      y: Math.max(bounds.y + m, Math.min(bounds.y + bounds.h - m, y))
    };
  }

  /**
   * On-screen distance from (ox,oy) along (dx,dy) to the padded viewport edge.
   * Max power is this span (capped by dragMaxPx), so the finger never has to
   * leave the screen when the cue sits on a rail.
   */
  function pullSpan(ox, oy, dx, dy, space) {
    var bounds = asBounds(space);
    if (!bounds) return Infinity;
    var len = Math.hypot(dx, dy);
    if (len < 1e-8) return Math.min(bounds.w, bounds.h);
    var vx = dx / len;
    var vy = dy / len;
    var pad = bounds.pad;
    var t = Infinity;
    if (vx > 1e-8) t = Math.min(t, (bounds.x + bounds.w - pad - ox) / vx);
    if (vx < -1e-8) t = Math.min(t, (bounds.x + pad - ox) / vx);
    if (vy > 1e-8) t = Math.min(t, (bounds.y + bounds.h - pad - oy) / vy);
    if (vy < -1e-8) t = Math.min(t, (bounds.y + pad - oy) / vy);
    if (!(t > 0) || t === Infinity) return Math.min(bounds.w, bounds.h);
    return Math.max(8, t);
  }

  function rayToViewport(ox, oy, dx, dy, space, pad) {
    var extra = space ? { x: space.x, y: space.y, w: space.w || space.width, h: space.h || space.height, pad: pad } : null;
    return pullSpan(ox, oy, dx, dy, extra || space);
  }

  function effectiveMaxDrag(cue, cueBall, space) {
    var base = (cue && cue.dragMaxPx) || 148;
    if (!space || !cueBall) return base;
    var span = pullSpan(cueBall.x, cueBall.y, -(cue.ax || 0), -(cue.ay || 0), space);
    if (!(span > 1)) return base;
    return Math.min(base, span);
  }

  function applyDrag(cue, x, y, cueBall, space) {
    var rawDx = cueBall.x - x;
    var rawDy = cueBall.y - y;
    var rawDist = Math.hypot(rawDx, rawDy);
    if (rawDist > 0.001) {
      cue.angle = Math.atan2(rawDy, rawDx);
      cue.ax = Math.cos(cue.angle);
      cue.ay = Math.sin(cue.angle);
    }
    var pt = clampToViewport(x, y, space);
    var pullX = pt.x - cueBall.x;
    var pullY = pt.y - cueBall.y;
    var dist = Math.hypot(pullX, pullY);
    var denom = effectiveMaxDrag(cue, cueBall, space);
    if (!(denom > 1e-6)) denom = 1;
    cue.power = Math.max(0, Math.min(1, dist / denom));
    return cue;
  }

  function beginDrag(cue, x, y, cueBall, space) {
    cue.dragging = true;
    applyDrag(cue, x, y, cueBall, space);
    return cue;
  }

  function moveDrag(cue, x, y, cueBall, space) {
    if (!cue.dragging) return cue;
    applyDrag(cue, x, y, cueBall, space);
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
    pullSpan: pullSpan,
    clampToViewport: clampToViewport,
    rayToViewport: rayToViewport,
    effectiveMaxDrag: effectiveMaxDrag,
    applyDrag: applyDrag,
    beginDrag: beginDrag,
    moveDrag: moveDrag,
    cancelDrag: cancelDrag,
    endDrag: endDrag,
    stickPose: stickPose
  };
});
