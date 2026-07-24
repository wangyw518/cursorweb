/**
 * 难度参数（传播向）
 * - L1 通过率目标 ~85%：建立「我会玩」
 * - L2 通过率目标 ~35%：开始骂、开始分享
 * - L3 通过率目标 ~1%–5%：主卡点（对标羊了个羊第 3 关）
 *
 * 调参只改这里；客户端权威结算，零网络延迟。
 */
export const LEVELS = [
  {
    id: 1,
    key: 'onboarding',
    name: '入职第一天',
    subtitle: '几乎一眼能看穿',
    durationMs: 60000,
    hp: 3,
    targetCount: 8,
    spawnIntervalMs: [1400, 1800],
    decisionWindowMs: 3200,
    /** 伪装强度 0–1：越高越容易误判 */
    bluffStrength: 0.15,
    /** 装忙占比 */
    slackRatio: 0.45,
    /** 第 3 关专属：信号冲突概率 */
    conflictChance: 0,
    clearCues: true,
    passCopy: '工位 intray 已清空，准点下班。',
  },
  {
    id: 2,
    key: 'monday',
    name: '周一早会',
    subtitle: '开始有人演给你看',
    durationMs: 55000,
    hp: 3,
    targetCount: 12,
    spawnIntervalMs: [1000, 1400],
    decisionWindowMs: 2400,
    bluffStrength: 0.45,
    slackRatio: 0.5,
    conflictChance: 0.15,
    clearCues: false,
    passCopy: '你识破了早会演技，人情值 +1。',
  },
  {
    id: 3,
    key: 'friday',
    name: '周五 17:59',
    subtitle: '主卡点 · 通过率约 1%–5%',
    durationMs: 50000,
    hp: 2,
    targetCount: 20,
    spawnIntervalMs: [700, 1000],
    decisionWindowMs: 1500,
    bluffStrength: 0.82,
    slackRatio: 0.55,
    conflictChance: 0.55,
    clearCues: false,
    /** 连对后突然加速，制造「差一点点」 */
    frenzyAfterCombo: 6,
    frenzyIntervalScale: 0.72,
    passCopy: '恭喜获得称号：摸鱼判官',
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}
