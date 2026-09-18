(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuStopDetect = api;
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

  function tick(state, moving, dt, stopHoldMs) {
    var hold = stopHoldMs == null ? 140 : stopHoldMs;
    if (!moving) {
      state.holdMs += dt * 1000;
      if (state.holdMs >= hold) state.stopped = true;
    } else {
      state.holdMs = 0;
      state.stopped = false;
    }
    return state;
  }

  return {
    create: create,
    reset: reset,
    tick: tick
  };
});
