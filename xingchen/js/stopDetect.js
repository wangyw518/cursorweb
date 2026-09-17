(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStopDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create() {
    return { holdMs: 0, stopped: false };
  }

  function reset(state) {
    state.holdMs = 0;
    state.stopped = false;
    return state;
  }

  function speedOf(body) {
    return Math.hypot(body.vx || 0, body.vy || 0);
  }

  /**
   * Stop when |v| < stopSpeed for stopHoldMs (default 120ms).
   */
  function tick(state, speed, dt, stopSpeed, stopHoldMs) {
    var limit = stopSpeed == null ? 12 : stopSpeed;
    var hold = stopHoldMs == null ? 120 : stopHoldMs;
    if (speed < limit) {
      state.holdMs += dt * 1000;
      if (state.holdMs >= hold) state.stopped = true;
    } else {
      state.holdMs = 0;
      state.stopped = false;
    }
    return state;
  }

  function isStopped(state) {
    return !!(state && state.stopped);
  }

  return {
    create: create,
    reset: reset,
    tick: tick,
    speedOf: speedOf,
    isStopped: isStopped
  };
});
