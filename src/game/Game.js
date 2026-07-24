import { CONFIG } from '../config.js';
import { platform } from '../platform/bridge.js';
import { buildShareTitle, pickFailLine, WIN_LINES } from './data/copy.js';
import { getLevel, LEVELS } from './data/levels.js';
import { createRng, encodeSeed, parseSeed, randomSeed } from './rng.js';
import { Renderer } from './renderer.js';
import { buildRound } from './seed.js';

export class Game {
  constructor({ canvas, hud, overlay }) {
    this.canvas = canvas;
    this.hud = hud;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.state = {
      phase: 'menu',
      time: 0,
      seed: randomSeed(),
      levelId: 1,
      fromChallenge: false,
    };
    this.round = null;
    this.play = null;
    this._last = performance.now();
    this._running = false;
    this._comboTimer = null;
    this.ui = {
      onJudge: (answer) => this.judge(answer),
      onStart: (levelId) => this.startLevel(levelId || 1),
      onShare: () => this.shareChallenge(),
      onRevive: () => this.tryRevive(),
      onMenu: () => this.showMenu(),
      onNext: () => this.startLevel(Math.min(3, (this.state.levelId || 1) + 1)),
      onRetry: () => this.startLevel(this.state.levelId || 1),
    };

    this.bindPlatformShare();
    this.consumeLaunchQuery(platform.getLaunchQuery());
    platform.onShow((q) => this.consumeLaunchQuery(q));
  }

  bindPlatformShare() {
    platform.setShareAppMessage(() => this.getSharePayload());
  }

