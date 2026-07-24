const { COLLEAGUES, getLevel } = require('./data.js');
const { createRng } = require('./rng.js');

function buildRound(seed, levelId) {
  const level = getLevel(levelId);
  const rng = createRng((seed ^ (levelId * 0x9e3779b9)) >>> 0);
  const queue = [];
  for (let i = 0; i < level.targetCount; i += 1) {
    const base = rng.pick(COLLEAGUES);
    const forceSlack = rng.next() < level.slackRatio;
    const truth = forceSlack ? 'slack' : base.truth === 'slack' && rng.next() < 0.35 ? 'slack' : 'busy';
    let pose = base.pose;
    if (rng.next() < level.bluffStrength) {
      pose = truth === 'slack' ? rng.pick(['typing', 'debug', 'meeting', 'sheet']) : rng.pick(['phone', 'stare', 'call']);
    }
    const conflict = rng.next() < level.conflictChance;
    queue.push({
      name: base.name,
      role: base.role,
      truth,
      pose,
      line: base.line,
      conflict,
      sideSignal: conflict ? (truth === 'slack' ? '进度条 99%' : '购物车小红点') : null,
      clearCue: level.clearCues ? (truth === 'busy' ? '眉头紧锁' : '嘴角藏笑') : null,
    });
  }
  return { level, queue, seed, rng };
}

module.exports = { buildRound };
