/**
 * Frozen GDD state machine:
 * Aim → Shot → ResolvePocket → WaitCueStop → StarZone
 * Foul skips StarZone (no 落点加成).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuFsm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PHASE = {
    Splash: 'Splash',
    Aim: 'Aim',
    Shot: 'Shot',
    ResolvePocket: 'ResolvePocket',
    WaitCueStop: 'WaitCueStop',
    StarZone: 'StarZone',
    Settle: 'Settle'
  };

  var AFTER_FIRE = [PHASE.Shot, PHASE.ResolvePocket, PHASE.WaitCueStop, PHASE.StarZone];

  function classify(shot) {
    var scratch = !!shot.scratch;
    var pocketedLowest = !!shot.pocketedLowest;
    var first = shot.firstContactId || null;
    var targetId = shot.targetId || null;
    var hitTargetFirst = !!(targetId && first === targetId);
    var noContact = !first;

    if (scratch) {
      return { legal: false, foul: true, reason: 'scratch', enterStarZone: false };
    }
    if (noContact) {
      return { legal: false, foul: true, reason: 'whiff', enterStarZone: false };
    }
    if (!hitTargetFirst) {
      return { legal: false, foul: true, reason: 'order', enterStarZone: false };
    }
    if (!pocketedLowest) {
      return { legal: false, foul: false, reason: 'miss', enterStarZone: false };
    }
    return { legal: true, foul: false, reason: 'legal', enterStarZone: true };
  }

  function nextAfterResolve(resolution) {
    if (resolution && resolution.enterStarZone) return PHASE.WaitCueStop;
    return PHASE.Settle;
  }

  function skipsStarMultiplier(resolution) {
    return !(resolution && resolution.enterStarZone);
  }

  return {
    PHASE: PHASE,
    AFTER_FIRE: AFTER_FIRE,
    classify: classify,
    nextAfterResolve: nextAfterResolve,
    skipsStarMultiplier: skipsStarMultiplier
  };
});
