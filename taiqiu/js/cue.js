/**
 * Cue aim: drag pull-back, dashed aim, power, fire.
 * Power is logical drag length / on-screen available radius — never gated
 * on whether the drawn stick tail leaves the screen.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuCue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_DRAG_MAX = 148;
  var EDGE_DEAD_PX = 40;
  var MIN_SPAN = 10;
  var FULL_RIM_PX = 24;

  function create(config) {
    return {
      dragging: false,
      ax: 0,
      ay: -1,
      power: 0,
      angle: -Math.PI / 2,
      dragMaxPx: (config && config.dragMaxPx) || DEFAULT_DRAG_MAX,
      edgeDeadPx: (config && config.dragEdgeDeadPx) != null ? config.dragEdgeDeadPx : EDGE_DEAD_PX,
      fullRimPx: (config && config.dragFullRimPx) != null ? config.dragFullRimPx : FULL_RIM_PX,
      rawDist: 0,
      full: false
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

  function touchBounds(space) {
    var bounds = asBounds(space);
    if (!bounds) return null;
    var pad = bounds.pad;
    if (space) {
      if (space.safePad != null) pad = Math.max(pad, space.safePad);
      if (space.safeTop != null) pad = Math.max(pad, Math.min(48, space.safeTop * 0.5 + 16));
      if (space.safeBottom != null) pad = Math.max(pad, Math.min(48, space.safeBottom + 12));
    }
    bounds.pad = pad;
    return bounds;
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
    return Math.max(MIN_SPAN, t);
  }

  function rayToViewport(ox, oy, dx, dy, space, pad) {
    var extra = space ? { x: space.x, y: space.y, w: space.w || space.width, h: space.h || space.height, pad: pad } : null;
    return pullSpan(ox, oy, dx, dy, extra || space);
  }

  function nearRim(x, y, bounds, slop) {
    if (!bounds) return false;
    var s = slop == null ? FULL_RIM_PX : slop;
    return x <= bounds.x + bounds.pad + s ||
      y <= bounds.y + bounds.pad + s ||
      x >= bounds.x + bounds.w - bounds.pad - s ||
      y >= bounds.y + bounds.h - bounds.pad - s;
  }

  /**
   * Radius that maps drag length → [0,1]. Uses the usable on-screen span in
   * the current pull direction, shrunken by a bezel dead-zone so a finger
   * that cannot reach the theoretical rim still fills the bar. A long pull
   * into the table always reaches 1 at dragMaxPx.
   */
  function availableDragRadius(cue, cueBall, space, pullDx, pullDy) {
    var maxPx = (cue && cue.dragMaxPx) || DEFAULT_DRAG_MAX;
    var dead = (cue && cue.edgeDeadPx != null) ? cue.edgeDeadPx : EDGE_DEAD_PX;
    var bounds = touchBounds(space);
    if (!cueBall || !bounds) return maxPx;
    var span = pullSpan(cueBall.x, cueBall.y, pullDx, pullDy, bounds);
    var usable = Math.max(MIN_SPAN, span - dead);
    return Math.min(maxPx, usable);
  }

  function effectiveMaxDrag(cue, cueBall, space) {
    var backX = -((cue && cue.ax) || 0);
    var backY = -((cue && cue.ay) || 0);
    return availableDragRadius(cue, cueBall, space, backX, backY);
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
    cue.rawDist = rawDist;
    var maxPx = cue.dragMaxPx || DEFAULT_DRAG_MAX;
    var denom = availableDragRadius(cue, cueBall, space, x - cueBall.x, y - cueBall.y);
    if (!(denom > 1e-6)) denom = MIN_SPAN;
    var power = rawDist / denom;
    if (rawDist >= maxPx) power = 1;
    var bounds = touchBounds(space);
    var rim = (cue.fullRimPx != null) ? cue.fullRimPx : FULL_RIM_PX;
    if (bounds && nearRim(x, y, bounds, rim) && rawDist >= Math.min(denom, 16)) {
      power = 1;
    }
    cue.power = Math.max(0, Math.min(1, power));
    cue.full = cue.power >= 0.995;
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
    cue.rawDist = 0;
    cue.full = false;
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
    cue.full = false;
    var min = (config && config.minPower) != null ? config.minPower : 0.12;
    if (power < min) {
      cancelDrag(cue);
      return { fired: false, power: power, angle: angle };
    }
    var spd = ((config && config.powerSpeed) || 1280) * power;
    cue.power = 0;
    cue.rawDist = 0;
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

  /**
   * Single fire entry: write cue-ball velocity only. Object balls stay
   * untouched; callers must not assign balls[] themselves.
   */
  function strike(cueBall, shot, config) {
    if (!cueBall || cueBall.pocketed || !shot) return { fired: false };
    var ax = shot.ax;
    var ay = shot.ay;
    var vx = shot.vx;
    var vy = shot.vy;
    var power = shot.power;
    if ((ax == null || ay == null) && vx != null && vy != null) {
      var n = Math.hypot(vx, vy) || 1;
      ax = vx / n;
      ay = vy / n;
    }
    if ((ax == null || ay == null) && shot.angle != null) {
      ax = Math.cos(shot.angle);
      ay = Math.sin(shot.angle);
    }
    if (ax == null || ay == null) return { fired: false };
    var len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    var spdMax = (config && config.powerSpeed) || 1280;
    if (power == null && vx != null && vy != null) {
      power = Math.hypot(vx, vy) / spdMax;
    }
    if (!(power > 0)) return { fired: false };
    if (power > 1) power = 1;
    var spd = spdMax * power;
    if (vx == null || vy == null) {
      vx = ax * spd;
      vy = ay * spd;
    }
    cueBall.vx = vx;
    cueBall.vy = vy;
    return {
      fired: true,
      power: power,
      ax: ax,
      ay: ay,
      vx: vx,
      vy: vy,
      angle: Math.atan2(ay, ax)
    };
  }

  function stickPose(cue, cueBall, space) {
    if (!cueBall) return null;
    var back = 36 + cue.power * 54;
    var len = 198;
    var tx = cueBall.x - cue.ax * (cueBall.r + 3 + cue.power * 10);
    var ty = cueBall.y - cue.ay * (cueBall.r + 3 + cue.power * 10);
    var tailX = tx - cue.ax * len;
    var tailY = ty - cue.ay * len;
    if (space) {
      var hit = pullSpan(tx, ty, -cue.ax, -cue.ay, space);
      if (hit < len) {
        tailX = tx - cue.ax * Math.max(24, hit);
        tailY = ty - cue.ay * Math.max(24, hit);
      }
    }
    return {
      tipX: tx,
      tipY: ty,
      tailX: tailX,
      tailY: tailY,
      pull: back
    };
  }

  return {
    create: create,
    inGrab: inGrab,
    pullSpan: pullSpan,
    clampToViewport: clampToViewport,
    rayToViewport: rayToViewport,
    availableDragRadius: availableDragRadius,
    effectiveMaxDrag: effectiveMaxDrag,
    applyDrag: applyDrag,
    beginDrag: beginDrag,
    moveDrag: moveDrag,
    cancelDrag: cancelDrag,
    endDrag: endDrag,
    strike: strike,
    stickPose: stickPose,
    nearRim: nearRim
  };
});
