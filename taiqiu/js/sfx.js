/**
 * Tiny procedural SFX. Cue / ball / cushion / pocket.
 * Silent no-op when Web Audio is unavailable.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuSfx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ctx = null;
  var last = { ball: 0, cushion: 0, pocket: 0, cue: 0 };

  function audio() {
    if (ctx) return ctx;
    try {
      if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
        ctx = wx.createWebAudioContext();
        return ctx;
      }
    } catch (err) {}
    try {
      var AC = (typeof AudioContext !== 'undefined' && AudioContext) ||
        (typeof webkitAudioContext !== 'undefined' && webkitAudioContext);
      if (AC) ctx = new AC();
    } catch (err2) {}
    return ctx;
  }

  function tone(freq, dur, type, gain, when) {
    var ac = audio();
    if (!ac || !ac.createOscillator) return false;
    var t0 = (ac.currentTime || 0) + (when || 0);
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return true;
  }

  function gated(kind, gap, fn) {
    var now = Date.now();
    if (now - (last[kind] || 0) < gap) return false;
    last[kind] = now;
    return fn();
  }

  function cue() {
    return gated('cue', 80, function () {
      return tone(140, 0.07, 'triangle', 0.09) && tone(90, 0.09, 'sine', 0.05);
    });
  }

  function ball() {
    return gated('ball', 40, function () {
      return tone(620, 0.035, 'sine', 0.05);
    });
  }

  function cushion() {
    return gated('cushion', 50, function () {
      return tone(180, 0.05, 'square', 0.035);
    });
  }

  function pocket() {
    return gated('pocket', 60, function () {
      return tone(420, 0.08, 'sine', 0.06) && tone(240, 0.12, 'triangle', 0.04, 0.04);
    });
  }

  function reset() {
    last = { ball: 0, cushion: 0, pocket: 0, cue: 0 };
  }

  return {
    cue: cue,
    ball: ball,
    cushion: cushion,
    pocket: pocket,
    reset: reset,
    audio: audio
  };
});
