import { COLLEAGUES } from './data/colleagues.js';
import { getLevel } from './data/levels.js';
import { createRng } from './rng.js';

/**
 * 由种子生成整局题目序列。好友打开同一 seed+level，题目完全一致。
 */
export function buildRound(seed, levelId) {
  const level = getLevel(levelId);
  const rng = createRng((seed ^ (levelId * 0x9e3779b9)) >>> 0);
  const queue = [];

  for (let i = 0; i < level.targetCount; i += 1) {
    const base = rng.pick(COLLEAGUES);
    const forceSlack = rng.next() < level.slackRatio;
    const truth = forceSlack ? 'slack' : base.truth === 'slack' && rng.next() < 0.35 ? 'slack' : 'busy';
    // 高 bluff：表面动作与真相相反的概率升高
    let pose = base.pose;
    const flipPose = rng.next() < level.bluffStrength;
    if (flipPose) {
      pose = truth === 'slack' ? rng.pick(['typing', 'debug', 'meeting', 'sheet']) : rng.pick(['phone', 'stare', 'call']);
    }
    const conflict = rng.next() < level.conflictChance;
    queue.push({
      uid: `${levelId}-${i}-${base.id}`,
      templateId: base.id,
      name: base.name,
      role: base.role,
      truth,
      pose,
      line: base.line,
      bluff: base.bluff,
      conflict,
      /** 冲突时副信号：让玩家犹豫 */
      sideSignal: conflict ? (truth === 'slack' ? '进度条 99%' : '购物车小红点') : null,
      clearCue: level.clearCues ? (truth === 'busy' ? '眉头紧锁' : '嘴角藏笑') : null,
    });
  }

  return { level, queue, seed, rng };
}
