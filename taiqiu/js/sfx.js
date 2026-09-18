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
  var last = { ball: 0, cushion: 0, pocket: 0, cue: 0, foul: 0 };
  var bgmOn = true;
  var bgmNodes = [];
  var bgmTimer = null;
  var LOOP_BEAT = 0.42;

  // Original 8-bar lounge hook (not a cover). Soft pentatonic so SFX stay on top.
  var BGM_NOTES = [
    392, 0, 494, 523, 494, 0, 392, 349,
    392, 494, 587, 0, 523, 494, 392, 0,
    349, 392, 440, 494, 392, 0, 330, 349,
    392, 0, 523, 494, 440, 392, 349, 392
  ];

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

  function foul() {
    return gated('foul', 180, function () {
      return tone(196, 0.10, 'square', 0.07) && tone(131, 0.16, 'triangle', 0.055, 0.05);
    });
  }

  function stopBgmVoices() {
    var i;
    for (i = 0; i < bgmNodes.length; i++) {
      try { bgmNodes[i].stop(); } catch (err) {}
    }
    bgmNodes = [];
  }

  function scheduleBgmLoop() {
    var ac = audio();
    if (!ac || !bgmOn || !ac.createOscillator) return false;
    stopBgmVoices();
    var t0 = (ac.currentTime || 0) + 0.02;
    var i;
    for (i = 0; i < BGM_NOTES.length; i++) {
      var freq = BGM_NOTES[i];
      if (!freq) continue;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      var start = t0 + i * LOOP_BEAT;
      osc.type = i % 4 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.028, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + LOOP_BEAT * 0.9);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(start);
      osc.stop(start + LOOP_BEAT);
      bgmNodes.push(osc);
    }
    var period = BGM_NOTES.length * LOOP_BEAT * 1000;
    if (bgmTimer) clearTimeout(bgmTimer);
    bgmTimer = setTimeout(function () {
      if (bgmOn) scheduleBgmLoop();
    }, period - 30);
    return true;
  }

  function startBgm() {
    bgmOn = true;
    return scheduleBgmLoop();
  }

  function stopBgm() {
    bgmOn = false;
    if (bgmTimer) {
      clearTimeout(bgmTimer);
      bgmTimer = null;
    }
    stopBgmVoices();
    return false;
  }

  function toggleBgm() {
    if (bgmOn) return stopBgm();
    return startBgm();
  }

  function reset() {
    last = { ball: 0, cushion: 0, pocket: 0, cue: 0, foul: 0 };
  }

  return {
    cue: cue,
    ball: ball,
    cushion: cushion,
    pocket: pocket,
    foul: foul,
    reset: reset,
    audio: audio,
    startBgm: startBgm,
    stopBgm: stopBgm,
    toggleBgm: toggleBgm,
    bgmEnabled: function () { return !!bgmOn; },
    setBgm: function (on) { return on === false ? stopBgm() : startBgm(); }
  };
});
