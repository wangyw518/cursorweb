(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenHud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONT = '"WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';

  function inRect(r, x, y) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  function layout(viewport) {
    var pad = 14;
    var top = (viewport.safeTop || 20) + 8;
    var bottomSafe = viewport.safeBottom || 0;
    var legendH = 20;
    var skillH = 34;
    var playTop = top + 104;
    var playBottom = viewport.height - bottomSafe - 16 - legendH;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.46;
    var skillW = 78;
    var skillGap = 10;
    var skillStart = cx - (skillW * 1.5 + skillGap);
    return {
      title: { x: pad, y: top + 18 },
      best: { x: viewport.width - pad, y: top + 18 },
      stats: { x: pad, y: top + 38, w: viewport.width - pad * 2, h: 16 },
      skills: [
        { id: 'fire', x: skillStart, y: top + 60, w: skillW, h: skillH, label: '炎破' },
        { id: 'ice', x: skillStart + skillW + skillGap, y: top + 60, w: skillW, h: skillH, label: '霜凝' },
        { id: 'split', x: skillStart + (skillW + skillGap) * 2, y: top + 60, w: skillW, h: skillH, label: '双生' }
      ],
      hint: { x: cx, y: playBottom + 14 },
      toast: { x: cx, y: playTop + 22 },
      power: { x: pad, y: playBottom - 8, w: viewport.width - pad * 2, h: 4 },
      settleScore: { x: cx, y: cy - 54 },
      settleGap: { x: cx, y: cy - 8 },
      replay: { x: cx - 72, y: cy + 52, w: 144, h: 42, label: '再来一局' },
      share: { x: cx - 124, y: cy + 18, w: 118, h: 40, label: '分享助力' },
      ad: { x: cx + 6, y: cy + 18, w: 118, h: 40, label: '观看星辉' },
      playRect: {
        x: 16,
        y: playTop,
        w: viewport.width - 32,
        h: Math.max(150, playBottom - playTop - 10)
      }
    };
  }

  function hitTest(ui, x, y, phase, modal, staminaLeft) {
    var empty = modal === 'empty' || staminaLeft === 0;
    if (empty && (phase === 'settle' || modal === 'empty')) {
      if (inRect(ui.share, x, y)) return 'share';
      if (inRect(ui.ad, x, y)) return 'ad';
      return 'empty-block';
    }
    if (phase === 'settle') {
      if (inRect(ui.replay, x, y)) return 'replay';
      return 'settle-block';
    }
    if (phase === 'aim' || phase === 'charging') {
      var i;
      for (i = 0; i < ui.skills.length; i++) {
        if (inRect(ui.skills[i], x, y)) return 'skill:' + ui.skills[i].id;
      }
    }
    return null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawButton(ctx, btn, colors, pressed, borderHex) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#243456' : (colors.button || '#12183A');
    ctx.fill();
    ctx.strokeStyle = borderHex || colors.buttonBorder || '#67E8F9';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#E8F3FF';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawSkill(ctx, btn, colors, selected) {
    var hex = colors[btn.id] || colors.aim || '#67E8F9';
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 9);
    ctx.fillStyle = selected ? 'rgba(18,24,58,0.95)' : 'rgba(11,16,36,0.72)';
    ctx.fill();
    ctx.shadowColor = selected ? hex : 'transparent';
    ctx.shadowBlur = selected ? 14 : 0;
    ctx.strokeStyle = selected ? hex : 'rgba(168,188,220,0.55)';
    ctx.lineWidth = selected ? 2 : 1.15;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = selected ? hex : (colors.hud || '#E8F3FF');
    ctx.font = '700 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawLegend(ctx, ui, colors) {
    var items = [
      { hex: colors.bronze || '#D4A574', label: '20' },
      { hex: colors.silver || '#C5D0E0', label: '50' },
      { hex: colors.gold || '#F5C542', label: '100' },
      { hex: colors.epic || '#C084FC', label: '180' }
    ];
    var cx = ui.hint.x;
    var y = ui.hint.y;
    ctx.save();
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var i;
    var gap = 54;
    var start = cx - gap * 1.5;
    for (i = 0; i < items.length; i++) {
      var x = start + i * gap;
      ctx.beginPath();
      ctx.strokeStyle = items[i].hex;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      ctx.arc(x - 14, y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(items[i].label, x + 4, y);
    }
    ctx.restore();
  }

  function drawPower(ctx, ui, power, colors) {
    if (!(power > 0.01)) return;
    ctx.save();
    var bar = ui.power;
    roundRect(ctx, bar.x, bar.y, bar.w, bar.h, 2);
    ctx.fillStyle = 'rgba(103,232,249,0.12)';
    ctx.fill();
    roundRect(ctx, bar.x, bar.y, bar.w * Math.max(0, Math.min(1, power)), bar.h, 2);
    ctx.fillStyle = colors.aim || '#67E8F9';
    ctx.fill();
    ctx.restore();
  }

  function drawPanel(ctx, ui, viewport, colors, h) {
    ctx.fillStyle = 'rgba(7,11,24,0.74)';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    var panelW = 280;
    var panelH = h || 248;
    var px = ui.settleScore.x - panelW * 0.5;
    var py = ui.settleScore.y - 64;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fillStyle = colors.bgInner || '#141B3A';
    ctx.fill();
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function drawSettle(ctx, ui, state, colors, viewport) {
    ctx.save();
    var empty = state.stamina <= 0;
    drawPanel(ctx, ui, viewport, colors, empty ? 276 : 248);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    var won = state.settle && state.settle.won;
    var title = won ? '奇境通关' : (state.settle && state.settle.oob && state.settle.score === 0 ? '偏离奇境' : '本境结算');
    ctx.fillText(title, ui.settleScore.x, ui.settleScore.y - 32);

    ctx.fillStyle = won ? (colors.gold || '#F5C542') : (colors.scorePop || '#FDE68A');
    ctx.font = '700 34px ' + FONT;
    ctx.fillText(String(state.settle.score), ui.settleScore.x, ui.settleScore.y + 6);

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    var target = state.settle.target != null ? state.settle.target : 150;
    ctx.fillText((won ? '已达目标  ' : '目标  ') + target, ui.settleScore.x, ui.settleGap.y + 2);

    ctx.font = '14px ' + FONT;
    if (state.settle.isNew) {
      ctx.fillStyle = colors.gold || '#F5C542';
      ctx.fillText('新纪录', ui.settleGap.x, ui.settleGap.y + 24);
    } else if (state.settle.best === 0 && state.settle.score === 0) {
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('暂无纪录', ui.settleGap.x, ui.settleGap.y + 24);
    } else {
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('距最高分  ' + state.settle.gap, ui.settleGap.x, ui.settleGap.y + 24);
    }

    if (empty) {
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.stamina || '#A5B4FC';
      ctx.fillText('星力耗尽 · 分享或观星辉可续力', ui.settleGap.x, ui.settleGap.y + 46);
      drawButton(ctx, ui.share, colors, state.pressed === 'share', colors.split);
      drawButton(ctx, ui.ad, colors, state.pressed === 'ad', colors.epic);
    } else {
      drawButton(ctx, ui.replay, colors, state.pressed === 'replay');
    }
    ctx.restore();
  }

  function drawEmpty(ctx, ui, state, colors, viewport) {
    ctx.save();
    drawPanel(ctx, ui, viewport, colors, 220);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 20px ' + FONT;
    ctx.fillText('星力耗尽', ui.settleScore.x, ui.settleScore.y - 18);
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    ctx.fillText('分享助力或观看星辉后续力', ui.settleScore.x, ui.settleScore.y + 10);
    ctx.fillText('不含现金与提现', ui.settleScore.x, ui.settleScore.y + 30);
    drawButton(ctx, ui.share, colors, state.pressed === 'share', colors.split);
    drawButton(ctx, ui.ad, colors, state.pressed === 'ad', colors.epic);
    ctx.restore();
  }

  function hintFor(phase, charging, skill) {
    if (phase === 'flight') return '奇球飞行中';
    if (charging || phase === 'charging') {
      if (skill === 'fire') return '炎破就绪 · 松手弹射';
      if (skill === 'ice') return '霜凝就绪 · 松手弹射';
      if (skill === 'split') return '双生就绪 · 松手弹射';
      return '松手弹射';
    }
    if (phase === 'settle') return '';
    return '点选技能，拖动瞄准';
  }

  function draw(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(state.title || '奇境弹球', ui.title.x, ui.title.y);

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.textAlign = 'right';
    ctx.fillText('最高  ' + (state.best == null ? 0 : state.best), ui.best.x, ui.best.y);

    if (state.phase !== 'settle' && state.modal !== 'empty') {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.hud || '#E8F3FF';
      var level = state.level || {};
      var score = level.score == null ? 0 : level.score;
      var target = level.target == null ? 150 : level.target;
      var left = level.shotsLeft == null ? 0 : level.shotsLeft;
      var max = level.shotsMax == null ? 3 : level.shotsMax;
      ctx.fillText(score + ' / ' + target, ui.stats.x, ui.stats.y + 12);
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('剩 ' + left + ' 弹 / ' + max, viewport.width * 0.5, ui.stats.y + 12);
      ctx.textAlign = 'right';
      ctx.fillStyle = colors.stamina || '#A5B4FC';
      ctx.fillText('星力  ' + (state.stamina == null ? 0 : state.stamina), ui.best.x, ui.stats.y + 12);

      var i;
      for (i = 0; i < ui.skills.length; i++) {
        drawSkill(ctx, ui.skills[i], colors, state.skill === ui.skills[i].id);
      }

      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(state.hint || hintFor(state.phase, state.charging, state.skill), ui.hint.x, ui.hint.y - 18);
      drawLegend(ctx, ui, colors);
      drawPower(ctx, ui, state.power || 0, colors);
    }

    if (state.toast && state.toast.ttl > 0) {
      ctx.globalAlpha = Math.min(1, state.toast.ttl / 0.25);
      ctx.fillStyle = state.toast.hex || colors.scorePop || '#FDE68A';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(state.toast.text, ui.toast.x, ui.toast.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (state.modal === 'empty') {
      drawEmpty(ctx, ui, state, colors, viewport);
    } else if (state.phase === 'settle' && state.settle) {
      drawSettle(ctx, ui, state, colors, viewport);
    }
  }

  return {
    layout: layout,
    hitTest: hitTest,
    draw: draw,
    hintFor: hintFor,
    inRect: inRect
  };
});
