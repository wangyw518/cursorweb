(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiHud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
    var playTop = top + 58;
    var playBottom = btnY - 26;
    return {
      title: { x: pad, y: top + 20 },
      timer: { x: viewport.width - pad, y: top + 18 },
      score: { x: viewport.width - pad, y: top + 40 },
      undo: { x: pad, y: btnY, w: btnW, h: btnH, label: '撤销' },
      clear: { x: pad + btnW + 12, y: btnY, w: btnW, h: btnH, label: '清除' },
      hint: { x: viewport.width * 0.5, y: btnY - 16 },
      toast: { x: viewport.width * 0.5, y: playTop + 28 },
      playRect: {
        x: 16,
        y: playTop,
        w: viewport.width - 32,
        h: Math.max(120, playBottom - playTop)
      }
    };
  }

  function hitTest(ui, x, y) {
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
    ctx.fillStyle = pressed ? '#243456' : (colors.button || '#182238');
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder || '#3a4d78';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#e8f0ff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function draw(ctx, ui, state, colors) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#c8d4f0';
    ctx.font = '700 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('星轨', ui.title.x, ui.title.y);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = colors.hudDim || '#7b88a6';
    ctx.textAlign = 'right';
    ctx.fillText('时间  ' + (state.timer == null ? 60 : state.timer), ui.timer.x, ui.timer.y);
    ctx.fillText('分数  ' + (state.score == null ? 0 : state.score), ui.score.x, ui.score.y);

    drawButton(ctx, ui.undo, colors, state.pressed === 'undo');
    drawButton(ctx, ui.clear, colors, state.pressed === 'clear');

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.hudDim || '#7b88a6';
    ctx.fillText(state.hint || '点亮一颗星，连接附近的星', ui.hint.x, ui.hint.y);

    if (state.toast && state.toast.ttl > 0) {
      ctx.globalAlpha = Math.min(1, state.toast.ttl / 0.25);
      ctx.fillStyle = colors.reject || '#ff5a6a';
      ctx.font = '14px sans-serif';
      ctx.fillText(state.toast.text, ui.toast.x, ui.toast.y);
    }

    ctx.restore();
  }

  return {
    layout: layout,
    hitTest: hitTest,
    draw: draw,
    inRect: inRect
  };
});
