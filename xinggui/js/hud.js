'use strict';

const scoreLib = require('./score.js');

const FONT = '"PingFang SC","Hiragino Sans GB","WenQuanYi Micro Hei","Microsoft YaHei",sans-serif';

const COPY = {
  title: '星轨',
  subtitle: '夜空之中，连星成轨',
  hint: '点星成线，闭合为环',
  closeHint: '回到第一颗星，织成一环 · 点空白两下可抹去',
  play: '轻点入夜',
  cta: '再织一轨',
  share: '分享这次夜航',
  best: '最佳',
  gap: '距纪录',
  newBest: '新的星纪录',
  combo: '连环'
};

function layoutTitle(w, h) {
  return {
    play: { id: 'play', x: w * 0.5 - 90, y: h * 0.72, w: 180, h: 48 }
  };
}

function layoutSettle(w, h) {
  const cy = h * 0.64;
  return {
    replay: { id: 'replay', x: w * 0.5 - 116, y: cy, w: 232, h: 52 },
    share: { id: 'share', x: w * 0.5 - 90, y: cy + 64, w: 180, h: 36 }
  };
}

function hitButton(buttons, x, y) {
  const keys = Object.keys(buttons);
  for (let i = 0; i < keys.length; i++) {
    const b = buttons[keys[i]];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

function drawTracked(ctx, text, x, y, tracking) {
  const chars = String(text).split('');
  const gap = tracking == null ? 10 : tracking;
  ctx.save();
  const widths = chars.map(function (ch) { return ctx.measureText(ch).width; });
  let total = 0;
  for (let i = 0; i < widths.length; i++) total += widths[i] + (i ? gap : 0);
  let cx = x - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx + widths[i] / 2, y);
    cx += widths[i] + gap;
  }
  ctx.restore();
}

function drawPlayHud(ctx, session, view) {
  const w = view.w;
  const top = view.safeTop;
  ctx.save();
  ctx.textBaseline = 'top';
  const comboHex = (session.cfg && session.cfg.comboColor) || '#F472B6';
  ctx.fillStyle = comboHex;
  ctx.font = '13px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(COPY.combo, 22, top);
  ctx.font = '22px ' + FONT;
  ctx.fillText('×' + scoreLib.comboMult(session.combo, session.cfg), 22, top + 18);

  ctx.textAlign = 'center';
  ctx.font = '34px ' + FONT;
  ctx.fillStyle = '#F4F7FF';
  ctx.shadowColor = 'rgba(160,190,255,0.35)';
  ctx.shadowBlur = 12;
  ctx.fillText(String(Math.round(session.displayScore)), w / 2, top);
  ctx.shadowBlur = 0;

  const t = Math.max(0, session.timeLeft);
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60);
  const clock = mm + ':' + (ss < 10 ? '0' : '') + ss;
  ctx.textAlign = 'left';
  ctx.font = '20px ' + FONT;
  ctx.fillStyle = t <= 10 ? '#FFC4B8' : 'rgba(232,238,248,0.92)';
  ctx.fillText(clock, w - view.safeRight - 58, top + 8);

  if (session.hint && session.hintAge < 4.5) {
    ctx.globalAlpha = session.hintAge < 0.4 ? session.hintAge / 0.4 : Math.max(0, 1 - (session.hintAge - 3.2) / 1.3);
    ctx.textAlign = 'center';
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = 'rgba(220,228,242,0.88)';
    ctx.fillText(session.hint, w / 2, view.h - 42);
  }
  ctx.restore();
}

