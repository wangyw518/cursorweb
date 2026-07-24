/**
 * 摸鱼判官 - 微信小游戏入口（纯 Canvas，无 DOM）
 * 玩法与 web 版同源规则：种子关卡、三关卡点、战报分享。
 */
const DATA = require('./js/data.js');
const { createRng, encodeSeed, parseSeed, randomSeed } = require('./js/rng.js');
const { buildRound } = require('./js/seed.js');
const UI = require('./js/ui.js');

const sys = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const dpr = Math.min(sys.pixelRatio || 1, 2);
canvas.width = sys.windowWidth * dpr;
canvas.height = sys.windowHeight * dpr;
ctx.scale(dpr, dpr);
const W = sys.windowWidth;
const H = sys.windowHeight;

const state = {
  phase: 'menu',
  seed: randomSeed(),
  levelId: 1,
  fromChallenge: false,
  time: 0,
  play: null,
  round: null,
  lastStats: null,
  buttons: [],
  toast: null,
  toastT: 0,
  shake: 0,
};

function consumeQuery(query) {
  if (!query) return;
  const seed = parseSeed(query.seed);
  if (seed) {
    state.seed = seed;
    state.fromChallenge = true;
    const lv = Number(query.lv || 0);
    if (lv >= 1 && lv <= 3) state.levelId = lv;
  }
}

consumeQuery((wx.getLaunchOptionsSync() || {}).query);
wx.onShow((res) => consumeQuery((res || {}).query));

wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
wx.onShareAppMessage(() => sharePayload());
if (wx.onShareTimeline) wx.onShareTimeline(() => sharePayload());

function sharePayload() {
  const stats = state.lastStats || {
    seconds: 23,
    correct: 0,
    total: 20,
    combo: 0,
    failOn: '神秘同事',
    remain: 20,
    levelName: '周五 17:59',
  };
  const rng = createRng((state.seed ^ 9) >>> 0);
  return {
    title: DATA.buildShareTitle(rng, stats),
    imageUrl: 'share-cover.png',
    query: `seed=${encodeSeed(state.seed)}&lv=${state.levelId}`,
  };
}

function toast(msg) {
  state.toast = msg;
  state.toastT = 1.2;
}

function startLevel(levelId) {
  state.levelId = levelId;
  state.round = buildRound(state.seed, levelId);
  const level = state.round.level;
  state.play = {
    index: 0,
    hp: level.hp,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    timeLeft: level.durationMs / 1000,
    spawnCd: 0.35,
    current: null,
    cardAge: 0,
    windowMs: level.decisionWindowMs,
    failOn: null,
    revived: false,
  };
  state.phase = 'play';
  bumpRuns();
}

function spawnNext() {
  const p = state.play;
  const round = state.round;
  if (p.index >= round.queue.length) {
    endRound(true);
    return;
  }
  p.current = round.queue[p.index];
  p.cardAge = 0;
  let windowMs = round.level.decisionWindowMs;
  let interval = round.rng.int(round.level.spawnIntervalMs[0], round.level.spawnIntervalMs[1]);
  if (round.level.frenzyAfterCombo && p.combo >= round.level.frenzyAfterCombo) {
    windowMs = Math.floor(windowMs * round.level.frenzyIntervalScale);
    interval = Math.floor(interval * round.level.frenzyIntervalScale);
  }
  p.windowMs = windowMs;
  p.spawnCd = interval / 1000;
}

function judge(answer) {
  const p = state.play;
  if (!p || !p.current) return;
  const c = p.current;
  p.current = null;
  p.spawnCd = Math.min(p.spawnCd, 0.18);
  if (c.truth === answer) {
    p.correct += 1;
    p.combo += 1;
    p.maxCombo = Math.max(p.maxCombo, p.combo);
    p.index += 1;
    state.shake = 4;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    if (p.index >= state.round.queue.length) endRound(true);
  } else {
    miss(c.name);
  }
}

function miss(name) {
  const p = state.play;
  p.wrong += 1;
  p.combo = 0;
  p.hp -= 1;
  p.failOn = name;
  p.index += 1;
  p.current = null;
  p.spawnCd = 0.25;
  state.shake = 10;
  toast(`误判：${name}`);
  if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
  if (p.hp <= 0) endRound(false);
  else if (p.index >= state.round.queue.length) endRound(true);
}

function endRound(won) {
  const level = state.round.level;
  const p = state.play;
  const remain = Math.max(0, level.targetCount - p.correct);
  const seconds = Math.max(1, Math.round(level.durationMs / 1000 - p.timeLeft));
  const stats = {
    seconds,
    correct: p.correct,
    total: level.targetCount,
    combo: p.maxCombo,
    failOn: p.failOn,
    remain,
    levelName: level.name,
    won,
  };
  state.lastStats = stats;
  state.phase = 'result';
  persistBest(stats, level.id, won);
}

function bumpRuns() {
  const n = (wx.getStorageSync('moyu_runs') || 0) + 1;
  wx.setStorageSync('moyu_runs', n);
}

function persistBest(stats, levelId, won) {
  const best = wx.getStorageSync('moyu_best') || { combo: 0, cleared: 0 };
  best.combo = Math.max(best.combo || 0, stats.combo || 0);
  if (won) best.cleared = Math.max(best.cleared || 0, levelId);
  wx.setStorageSync('moyu_best', best);
}

function hitButton(x, y) {
  for (const b of state.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

wx.onTouchStart((e) => {
  const t = e.touches[0];
  const b = hitButton(t.clientX, t.clientY);
  if (!b) return;
  if (b.id === 'start') startLevel(state.fromChallenge ? state.levelId : 1);
  else if (b.id === 'l3') startLevel(3);
  else if (b.id === 'busy') judge('busy');
  else if (b.id === 'slack') judge('slack');
  else if (b.id === 'share') {
    // 引导右上角分享；同时写入剪贴板文案
    const p = sharePayload();
    if (wx.setClipboardData) wx.setClipboardData({ data: `${p.title}` });
    toast('点击右上角 ··· 转发给朋友');
  } else if (b.id === 'retry') {
    if (!state.fromChallenge) state.seed = randomSeed();
    startLevel(state.levelId);
  } else if (b.id === 'next') startLevel(Math.min(3, state.levelId + 1));
  else if (b.id === 'menu') {
    state.fromChallenge = false;
    state.seed = randomSeed();
    state.phase = 'menu';
  } else if (b.id === 'revive') {
    // 未配置广告时直接复活（开发预览）
    const p = state.play;
    if (!p || p.revived) return;
    p.revived = true;
    p.hp = 1;
    p.timeLeft = Math.max(p.timeLeft, 12);
    state.round.queue = state.round.queue.slice(0, p.index + 5);
    state.phase = 'play';
    p.current = null;
    p.spawnCd = 0.2;
    toast('复活成功');
  }
});

let last = Date.now();
function frame() {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  if (state.toastT > 0) state.toastT -= dt;
  if (state.shake > 0) state.shake *= 0.85;

  if (state.phase === 'play' && state.play) {
    const p = state.play;
    p.timeLeft -= dt;
    p.cardAge += dt;
    p.spawnCd -= dt;
    if (p.timeLeft <= 0) endRound(false);
    else if (p.current && p.cardAge * 1000 >= p.windowMs) miss('超时没判');
    else if (!p.current && p.spawnCd <= 0) spawnNext();
  }

  state.buttons = UI.draw(ctx, W, H, state, DATA);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
