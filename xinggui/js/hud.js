(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiHud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONT = '"WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';

  function inRect(r, x, y) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  function layout(viewport) {
    var pad = 16;
    var top = (viewport.safeTop || 20) + 10;
    var btnW = 92;
    var btnH = 42;
    var bottomSafe = viewport.safeBottom || 0;
    var btnY = viewport.height - bottomSafe - 18 - btnH;
    var playTop = top + 68;
    var playBottom = btnY - 26;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.48;
    return {
      title: { x: pad, y: top + 20 },
      combo: { x: pad, y: top + 42 },
      timer: { x: viewport.width - pad, y: top + 18 },
      score: { x: viewport.width - pad, y: top + 40 },
      undo: { x: pad, y: btnY, w: btnW, h: btnH, label: '撤销' },
      clear: { x: pad + btnW + 12, y: btnY, w: btnW, h: btnH, label: '清除' },
      hint: { x: cx, y: btnY - 16 },
      toast: { x: cx, y: playTop + 28 },
      settleScore: { x: cx, y: cy - 46 },
      settleGap: { x: cx, y: cy - 10 },
      replay: { x: cx - 72, y: cy + 24, w: 144, h: 44, label: '再来一局' },
      share: { x: cx - 72, y: cy + 78, w: 144, h: 40, label: '分享' },
      playRect: {
        x: 16,
        y: playTop,
        w: viewport.width - 32,
        h: Math.max(120, playBottom - playTop)
      }
    };
  }

  function hitTest(ui, x, y, phase) {
    if (phase === 'settle') {
      if (inRect(ui.replay, x, y)) return 'replay';
      if (inRect(ui.share, x, y)) return 'share';
      return 'settle-block';
    }
    if (inRect(ui.undo, x, y)) return 'undo';
    if (inRect(ui.clear, x, y)) return 'clear';
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

  function drawButton(ctx, btn, colors, pressed) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#243456' : (colors.button || '#12183A');
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder || '#5B8CFF';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#E8F3FF';
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawSettle(ctx, ui, state, colors) {
    ctx.save();
    ctx.fillStyle = 'rgba(7,11,24,0.72)';
    ctx.fillRect(0, 0, 2000, 4000);

    var panelW = 260;
    var panelH = 220;
    var px = ui.settleScore.x - panelW * 0.5;
    var py = ui.settleScore.y - 58;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fillStyle = colors.bgInner || '#12183A';
    ctx.fill();
    ctx.strokeStyle = colors.glow || '#5B8CFF';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    ctx.fillText('本局分数', ui.settleScore.x, ui.settleScore.y - 28);

    ctx.fillStyle = colors.scorePop || '#FDE68A';
    ctx.font = '700 36px ' + FONT;
    ctx.fillText(String(state.settle.score), ui.settleScore.x, ui.settleScore.y + 8);

    ctx.font = '14px ' + FONT;
    if (state.settle.isNew) {
      ctx.fillStyle = colors.perfect || '#F472B6';
      ctx.fillText('新纪录', ui.settleGap.x, ui.settleGap.y + 8);
    } else {
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('距最高分  ' + state.settle.gap, ui.settleGap.x, ui.settleGap.y + 8);
    }

    drawButton(ctx, ui.replay, colors, state.pressed === 'replay');
    drawButton(ctx, ui.share, colors, state.pressed === 'share');
    ctx.restore();
  }

  function draw(ctx, ui, state, colors) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('星轨', ui.title.x, ui.title.y);

    if (state.comboText) {
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = colors.combo || '#F472B6';
      ctx.fillText(state.comboText, ui.combo.x, ui.combo.y);
    }

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.textAlign = 'right';
    ctx.fillText('时间  ' + (state.timer == null ? 60 : state.timer), ui.timer.x, ui.timer.y);
    ctx.fillText('分数  ' + (state.score == null ? 0 : state.score), ui.score.x, ui.score.y);

    if (state.phase !== 'settle') {
      drawButton(ctx, ui.undo, colors, state.pressed === 'undo');
      drawButton(ctx, ui.clear, colors, state.pressed === 'clear');
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(state.hint || '点亮一颗星，连接附近的星', ui.hint.x, ui.hint.y);
    }

    if (state.toast && state.toast.ttl > 0) {
      ctx.globalAlpha = Math.min(1, state.toast.ttl / 0.25);
      ctx.fillStyle = state.toast.perfect
        ? (colors.perfect || '#F472B6')
        : (colors.scorePop || '#FDE68A');
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(state.toast.text, ui.toast.x, ui.toast.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (state.phase === 'settle' && state.settle) {
      drawSettle(ctx, ui, state, colors);
    }
  }

  return {
    layout: layout,
    hitTest: hitTest,
    draw: draw,
    inRect: inRect
  };
});