function drawTitle(ctx, session, view) {
  const w = view.w;
  const h = view.h;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(244,247,255,0.96)';
  ctx.font = '52px ' + FONT;
  ctx.shadowColor = 'rgba(150,180,255,0.32)';
  ctx.shadowBlur = 18;
  drawTracked(ctx, COPY.title, w / 2, h * 0.36, 16);
  ctx.shadowBlur = 0;
  ctx.font = '15px ' + FONT;
  ctx.fillStyle = 'rgba(214,222,238,0.82)';
  drawTracked(ctx, COPY.subtitle, w / 2, h * 0.36 + 48, 4);

  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(200,210,230,0.62)';
  ctx.fillText(COPY.hint, w / 2, h * 0.36 + 80);

  if (session.best > 0) {
    ctx.fillStyle = 'rgba(232,238,248,0.7)';
    ctx.font = '13px ' + FONT;
    ctx.fillText(COPY.best + '  ' + session.best, w / 2, h * 0.36 + 110);
  }

  const pulse = 0.62 + 0.38 * Math.sin(session.clock * 2.2);
  ctx.globalAlpha = pulse;
  ctx.font = '15px ' + FONT;
  ctx.fillStyle = '#E8F0FF';
  ctx.fillText(COPY.play, w / 2, h * 0.74);
  ctx.restore();
}

function drawSettle(ctx, session, view) {
  const w = view.w;
  const h = view.h;
  const info = session.settle;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 8, 16, 0.52)';
  ctx.fillRect(0, 0, w, h);

  const card = { x: w * 0.1, y: h * 0.2, w: w * 0.8, h: h * 0.58 };
  ctx.save();
  ctx.shadowColor = 'rgba(80,120,200,0.18)';
  ctx.shadowBlur = 28;
  roundRect(ctx, card.x, card.y, card.w, card.h, 22);
  ctx.fillStyle = 'rgba(10, 14, 26, 0.9)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(210, 224, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(214,222,238,0.82)';
  ctx.font = '14px ' + FONT;
  ctx.fillText(scoreLib.settleReasonLine(info.reason), w / 2, h * 0.26);

  ctx.fillStyle = '#F6F8FF';
  ctx.font = '64px ' + FONT;
  ctx.shadowColor = 'rgba(170,200,255,0.35)';
  ctx.shadowBlur = 20;
  ctx.fillText(String(info.score), w / 2, h * 0.36);
  ctx.shadowBlur = 0;

  ctx.font = '15px ' + FONT;
  ctx.fillStyle = 'rgba(226,232,244,0.9)';
  ctx.fillText(info.line, w / 2, h * 0.46);

  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(210,218,232,0.72)';
  if (info.isNewBest) {
    ctx.fillStyle = '#FFE7B8';
    ctx.fillText(COPY.newBest, w / 2, h * 0.53);
  } else {
    ctx.fillText(COPY.best + '  ' + info.best + '    ' + COPY.gap + '  ' + info.gap, w / 2, h * 0.53);
  }

  const buttons = layoutSettle(w, h);
  drawPrimary(ctx, buttons.replay, COPY.cta, session.clock);
  ctx.font = '14px ' + FONT;
  ctx.fillStyle = 'rgba(214,222,236,0.7)';
  ctx.fillText(COPY.share, w / 2, buttons.share.y + buttons.share.h / 2);
  ctx.restore();
  return buttons;
}

function drawPrimary(ctx, btn, label, clock) {
  const x = btn.x;
  const y = btn.y;
  const w = btn.w;
  const h = btn.h;
  const r = h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(140,180,255,0.28)';
  ctx.shadowBlur = 16;
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2A3554');
  g.addColorStop(1, '#1A2238');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(230,238,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#F4F7FF';
  ctx.font = '16px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glow = 0.92 + 0.08 * Math.sin((clock || 0) * 2);
  ctx.globalAlpha = glow;
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
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

function drawToast(ctx, text, view, age) {
  if (!text) return;
  const a = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 1.6) / 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(230,236,248,0.85)';
  ctx.fillText(text, view.w / 2, view.h * 0.18);
  ctx.restore();
}

module.exports = {
  COPY: COPY,
  layoutTitle: layoutTitle,
  layoutSettle: layoutSettle,
  hitButton: hitButton,
  drawPlayHud: drawPlayHud,
  drawTitle: drawTitle,
  drawSettle: drawSettle,
  drawToast: drawToast
};
