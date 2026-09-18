/**
 * Shot settlement: skill first (pocket / cushions / first contact), then zone.
 * Miss or scratch → 0. No cash wording.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DISCLAIMER = '虚拟道具，仅限游戏内使用，不可兑换现金';

  function emptyAward(reason) {
    return {
      points: 0,
      reason: reason,
      legal: false,
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
    var pocketedLowest = !!input.pocketedLowest;
    var scratch = !!input.scratch;
    var cushions = input.cushions || 0;
    var zone = input.zone || null;
    var firstContact = !!input.firstContactIsTarget;
    var cfg = config || {};

    if (scratch) return emptyAward('scratch');
    if (!pocketedLowest) return emptyAward('miss');

    var pocketPts = cfg.pocketPoints == null ? 80 : cfg.pocketPoints;
    var cushionCap = cfg.cushionCap == null ? 4 : cfg.cushionCap;
    var usedCushions = Math.max(0, Math.min(cushionCap, cushions));
    var cushionPts = usedCushions * (cfg.cushionPoints == null ? 18 : cfg.cushionPoints);
    var cushionMul = cfg.cushionMul == null ? 0.15 : cfg.cushionMul;
    var multiplier = 1 + Math.min(3, usedCushions) * cushionMul;
    var contactBonus = firstContact ? (cfg.firstContactBonus == null ? 16 : cfg.firstContactBonus) : 0;
    var zonePts = zone && zone.kind === 'score' ? (zone.points || 0) : 0;

    var points = Math.round((pocketPts + zonePts) * multiplier + cushionPts + contactBonus);
    var props = [];
    var skinProgress = 0;

    if (zone && zone.kind === 'score') {
      props.push({
        id: 'score-tile',
        name: '得分区',
        amount: zonePts,
        unit: '格位分'
      });
    }
    if (zone && zone.kind === 'practice') {
      skinProgress = (cfg.practiceBase == null ? 8 : cfg.practiceBase) +
        Math.min(3, usedCushions) * (cfg.practicePerCushion == null ? 4 : cfg.practicePerCushion);
      props.push({
        id: 'cue-skin',
        name: '练习卡',
        amount: skinProgress,
        unit: '球杆皮肤进度'
      });
    }
    if (zone && zone.kind === 'target') {
      var extra = (cfg.targetBonus == null ? 24 : cfg.targetBonus) +
        (usedCushions >= 1 ? (cfg.targetRailBonus == null ? 12 : cfg.targetRailBonus) : 0);
      points += extra;
      props.push({
        id: 'task-token',
        name: '目标格',
        amount: extra,
        unit: '任务加成'
      });
    }

    return {
      points: points,
      reason: 'legal',
      legal: true,
      zone: zone,
      zoneLabel: zone ? zone.label : '',
      quality: {
        pocket: pocketPts,
        cushions: usedCushions,
        firstContact: firstContact,
        multiplier: multiplier
      },
      props: props,
      skinProgress: skinProgress,
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
    emptyAward: emptyAward,
    settle: settle,
    gapToBest: gapToBest
  };
});
