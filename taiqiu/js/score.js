/**
 * Virtual 星币 only. Star multiplier 1/1.5/2/3 applies after a valid pocket.
 * Foul skips the full star multiplier (never reads StarZone as a payout).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DISCLAIMER = '虚拟道具，仅限游戏内使用，不可兑换现金';
  var UNIT = '星币';

  function emptyAward(reason) {
    return {
      coins: 0,
      points: 0,
      unit: UNIT,
      reason: reason,
      legal: false,
      foul: reason !== 'miss',
      starApplied: false,
      starMultiplier: 1,
      zone: null,
      zoneLabel: '',
      quality: {
        pocket: 0,
        cushions: 0,
        firstContact: false,
        multiplier: 1
      },
      props: [],
      skinProgress: 0,
      disclaimer: DISCLAIMER
    };
  }

  function settle(input, config) {
    var cfg = config || {};
    var resolution = input.resolution || null;
    var pocketedLowest = !!input.pocketedLowest;
    var scratch = !!input.scratch;
    var foul = !!(input.foul || (resolution && resolution.foul) || scratch);
    var legal = resolution ? !!resolution.legal : (pocketedLowest && !foul);
    var reason = (resolution && resolution.reason) ||
      (scratch ? 'scratch' : (pocketedLowest ? 'legal' : 'miss'));
    var zone = input.zone || null;
    var applyStar = !!(input.applyStar && legal && !foul);

    if (!legal || foul || !pocketedLowest) {
      var denied = emptyAward(reason);
      denied.foul = foul;
      denied.legal = false;
      denied.starApplied = false;
      return denied;
    }

    var base = cfg.baseXingbi == null ? 40 : cfg.baseXingbi;
    var starMul = 1;
    if (applyStar && zone && zone.multiplier) starMul = zone.multiplier;
    var coins = Math.round(base * starMul);

    return {
      coins: coins,
      points: coins,
      unit: UNIT,
      reason: 'legal',
      legal: true,
      foul: false,
      starApplied: applyStar,
      starMultiplier: starMul,
      zone: zone,
      zoneLabel: zone ? (zone.label || zone.name || '') : '',
      quality: {
        pocket: base,
        cushions: input.cushions || 0,
        firstContact: !!input.firstContactIsTarget,
        multiplier: starMul
      },
      props: zone
        ? [{ id: zone.kind, name: zone.label || zone.name, amount: starMul, unit: '星域倍率' }]
        : [],
      skinProgress: 0,
      disclaimer: DISCLAIMER
    };
  }

  function gapToBest(score, best) {
    var s = score || 0;
    var b = best || 0;
    if (s > b) return { isNew: true, gap: 0, best: s };
    return { isNew: false, gap: b - s, best: b };
  }

  return {
    DISCLAIMER: DISCLAIMER,
    UNIT: UNIT,
    emptyAward: emptyAward,
    settle: settle,
    gapToBest: gapToBest
  };
});
