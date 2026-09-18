(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenStamina = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(saved, config) {
    var max = (config && config.staminaMax) || 30;
    var value = saved && saved.stamina != null ? saved.stamina : max;
    if (value > max) value = max;
    if (value < 0) value = 0;
    return {
      max: max,
      value: value,
      lastRegenAt: (saved && saved.lastRegenAt) || 0
    };
  }

  function regen(state, now, config) {
    var interval = (config && config.staminaRegenMs) || 1800000;
    if (!state.lastRegenAt) {
      state.lastRegenAt = now;
      return 0;
    }
    if (state.value >= state.max) {
      state.lastRegenAt = now;
      return 0;
    }
    var gained = Math.floor((now - state.lastRegenAt) / interval);
    if (gained <= 0) return 0;
    var room = state.max - state.value;
    if (gained > room) gained = room;
    state.value += gained;
    state.lastRegenAt += gained * interval;
    return gained;
  }

  function canStart(state, cost) {
    return state.value >= (cost == null ? 1 : cost);
  }

  /** Spend on a fired shot (session), not on level start. */
  function spend(state, cost) {
    var n = cost == null ? 1 : cost;
    if (!canStart(state, n)) return false;
    state.value -= n;
    return true;
  }

  function grant(state, n) {
    var add = n || 0;
    if (add < 0) add = 0;
    state.value = Math.min(state.max, state.value + add);
    return state.value;
  }

  return {
    create: create,
    regen: regen,
    canStart: canStart,
    spend: spend,
    grant: grant
  };
});
