'use strict';

function scoreLoop(trailCount, enclosedCount, combo, cfg) {
  const n = trailCount | 0;
  const enc = enclosedCount | 0;
  const extra = Math.max(0, n - (cfg.minLoopStars || 4));
  const raw = n * (cfg.basePerTrailStar || 12) + enc * (cfg.basePerEnclosed || 18) + extra * (cfg.sizeBonus || 5);
  const mult = 1 + Math.max(0, combo) * 0.25;
  return Math.round(raw * mult);
}

function nextCombo(combo) {
  return (combo | 0) + 1;
}

function poeticLine(score, loops, combo, reason) {
  if (reason === 'break' && score < 80) return '轨迹散了，夜还在等你';
  if (score <= 0) return '夜还很长，星尚未醒';
  if (combo >= 8) return '连击未断，夜为你停了一息';
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
  scoreLoop: scoreLoop,
  nextCombo: nextCombo,
  poeticLine: poeticLine,
  settleReasonLine: settleReasonLine
};