  consumeLaunchQuery(query) {
    const seed = parseSeed(query.seed);
    const levelId = Number(query.lv || query.level || 0);
    if (seed) {
      this.state.seed = seed;
      this.state.fromChallenge = true;
      if (levelId >= 1 && levelId <= 3) this.state.levelId = levelId;
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.showMenu();
    const loop = (now) => {
      if (!this._running) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.update(dt);
      this.renderer.draw(this.getRenderState(), dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  getRenderState() {
    return {
      phase: this.state.phase,
      time: this.state.time,
      current: this.play?.current || null,
      cardAge: this.play?.cardAge || 0,
      windowMs: this.play?.windowMs || 2000,
    };
  }

  update(dt) {
    this.state.time += dt;
    if (this.state.phase !== 'play' || !this.play) return;

    this.play.timeLeft -= dt;
    this.play.cardAge += dt;
    this.play.spawnCd -= dt;

    if (this.play.timeLeft <= 0) {
      this.endRound(false, 'time');
      return;
    }

    if (this.play.current && this.play.cardAge * 1000 >= this.play.windowMs) {
      this.applyMiss('超时没判');
      return;
    }

    if (!this.play.current && this.play.spawnCd <= 0) {
      this.spawnNext();
    }

    this.renderHud();
  }

  showMenu() {
    this.state.phase = 'menu';
    this.play = null;
    this.hud.hidden = true;
    this.hud.innerHTML = '';
    const best = platform.storage.get(CONFIG.storageKeys.best, {});
    const challenge = this.state.fromChallenge
      ? `<div class="chip">好友挑战种子 <strong>${encodeSeed(this.state.seed)}</strong></div>`
      : '';
    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <div class="panel">
        <h1 class="brand">${CONFIG.appName}</h1>
        <p class="lead">盯着同事的微动作，点「真忙」或「装忙」。规则 3 秒就会，卡点在周五 17:59。</p>
        <div class="meta">
          <div class="chip">本机最佳连击 <strong>${best.combo || 0}</strong></div>
          <div class="chip">通关进度 <strong>${best.cleared || 0}/3</strong></div>
          ${challenge}
        </div>
        <div class="actions">
          <button class="btn btn-primary" data-act="start">${this.state.fromChallenge ? '接受挑战 · 同一关卡' : '开始审判'}</button>
          <button class="btn btn-secondary" data-act="l3">直接挑战周五场</button>
        </div>
      </div>
    `;
    this.overlay.querySelector('[data-act="start"]').onclick = () => {
      this.startLevel(this.state.fromChallenge ? this.state.levelId : 1);
    };
    this.overlay.querySelector('[data-act="l3"]').onclick = () => this.startLevel(3);
  }

  startLevel(levelId) {
    if (!this.state.fromChallenge) {
      // 非挑战局：每开一局可刷新种子；挑战局锁定种子
      if (this.state.phase !== 'result') this.state.seed = this.state.seed || randomSeed();
    }
    this.state.levelId = levelId;
    this.round = buildRound(this.state.seed, levelId);
    const level = this.round.level;
    this.play = {
      index: 0,
      hp: level.hp,
      correct: 0,
      wrong: 0,
      combo: 0,
      maxCombo: 0,
      judged: 0,
      timeLeft: level.durationMs / 1000,
      spawnCd: 0.35,
      current: null,
      cardAge: 0,
      windowMs: level.decisionWindowMs,
      failOn: null,
      revived: false,
      xrayUntil: 0,
    };
    this.state.phase = 'play';
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    this.hud.hidden = false;
    this.mountPlayDock();
    this.renderHud();
    bumpRuns();
  }

  mountPlayDock() {
    this.hud.innerHTML = `
      <div class="topbar" id="topbar"></div>
      <div class="play-dock">
        <button class="btn btn-busy" type="button" data-ans="busy">真忙</button>
        <button class="btn btn-slack" type="button" data-ans="slack">装忙</button>
      </div>
    `;
    this.hud.querySelector('[data-ans="busy"]').onclick = () => this.judge('busy');
    this.hud.querySelector('[data-ans="slack"]').onclick = () => this.judge('slack');
  }

  renderHud() {
    const bar = this.hud.querySelector('#topbar');
    if (!bar || !this.play) return;
    const lv = this.round.level;
    bar.innerHTML = `
      <span>${lv.name} · <strong>${Math.ceil(this.play.timeLeft)}s</strong></span>
      <span>血量 <strong>${'♥'.repeat(this.play.hp)}${'♡'.repeat(Math.max(0, lv.hp - this.play.hp))}</strong></span>
      <span>连击 <strong>${this.play.combo}</strong> · ${this.play.correct}/${lv.targetCount}</span>
    `;
  }

  spawnNext() {
    const { play, round } = this;
    if (play.index >= round.queue.length) {
      this.endRound(true, 'clear');
      return;
    }
    let current = round.queue[play.index];
    if (play.xrayUntil > this.state.time) {
      current = {
        ...current,
        clearCue: current.truth === 'busy' ? '开天眼：真的在忙' : '开天眼：纯装',
      };
    }
    play.current = current;
    play.cardAge = 0;

    let windowMs = round.level.decisionWindowMs;
    let interval = round.rng.int(round.level.spawnIntervalMs[0], round.level.spawnIntervalMs[1]);
    if (round.level.frenzyAfterCombo && play.combo >= round.level.frenzyAfterCombo) {
      windowMs = Math.floor(windowMs * round.level.frenzyIntervalScale);
      interval = Math.floor(interval * round.level.frenzyIntervalScale);
    }
    play.windowMs = windowMs;
    play.spawnCd = interval / 1000;
  }

  judge(answer) {
    if (this.state.phase !== 'play' || !this.play?.current) return;
    const c = this.play.current;
    const ok = c.truth === answer;
    this.play.judged += 1;
    this.play.current = null;
    this.play.spawnCd = Math.min(this.play.spawnCd, 0.18);

    if (ok) {
      this.play.correct += 1;
      this.play.combo += 1;
      this.play.maxCombo = Math.max(this.play.maxCombo, this.play.combo);
      this.play.index += 1;
      platform.vibrate(true);
      this.renderer.punch(false);
      this.renderer.burst(this.renderer.w / 2, this.renderer.h * 0.38, '#d6ff3f');
      this.popCombo(this.play.combo);
      if (this.play.index >= this.round.queue.length) this.endRound(true, 'clear');
    } else {
      this.applyMiss(c.name, c);
    }
  }

  applyMiss(name, card) {
    if (!this.play) return;
    this.play.wrong += 1;
    this.play.combo = 0;
    this.play.hp -= 1;
    this.play.failOn = name;
    this.play.index += 1;
    this.play.current = null;
    this.play.spawnCd = 0.25;
    platform.vibrate(false);
    this.renderer.punch(true);
    platform.toast(card ? `误判：${card.name}` : name);
    if (this.play.hp <= 0) {
      this.endRound(false, 'hp');
      return;
    }
    if (this.play.index >= this.round.queue.length) this.endRound(true, 'clear');
  }

  popCombo(n) {
    if (n < 2) return;
    const el = document.createElement('div');
    el.className = 'combo-pop';
    el.textContent = `连击 x${n}`;
    document.getElementById('app').appendChild(el);
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => el.remove(), 550);
  }

  endRound(won, reason) {
    if (this.state.phase === 'result') return;
    this.state.phase = 'result';
    const level = this.round.level;
    const remain = Math.max(0, level.targetCount - this.play.correct);
    const seconds = Math.max(1, Math.round(level.durationMs / 1000 - this.play.timeLeft));
    const rng = createRng((this.state.seed ^ 0xabc123) >>> 0);
    const stats = {
      seconds,
      correct: this.play.correct,
      total: level.targetCount,
      combo: this.play.maxCombo,
      failOn: this.play.failOn,
      remain,
      levelName: level.name,
      won,
      reason,
    };
    this.lastStats = stats;
    persistBest(stats, level.id, won);

    const failLine = won ? rng.pick(WIN_LINES) : pickFailLine(rng, stats);
    const canRevive =
      !won && !this.play.revived && reason === 'hp' && getRunCount() >= CONFIG.adFreeRuns;
    const canXray = !won && getRunCount() >= CONFIG.adFreeRuns;

    this.hud.hidden = true;
    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <div class="panel">
        <h2 class="report-title">${won ? '通关战报' : '社死战报'}</h2>
        <div class="stats">
          <div class="stat"><b>${stats.correct}/${stats.total}</b><span>识破</span></div>
          <div class="stat"><b>${stats.combo}</b><span>最大连击</span></div>
          <div class="stat"><b>${stats.seconds}s</b><span>存活</span></div>
        </div>
        <p class="report-line">关卡：${level.name}</p>
        <p class="report-line">种子：${encodeSeed(this.state.seed)}（好友开同一局）</p>
        <div class="report-fail">${failLine}${stats.failOn && !won ? `<br/>栽在：${stats.failOn}` : ''}</div>
        <div class="actions">
          ${
            won && level.id < 3
              ? `<button class="btn btn-primary" data-act="next">下一关 · ${getLevel(level.id + 1).name}</button>`
              : ''
          }
          ${
            won && level.id === 3
              ? `<button class="btn btn-primary" data-act="share">晒称号 · 摸鱼判官</button>`
              : `<button class="btn btn-primary" data-act="share">艾特同事来审</button>`
          }
          ${canRevive ? `<button class="btn btn-secondary" data-act="revive">看广告复活 · 再审 5 人</button>` : ''}
          ${!won && canXray ? `<button class="btn btn-secondary" data-act="xray">看广告开天眼 10 秒再战</button>` : ''}
          <button class="btn btn-secondary" data-act="retry">不服再战</button>
          <button class="btn btn-secondary" data-act="menu">回首页</button>
        </div>
      </div>
    `;

    const bind = (act, fn) => {
      const el = this.overlay.querySelector(`[data-act="${act}"]`);
      if (el) el.onclick = fn;
    };
    bind('next', () => this.ui.onNext());
    bind('share', () => this.ui.onShare());
    bind('retry', () => {
      if (!this.state.fromChallenge) this.state.seed = randomSeed();
      this.ui.onRetry();
    });
    bind('menu', () => {
      this.state.fromChallenge = false;
      this.state.seed = randomSeed();
      this.ui.onMenu();
    });
    bind('revive', () => this.tryRevive());
    bind('xray', async () => {
      const ok = await platform.showRewardedAd();
      if (!ok) return;
      if (!this.state.fromChallenge) this.state.seed = randomSeed();
      this.startLevel(level.id);
      this.play.xrayUntil = this.state.time + 10;
      platform.toast('开天眼 10 秒：真相高亮');
    });
  }

  async tryRevive() {
    const ok = await platform.showRewardedAd();
    if (!ok || !this.play) return;
    this.play.revived = true;
    this.play.hp = 1;
    this.play.timeLeft = Math.max(this.play.timeLeft, 12);
    // 复活后最多再审 5 人
    const level = this.round.level;
    const remainPeople = Math.min(5, level.targetCount - this.play.index);
    this.round.queue = this.round.queue.slice(0, this.play.index + remainPeople);
    this.state.phase = 'play';
    this.overlay.hidden = true;
    this.hud.hidden = false;
    this.mountPlayDock();
    this.play.current = null;
    this.play.spawnCd = 0.2;
    platform.toast('复活成功：最后再审一波');
  }

  getSharePayload() {
    const stats = this.lastStats || {
      seconds: 23,
      correct: 0,
      total: getLevel(this.state.levelId).targetCount,
      combo: 0,
      failOn: '神秘同事',
      remain: getLevel(this.state.levelId).targetCount,
      levelName: getLevel(this.state.levelId).name,
    };
    const rng = createRng((this.state.seed ^ stats.correct ^ 7) >>> 0);
    const title = buildShareTitle(rng, stats);
    const query = `seed=${encodeSeed(this.state.seed)}&lv=${this.state.levelId}`;
    return {
      title,
      query,
      imageUrl: CONFIG.shareImageUrl,
    };
  }

  async shareChallenge() {
    await platform.share(this.getSharePayload());
  }
}

function bumpRuns() {
  const n = getRunCount() + 1;
  platform.storage.set(CONFIG.storageKeys.runs, n);
}

function getRunCount() {
  return Number(platform.storage.get(CONFIG.storageKeys.runs, 0)) || 0;
}

function persistBest(stats, levelId, won) {
  const best = platform.storage.get(CONFIG.storageKeys.best, { combo: 0, cleared: 0 });
  best.combo = Math.max(best.combo || 0, stats.combo || 0);
  if (won) best.cleared = Math.max(best.cleared || 0, levelId);
  platform.storage.set(CONFIG.storageKeys.best, best);

  const board = platform.storage.get(CONFIG.storageKeys.groupBoard, []);
  board.unshift({
    at: Date.now(),
    levelId,
    combo: stats.combo,
    correct: stats.correct,
    seconds: stats.seconds,
    won,
  });
  platform.storage.set(CONFIG.storageKeys.groupBoard, board.slice(0, 20));
}

export { LEVELS };
