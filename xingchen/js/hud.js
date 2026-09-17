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
    var pad = 16;
    var top = (viewport.safeTop || 20) + 10;
    var bottomSafe = viewport.safeBottom || 0;
    var legendH = 22;
    var playTop = top + 56;
    var playBottom = viewport.height - bottomSafe - 18 - legendH;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.48;
    return {
      title: { x: pad, y: top + 20 },
      best: { x: viewport.width - pad, y: top + 20 },
      hint: { x: cx, y: playBottom + 16 },
      toast: { x: cx, y: playTop + 26 },
      power: { x: pad, y: playBottom - 8, w: viewport.width - pad * 2, h: 4 },
      settleScore: { x: cx, y: cy - 46 },
      settleGap: { x: cx, y: cy - 10 },
      replay: { x: cx - 72, y: cy + 28, w: 144, h: 44, label: '再来一局' },
      playRect: {
        x: 16,
        y: playTop,
        w: viewport.width - 32,
        h: Math.max(160, playBottom - playTop - 10)
      }
    };
  }

  function hitTest(ui, x, y, phase) {
    if (phase === 'settle') {
      if (inRect(ui.replay, x, y)) return 'replay';
      return 'settle-block';
    }
    return null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawButton(ctx, btn, colors, pressed) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#243456' : (colors.button || '#12183A');
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder || '#67E8F9';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#E8F3FF';
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawLegend(ctx, ui, colors) {
    var items = [
      { hex: colors.ringGreen || '#4ADE80', label: '10' },
      { hex: colors.ringBlue || '#38BDF8', label: '30' },
      { hex: colors.ringPurple || '#C084FC', label: '80' },
      { hex: colors.ringGold || '#F5C542', label: '200' }
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

  function drawSettle(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.fillStyle = 'rgba(7,11,24,0.72)';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    var panelW = 260;
    var panelH = 200;
    var px = ui.settleScore.x - panelW * 0.5;
    var py = ui.settleScore.y - 58;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fillStyle = colors.bgInner || '#141B3A';
    ctx.fill();
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    var label = state.settle && state.settle.oob ? '偏离星表' : '本局分数';
    ctx.fillText(label, ui.settleScore.x, ui.settleScore.y - 28);

    ctx.fillStyle = colors.scorePop || '#FDE68A';
    ctx.font = '700 36px ' + FONT;
    ctx.fillText(String(state.settle.score), ui.settleScore.x, ui.settleScore.y + 8);

    ctx.font = '14px ' + FONT;
    if (state.settle.isNew) {
      ctx.fillStyle = colors.ringGold || '#F5C542';
      ctx.fillText('新纪录', ui.settleGap.x, ui.settleGap.y + 8);
    } else {
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('距最高分  ' + state.settle.gap, ui.settleGap.x, ui.settleGap.y + 8);
    }

    if (state.settle.edge) {
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.aim || '#67E8F9';
      ctx.fillText('擦边 ×1.2', ui.settleGap.x, ui.settleGap.y + 28);
    }

    drawButton(ctx, ui.replay, colors, state.pressed === 'replay');
    ctx.restore();
  }

  function hintFor(phase, charging) {
    if (phase === 'flight') return '星尘飞行中';
    if (charging || phase === 'charging') return '松手弹射';
    if (phase === 'settle') return '';
    return '拖动瞄准，松手弹射';
  }

  function draw(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('星尘弹射', ui.title.x, ui.title.y);

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.textAlign = 'right';
    ctx.fillText('最高  ' + (state.best == null ? 0 : state.best), ui.best.x, ui.best.y);

    if (state.phase !== 'settle') {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(state.hint || hintFor(state.phase, state.charging), ui.hint.x, ui.hint.y - 18);
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

    if (state.phase === 'settle' && state.settle) {
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
