/**
 * Virtual 星币 only. Legal pocket: 得分加成 + optional 落点加成 (StarZone).
 * Foul skips 落点加成. No lottery / cash wording.
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
      pocketBonus: 0,
      landingBonus: 0,
      zone: null,
      zoneLabel: '',
      quality: {
        pocket: 0,
        cushions: 0,
        firstContact: false
      },
      props: [],
      skinProgress: 0,
      disclaimer: DISCLAIMER
    };
  }

  function zoneBonus(zone, config) {
    if (!zone) return 0;
    if (zone.bonusXingbi != null) return zone.bonusXingbi;
    var list = (config && config.starZones) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === zone.kind) return list[i].bonusXingbi || 0;
    }
    return 0;
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
    var applyLanding = !!(input.applyStar && legal && !foul);

    if (!legal || foul) {
      var denied = emptyAward(reason);
      denied.foul = foul;
      denied.legal = false;
      denied.starApplied = false;
      return denied;
    }

    var pocketBonus = cfg.pocketBonus == null ? 24 : cfg.pocketBonus;
    var landingBonus = applyLanding ? zoneBonus(zone, cfg) : 0;
    var coins = pocketBonus + landingBonus;
    var props = [];
    if (applyLanding && zone) {
      props.push({
        id: zone.kind,
        name: zone.label || zone.name,
        amount: landingBonus,
        unit: '落点加成'
      });
    }

    return {
      coins: coins,
      points: coins,
      unit: UNIT,
      reason: 'legal',
      legal: true,
      foul: false,
      starApplied: applyLanding,
      pocketBonus: pocketBonus,
      landingBonus: landingBonus,
      zone: zone,
      zoneLabel: zone ? (zone.label || zone.name || '') : '',
      quality: {
        pocket: pocketBonus,
        cushions: input.cushions || 0,
        firstContact: !!input.firstContactIsTarget
      },
      props: props,
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
    zoneBonus: zoneBonus,
    settle: settle,
    gapToBest: gapToBest
  };
});
