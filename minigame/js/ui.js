const { encodeSeed } = require('./rng.js');
const { createRng } = require('./rng.js');

function draw(ctx, W, H, state, DATA) {
  const ox = (Math.random() - 0.5) * (state.shake || 0);
  const oy = (Math.random() - 0.5) * (state.shake || 0);
  ctx.save();
  ctx.translate(ox, oy);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#24382f');
  g.addColorStop(1, '#101a16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = '#d6ff3f';
    ctx.fillRect(0, 40 + i * 36, W, 10);
  }
  ctx.globalAlpha = 1;

  let buttons = [];
  if (state.phase === 'menu') buttons = drawMenu(ctx, W, H, state);
  else if (state.phase === 'play') buttons = drawPlay(ctx, W, H, state);
  else if (state.phase === 'result') buttons = drawResult(ctx, W, H, state, DATA);

  if (state.toast && state.toastT > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, W / 2 - 120, H - 120, 240, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '13px sans-serif';
    ctx.fillText(state.toast, W / 2, H - 96);
  }

  ctx.restore();
  return buttons;
}

function drawMenu(ctx, W, H, state) {
  ctx.fillStyle = '#d6ff3f';
  ctx.textAlign = 'center';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('摸鱼判官', W / 2, H * 0.28);
  ctx.fillStyle = '#a8c4b4';
  ctx.font = '14px sans-serif';
  wrap(ctx, '盯着同事微动作，点真忙或装忙。卡点在周五 17:59。', W / 2, H * 0.34, W - 64, 20);
  if (state.fromChallenge) {
    ctx.fillStyle = '#ffb020';
    ctx.fillText(`好友挑战种子 ${encodeSeed(state.seed)}`, W / 2, H * 0.42);
  }
  return [
    btn(ctx, W / 2 - 130, H * 0.55, 260, 48, state.fromChallenge ? '接受挑战' : '开始审判', '#d6ff3f', '#132018', 'start'),
    btn(ctx, W / 2 - 130, H * 0.55 + 60, 260, 48, '直接挑战周五场', 'rgba(255,255,255,0.1)', '#f4fff7', 'l3'),
  ];
}

function drawPlay(ctx, W, H, state) {
  const p = state.play;
  const lv = state.round.level;
  ctx.fillStyle = '#a8c4b4';
  ctx.textAlign = 'left';
  ctx.font = '13px sans-serif';
  ctx.fillText(`${lv.name}  ${Math.ceil(p.timeLeft)}s`, 16, 28);
  ctx.textAlign = 'right';
  ctx.fillText(`连击 ${p.combo}  ${p.correct}/${lv.targetCount}`, W - 16, 28);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5c6a';
  ctx.fillText(`${'♥'.repeat(p.hp)}${'♡'.repeat(Math.max(0, lv.hp - p.hp))}`, W / 2, 28);

  if (p.current) {
    const c = p.current;
    const cardW = Math.min(320, W - 40);
    const cardH = 250;
    const x = (W - cardW) / 2;
    const y = H * 0.18;
    ctx.fillStyle = 'rgba(10,18,15,0.9)';
    roundRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.strokeStyle = '#d6ff3f';
    ctx.stroke();
    ctx.fillStyle = '#f4fff7';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(c.name, W / 2, y + 50);
    ctx.fillStyle = '#a8c4b4';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${c.role} · ${c.pose}`, W / 2, y + 78);
    ctx.fillStyle = '#e8fff0';
    ctx.font = '15px sans-serif';
    wrap(ctx, `「${c.line}」`, W / 2, y + 110, cardW - 36, 20);
    if (c.clearCue) {
      ctx.fillStyle = '#d6ff3f';
      ctx.fillText(`线索：${c.clearCue}`, W / 2, y + 170);
    } else if (c.sideSignal) {
      ctx.fillStyle = '#ffb020';
      ctx.fillText(`可疑信号：${c.sideSignal}`, W / 2, y + 170);
    }
    const remain = Math.max(0, 1 - p.cardAge / (p.windowMs / 1000));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(24, y + cardH + 16, W - 48, 6);
    ctx.fillStyle = remain < 0.25 ? '#ff5c6a' : '#d6ff3f';
    ctx.fillRect(24, y + cardH + 16, (W - 48) * remain, 6);
  }

  const bw = (W - 48) / 2;
  const by = H - 84;
  return [
    btn(ctx, 16, by, bw, 52, '真忙', '#3dd6c6', '#062824', 'busy'),
    btn(ctx, 32 + bw, by, bw, 52, '装忙', '#ffb020', '#2a1a00', 'slack'),
  ];
}

function drawResult(ctx, W, H, state, DATA) {
  const s = state.lastStats;
  const rng = createRng((state.seed ^ 0x77) >>> 0);
  const line = s.won ? '准点下班权已解锁（精神层面）。' : DATA.pickFailLine(rng, s);
  ctx.fillStyle = '#d6ff3f';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(s.won ? '通关战报' : '社死战报', W / 2, 70);
  ctx.fillStyle = '#f4fff7';
  ctx.font = '16px sans-serif';
  ctx.fillText(`识破 ${s.correct}/${s.total}  连击 ${s.combo}  ${s.seconds}s`, W / 2, 110);
  ctx.fillStyle = '#a8c4b4';
  ctx.font = '13px sans-serif';
  ctx.fillText(`${s.levelName} · 种子 ${encodeSeed(state.seed)}`, W / 2, 138);
  ctx.fillStyle = '#ffd0d5';
  wrap(ctx, line + (s.failOn && !s.won ? ` 栽在：${s.failOn}` : ''), W / 2, 170, W - 64, 20);

  const buttons = [];
  let y = 230;
  buttons.push(btn(ctx, W / 2 - 130, y, 260, 46, s.won && state.levelId === 3 ? '晒称号' : '艾特同事来审', '#d6ff3f', '#132018', 'share'));
  y += 56;
  if (s.won && state.levelId < 3) {
    buttons.push(btn(ctx, W / 2 - 130, y, 260, 46, '下一关', 'rgba(255,255,255,0.1)', '#fff', 'next'));
    y += 56;
  }
  if (!s.won && !state.play.revived) {
    buttons.push(btn(ctx, W / 2 - 130, y, 260, 46, '看广告复活', 'rgba(255,255,255,0.1)', '#fff', 'revive'));
    y += 56;
  }
  buttons.push(btn(ctx, W / 2 - 130, y, 260, 46, '不服再战', 'rgba(255,255,255,0.1)', '#fff', 'retry'));
  y += 56;
  buttons.push(btn(ctx, W / 2 - 130, y, 260, 46, '回首页', 'rgba(255,255,255,0.1)', '#fff', 'menu'));
  return buttons;
}

function btn(ctx, x, y, w, h, label, bg, fg, id) {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
  return { x, y, w, h, id };
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

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = String(text).split('');
  let line = '';
  let yy = y;
  for (let i = 0; i < chars.length; i += 1) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = chars[i];
      yy += lineHeight;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}

module.exports = { draw };
