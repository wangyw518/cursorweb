const LEVELS = [
  {
    id: 1,
    name: '入职第一天',
    durationMs: 60000,
    hp: 3,
    targetCount: 8,
    spawnIntervalMs: [1400, 1800],
    decisionWindowMs: 3200,
    bluffStrength: 0.15,
    slackRatio: 0.45,
    conflictChance: 0,
    clearCues: true,
  },
  {
    id: 2,
    name: '周一早会',
    durationMs: 55000,
    hp: 3,
    targetCount: 12,
    spawnIntervalMs: [1000, 1400],
    decisionWindowMs: 2400,
    bluffStrength: 0.45,
    slackRatio: 0.5,
    conflictChance: 0.15,
    clearCues: false,
  },
  {
    id: 3,
    name: '周五 17:59',
    durationMs: 50000,
    hp: 2,
    targetCount: 20,
    spawnIntervalMs: [700, 1000],
    decisionWindowMs: 1500,
    bluffStrength: 0.82,
    slackRatio: 0.55,
    conflictChance: 0.55,
    clearCues: false,
    frenzyAfterCombo: 6,
    frenzyIntervalScale: 0.72,
  },
];

const COLLEAGUES = [
  { id: 'pm_fake_type', name: '产品经理·阿凯', role: '产品', truth: 'slack', pose: 'typing', line: '这个需求很简单，我先排期' },
  { id: 'dev_real', name: '后端·老周', role: '研发', truth: 'busy', pose: 'debug', line: '线上告警，别吵' },
  { id: 'design_slack', name: '设计·小鹿', role: '设计', truth: 'slack', pose: 'stare', line: '我在找感觉…' },
  { id: 'hr_busy', name: 'HR·婷婷', role: '人力', truth: 'busy', pose: 'call', line: '候选人卡 offer 了' },
  { id: 'ops_fake_meeting', name: '运营·大飞', role: '运营', truth: 'slack', pose: 'meeting', line: '我在听，你们先说' },
  { id: 'finance_busy', name: '财务·苏苏', role: '财务', truth: 'busy', pose: 'sheet', line: '对账对到眼瞎' },
  { id: 'boss_walk', name: '老板·巡楼中', role: '老板', truth: 'busy', pose: 'walk', line: '大家最近怎么样？' },
  { id: 'intern_scroll', name: '实习生·团子', role: '实习', truth: 'slack', pose: 'phone', line: '我在记关键词' },
  { id: 'qa_busy', name: '测试·阿敏', role: '测试', truth: 'busy', pose: 'click', line: '必现！截图来了' },
  { id: 'sales_slack', name: '销售·阿杰', role: '销售', truth: 'slack', pose: 'call', line: '客户那边再等等' },
  { id: 'admin_busy', name: '行政·圆圆', role: '行政', truth: 'busy', pose: 'carry', line: '会议室被占了！' },
  { id: 'market_slack', name: '市场·娜娜', role: '市场', truth: 'slack', pose: 'stare', line: '我在调研市场' },
  { id: 'data_busy', name: '数据·老白', role: '数据', truth: 'busy', pose: 'sheet', line: '查询还有 3 分钟' },
  { id: 'support_slack', name: '客服·小满', role: '客服', truth: 'slack', pose: 'typing', line: '用户说再看看' },
  { id: 'legal_busy', name: '法务·言言', role: '法务', truth: 'busy', pose: 'stare', line: '这条款不能过' },
  { id: 'algo_fake', name: '算法·神秘人', role: '算法', truth: 'slack', pose: 'debug', line: '模型训练中…' },
];

const SHARE_TITLES = [
  (s) => `我在周五场只撑了 ${s.seconds} 秒，你来？`,
  (s) => `识破 ${s.correct}/${s.total}，连击 ${s.combo}，求超越`,
  (s) => `栽在：${s.failOn || '神秘同事'}，不服来审`,
  (s) => `还差 ${s.remain} 个装忙，群里谁顶得住？`,
  (s) => `${s.levelName} · 我的战报很难看，请你更难看`,
];

function buildShareTitle(rng, stats) {
  return rng.pick(SHARE_TITLES)(stats);
}

function pickFailLine(rng, stats) {
  if (stats.failOn && String(stats.failOn).includes('老板')) return '把老板点成摸鱼，社死现场。';
  if (stats.remain > 0 && stats.remain <= 3) return `还差 ${stats.remain} 个装忙没识破，就差一口气。`;
  const lines = [
    '栽在「假装敲代码的产品经理」手上。',
    '连击很好，脑子先走了。',
    '你盯着屏幕，装忙的盯着你。',
    '判官执照被领导临时没收。',
  ];
  return rng.pick(lines);
}

module.exports = {
  LEVELS,
  COLLEAGUES,
  buildShareTitle,
  pickFailLine,
  getLevel(id) {
    return LEVELS.find((l) => l.id === id) || LEVELS[0];
  },
};
