/** 战报 / 分享文案库：失败比通关更好传 */
export const FAIL_LINES = [
  '把老板点成摸鱼，社死现场。',
  '栽在「假装敲代码的产品经理」手上。',
  '连击很好，脑子先走了。',
  '你盯着屏幕，装忙的盯着你。',
  '还差几个装忙没识破，周五跑了。',
  '判官执照被领导临时没收。',
  '眼神对上了，手点错了。',
  '这局最大的敌人：自己的胜负欲。',
];

export const SHARE_TITLES = [
  (s) => `我在周五场只撑了 ${s.seconds} 秒，你来？`,
  (s) => `识破 ${s.correct}/${s.total}，连击 ${s.combo}，求超越`,
  (s) => `栽在：${s.failOn || '神秘同事'}，不服来审`,
  (s) => `还差 ${s.remain} 个装忙，群里谁顶得住？`,
  (s) => `${s.levelName} · 我的战报很难看，请你更难看`,
];

export const WIN_LINES = [
  '准点下班权已解锁（精神层面）。',
  '你不是卷王，你是显微镜。',
  '同事们开始害怕你的注视。',
  '系统提示：请低调，别被报复。',
];

export function pickFailLine(rng, stats) {
  if (stats.failOn?.includes('老板')) return FAIL_LINES[0];
  if (stats.failOn?.includes('产品')) return FAIL_LINES[1];
  if (stats.remain > 0 && stats.remain <= 3) {
    return `还差 ${stats.remain} 个装忙没识破，就差一口气。`;
  }
  return rng.pick(FAIL_LINES);
}

export function buildShareTitle(rng, stats) {
  const fn = rng.pick(SHARE_TITLES);
  return fn(stats);
}
