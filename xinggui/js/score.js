'use strict';

function comboMult(streak, cfg) {
  const m = (cfg && cfg.comboMults) || [1, 1.5, 2, 2.5];
  const i = Math.max(0, Math.min(streak | 0, m.length - 1));
  return m[i];
}

function areaFactor(area, w, h, cfg) {
  const ref = Math.max(1, (w || 390) * (h || 844) * ((cfg && cfg.areaRefRatio) || 0.08));
  const t = area / ref;
  if (t < 0.35) return 0.35;
  if (t > 2.2) return 2.2;
  return t;
}

function scoreLoop(nodes, inside, areaFac, streak, perfect, cfg) {
  const perNode = (cfg && cfg.scorePerNode) || 20;
  const perIn = (cfg && cfg.scorePerInside) || 15;
  let raw = (nodes | 0) * perNode + Math.floor((areaFac || 1) * (inside | 0) * perIn);
  if (perfect) raw += (cfg && cfg.perfectBonus) || 200;
  return Math.round(raw * comboMult(streak, cfg));
}

function isPerfect(inside, selfIntersect, cfg) {
  return (inside | 0) >= ((cfg && cfg.perfectInside) || 6) && !selfIntersect;
}

function nextCombo(combo) {
  return Math.min(3, (combo | 0) + 1);
}

function poeticLine(score, loops, combo, reason) {
  if (reason === 'break' && score < 80) return '轨迹散了，夜还在等你';
  if (score <= 0) return '夜还很长，星尚未醒';
  if (combo >= 3) return '连击未断，夜为你停了一息';
  if (score >= 3600) return '星河入掌，轨如诗行';
  if (score >= 2200) return '这一夜，你织出了几座星环';
  if (loops >= 6) return '环环相扣，像把银河叠成信';
  if (score >= 1200) return '你走过的，已是一条细细银河';
  if (score >= 480) return '一线微光，刚从夜色里醒来';
  return '星辰记得你轻轻点过的次序';
}

function settleReasonLine(reason) {
  if (reason === 'break') return '轨迹绷断';
  if (reason === 'time') return '夜色收尽';
  return '星轨已尽';
}

module.exports = {
  comboMult: comboMult,
  areaFactor: areaFactor,
  scoreLoop: scoreLoop,
  isPerfect: isPerfect,
  nextCombo: nextCombo,
  poeticLine: poeticLine,
  settleReasonLine: settleReasonLine
};
