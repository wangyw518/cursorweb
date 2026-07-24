const POSE_COLOR = {
  typing: '#3dd6c6',
  debug: '#7aa7ff',
  stare: '#c7b0ff',
  call: '#ffb020',
  meeting: '#ff8e6b',
  sheet: '#9ad67a',
  walk: '#d6ff3f',
  phone: '#ff5c6a',
  click: '#5ce1ff',
  carry: '#f0d27a',
};

/**
 * Canvas 渲染器：对象复用 + 脏区外全屏轻量绘制，保证触摸反馈 < 1 帧。
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0;
    this.h = 0;
    this.shake = 0;
    this.flash = 0;
    this.particlePool = Array.from({ length: 40 }, () => ({ alive: false }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const { canvas } = this;
    const rect = canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.floor(rect.width));
    this.h = Math.max(480, Math.floor(rect.height));
    canvas.width = Math.floor(this.w * this.dpr);
    canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  punch(wrong = false) {
    this.shake = wrong ? 10 : 5;
    this.flash = wrong ? 0.35 : 0.2;
  }

  burst(x, y, color) {
    let spawned = 0;
    for (const p of this.particlePool) {
      if (p.alive) continue;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = -Math.random() * 5 - 1;
      p.life = 1;
      p.color = color;
      spawned += 1;
      if (spawned >= 10) break;
    }
  }

  draw(state, dt) {
    const { ctx, w, h } = this;
    if (this.shake > 0) this.shake *= 0.85;
    if (this.flash > 0) this.flash *= 0.9;

    const ox = (Math.random() - 0.5) * this.shake;
    const oy = (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.translate(ox, oy);

    // 办公室氛围背景（非纯色）
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#24382f');
    g.addColorStop(0.45, '#1a2a24');
    g.addColorStop(1, '#101a16');
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, w + 20, h + 20);

    // 百叶窗光带
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = '#d6ff3f';
      ctx.fillRect(0, 40 + i * 36, w, 10);
    }
    ctx.globalAlpha = 1;

    // 工位暗示线
    ctx.strokeStyle = 'rgba(214,255,63,0.08)';
    ctx.lineWidth = 1;
    for (let x = 30; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.35);
      ctx.lineTo(x + 20, h * 0.78);
      ctx.stroke();
    }

    if (state.phase === 'play' && state.current) {
      this.drawColleague(state.current, state, dt);
    } else if (state.phase === 'idle' || state.phase === 'menu') {
      this.drawIdleHero(state.time);
    }

    // particles
    for (const p of this.particlePool) {
      if (!p.alive) continue;
      p.life -= dt * 1.6;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 8 * dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255,92,106,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  drawIdleHero(time) {
    const { ctx, w, h } = this;
    const cx = w / 2;
    const cy = h * 0.42 + Math.sin(time * 2) * 6;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 88, 70, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 判官剪影
    ctx.fillStyle = '#d6ff3f';
    ctx.beginPath();
    ctx.arc(cx, cy - 36, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f332b';
    ctx.fillRect(cx - 34, cy - 10, 68, 90);
    ctx.fillStyle = '#f4fff7';
    ctx.font = '700 14px "Noto Sans SC"';
    ctx.textAlign = 'center';
    ctx.fillText('盯——', cx, cy + 40);
  }

  drawColleague(c, state, dt) {
    const { ctx, w, h } = this;
    const appear = Math.min(1, state.cardAge / 0.18);
    const cx = w / 2;
    const cy = h * 0.38;
    const scale = 0.92 + appear * 0.08;
    const color = POSE_COLOR[c.pose] || '#d6ff3f';

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = appear;

    // card
    const cardW = Math.min(320, w - 48);
    const cardH = 280;
    roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 22);
    ctx.fillStyle = 'rgba(10,18,15,0.88)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // avatar blob
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -70, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12201a';
    ctx.fillRect(-40, -40, 80, 70);

    // pose motion
    const t = state.time;
    ctx.strokeStyle = '#f4fff7';
    ctx.lineWidth = 3;
    if (c.pose === 'typing' || c.pose === 'click') {
      const tap = Math.sin(t * 20) > 0 ? 4 : -4;
      ctx.beginPath();
      ctx.moveTo(-18, 10);
      ctx.lineTo(-8, 10 + tap);
      ctx.moveTo(8, 10 + tap);
      ctx.lineTo(18, 10);
      ctx.stroke();
    } else if (c.pose === 'phone') {
      ctx.fillStyle = '#111';
      ctx.fillRect(20, -10, 16, 28);
    } else if (c.pose === 'call') {
      ctx.beginPath();
      ctx.arc(34, -20, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#f4fff7';
    ctx.textAlign = 'center';
    ctx.font = '800 22px "ZCOOL KuaiLe", "Noto Sans SC"';
    ctx.fillText(c.name, 0, 55);

    ctx.font = '400 13px "Noto Sans SC"';
    ctx.fillStyle = '#a8c4b4';
    ctx.fillText(`${c.role} · ${poseLabel(c.pose)}`, 0, 78);

    ctx.fillStyle = '#e8fff0';
    ctx.font = '700 15px "Noto Sans SC"';
    wrapText(ctx, `「${c.line}」`, 0, 108, cardW - 40, 20);

    if (c.clearCue) {
      ctx.fillStyle = '#d6ff3f';
      ctx.font = '700 12px "Noto Sans SC"';
      ctx.fillText(`线索：${c.clearCue}`, 0, 150);
    } else if (c.sideSignal) {
      ctx.fillStyle = '#ffb020';
      ctx.font = '700 12px "Noto Sans SC"';
      ctx.fillText(`可疑信号：${c.sideSignal}`, 0, 150);
    } else if (c.conflict) {
      ctx.fillStyle = '#ff8e6b';
      ctx.font = '700 12px "Noto Sans SC"';
      ctx.fillText('信号冲突中…相信眼睛还是嘴？', 0, 150);
    }

    // decision timer arc
    const remain = Math.max(0, 1 - state.cardAge / (state.windowMs / 1000));
    ctx.beginPath();
    ctx.strokeStyle = remain < 0.25 ? '#ff5c6a' : color;
    ctx.lineWidth = 4;
    ctx.arc(0, -70, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
    ctx.stroke();

    ctx.restore();

    // countdown bar
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(24, h * 0.68, w - 48, 6);
    ctx.fillStyle = remain < 0.25 ? '#ff5c6a' : '#d6ff3f';
    ctx.fillRect(24, h * 0.68, (w - 48) * remain, 6);
  }
}

function poseLabel(pose) {
  const map = {
    typing: '敲键盘',
    debug: '盯终端',
    stare: '放空',
    call: '打电话',
    meeting: '开会中',
    sheet: '怼表格',
    walk: '巡楼',
    phone: '滑手机',
    click: '连点鼠标',
    carry: '搬东西',
  };
  return map[pose] || pose;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('');
  let line = '';
  let yy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}
