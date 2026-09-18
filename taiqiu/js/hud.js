(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuHud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONT = '"WenQuanYi Micro Hei", "PingFang SC", "Droid Sans Fallback", sans-serif';

  function inRect(r, x, y) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  function layout(viewport) {
    var pad = 14;
    var top = (viewport.safeTop || 20) + 6;
    var bottomSafe = viewport.safeBottom || 0;
    var footerH = 52;
    var playTop = top + 62;
    var playBottom = viewport.height - bottomSafe - footerH - 10;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.46;
    return {
      title: { x: pad, y: top + 16 },
      target: { x: pad, y: top + 36 },
      best: { x: viewport.width - pad, y: top + 50 },
      mode: {
        x: viewport.width - pad - 84,
        y: top + 8,
        w: 84,
        h: 26,
        label: '瞄准3D'
      },
      hint: { x: cx, y: playBottom + 14 },
      disclaimer: { x: cx, y: viewport.height - bottomSafe - 14 },
      power: { x: pad + 24, y: playBottom + 22, w: viewport.width - pad * 2 - 48, h: 6 },
      settleCard: { x: cx - 132, y: cy - 118, w: 264, h: 236 },
      settleScore: { x: cx, y: cy - 78 },
      settleGap: { x: cx, y: cy - 18 },
      settleProp: { x: cx, y: cy + 10 },
      replay: { x: cx - 72, y: cy + 42, w: 144, h: 40, label: '再来一杆' },
      playRect: {
        x: 10,
        y: playTop,
        w: viewport.width - 20,
        h: Math.max(180, playBottom - playTop)
      }
    };
  }

  function hitTest(ui, x, y, phase) {
    if (inRect(ui.mode, x, y)) return 'aim3d';
    if (phase === 'Settle') {
      if (inRect(ui.replay, x, y)) return 'replay';
      if (inRect(ui.settleCard, x, y)) return 'settle-block';
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

  function drawButton(ctx, btn, colors, pressed) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#3D2A18' : (colors.button || '#2A1C12');
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder || '#D4B483';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#F4E8D4';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawChrome(ctx, session) {
    var ui = session.ui;
    var colors = session.config.colors;
    var lowest = session.target;
    ctx.save();
    ctx.fillStyle = colors.hud;
    ctx.font = 'bold 17px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(session.config.title || '星券台球', ui.title.x, ui.title.y);

    ctx.fillStyle = colors.hudDim;
    ctx.font = '12px ' + FONT;
    var targetText = lowest ? ('目标 ' + lowest.n + ' 号球') : '目标已完成';
    ctx.fillText(targetText, ui.target.x, ui.target.y);

    ctx.textAlign = 'right';
    ctx.fillStyle = colors.hud;
    ctx.font = '12px ' + FONT;
    ctx.fillText('最佳 ' + (session.best || 0) + ' 星币', ui.best.x, ui.best.y);

    drawButton(ctx, {
      x: ui.mode.x,
      y: ui.mode.y,
      w: ui.mode.w,
      h: ui.mode.h,
      label: session.aim3d ? '瞄准3D·开' : '瞄准3D'
    }, colors, session.pressed === 'aim3d' || session.aim3d);

    if (session.phase === 'Aim' && session.cue.dragging) {
      var p = session.cue.power;
      ctx.fillStyle = '#2A1C12';
      roundRect(ctx, ui.power.x, ui.power.y, ui.power.w, ui.power.h, 3);
      ctx.fill();
      ctx.fillStyle = '#F5D76E';
      roundRect(ctx, ui.power.x, ui.power.y, ui.power.w * p, ui.power.h, 3);
      ctx.fill();
    } else if (session.phase === 'Aim') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('俯视瞄准 · 拖动球杆后拉蓄力', ui.hint.x, ui.hint.y);
    } else if (session.phase === 'Shot') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('出杆中…', ui.hint.x, ui.hint.y);
    } else if (session.phase === 'WaitCueStop') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('等待母球停稳…', ui.hint.x, ui.hint.y);
    }

    if (session.toast && session.toast.text) {
      ctx.fillStyle = colors.hud;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(session.toast.text, ui.hint.x, ui.hint.y - 16);
    }

    ctx.fillStyle = colors.disclaimer || '#A89880';
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(session.config.disclaimer, ui.disclaimer.x, ui.disclaimer.y);
    ctx.restore();
  }

  function drawSettle(ctx, session) {
    if (session.phase !== 'Settle' || !session.settle) return;
    var ui = session.ui;
    var colors = session.config.colors;
    var s = session.settle;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 9, 6, 0.55)';
    ctx.fillRect(0, 0, session.viewport.width, session.viewport.height);
    roundRect(ctx, ui.settleCard.x, ui.settleCard.y, ui.settleCard.w, ui.settleCard.h, 16);
    ctx.fillStyle = '#24180F';
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = colors.hud;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    var title = '本杆星币';
    if (!s.legal) {
      if (s.reason === 'scratch') title = '犯规 · 白球入袋';
      else if (s.reason === 'order') title = '犯规 · 未按9球顺序';
      else if (s.reason === 'whiff') title = '犯规 · 未碰目标球';
      else title = '未进目标球';
    }
    ctx.fillText(title, ui.settleScore.x, ui.settleScore.y - 22);

    ctx.font = 'bold 36px ' + FONT;
    ctx.fillStyle = '#F5D76E';
    ctx.fillText(String(s.coins != null ? s.coins : s.points) + ' 星币', ui.settleScore.x, ui.settleScore.y + 16);

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hud;
    var gapText = s.isNew ? '新纪录' : ('距最佳 还差 ' + s.gap + ' 星币');
    ctx.fillText(gapText, ui.settleGap.x, ui.settleGap.y);

    ctx.font = '11px ' + FONT;
    ctx.fillStyle = colors.hudDim;
    var propLine = s.starApplied
      ? ('星域 ' + (s.zoneLabel || '新星') + ' ×' + s.starMultiplier)
      : '犯规跳过星域倍率';
    ctx.fillText(propLine, ui.settleProp.x, ui.settleProp.y);

    ctx.font = '10px ' + FONT;
    ctx.fillStyle = colors.disclaimer;
    ctx.fillText(s.disclaimer, ui.settleProp.x, ui.settleProp.y + 18);

    drawButton(ctx, ui.replay, colors, session.pressed === 'replay');
    ctx.restore();
  }

  return {
    FONT: FONT,
    inRect: inRect,
    layout: layout,
    hitTest: hitTest,
    roundRect: roundRect,
    drawButton: drawButton,
    drawChrome: drawChrome,
    drawSettle: drawSettle
  };
});
