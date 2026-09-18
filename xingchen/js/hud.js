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
    var skillH = 40;
    var hintH = 18;
    var playTop = top + 64;
    var playBottom = viewport.height - bottomSafe - 16 - skillH - hintH - 10;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.46;
    var skillY = playBottom + 8;
    var skillW = Math.min(96, (viewport.width - pad * 2 - 16) / 3);
    var skillGap = 8;
    var skillStart = cx - (skillW * 3 + skillGap * 2) * 0.5;
    return {
      title: { x: pad, y: top + 18 },
      best: { x: viewport.width - pad, y: top + 18 },
      stats: { x: pad, y: top + 40, w: viewport.width - pad * 2 },
      hint: { x: cx, y: viewport.height - bottomSafe - 12 },
      toast: { x: cx, y: playTop + 22 },
      power: { x: pad, y: playBottom - 6, w: viewport.width - pad * 2, h: 3 },
      skills: [
        { id: 'fire', x: skillStart, y: skillY, w: skillW, h: skillH, label: '炎破' },
        { id: 'ice', x: skillStart + skillW + skillGap, y: skillY, w: skillW, h: skillH, label: '霜止' },
        { id: 'split', x: skillStart + (skillW + skillGap) * 2, y: skillY, w: skillW, h: skillH, label: '分影' }
      ],
      settleScore: { x: cx, y: cy - 58 },
      settleGap: { x: cx, y: cy - 8 },
      replay: { x: cx - 150, y: cy + 46, w: 140, h: 42, label: '再来一局' },
      next: { x: cx + 10, y: cy + 46, w: 140, h: 42, label: '下一关' },
      share: { x: cx - 150, y: cy + 36, w: 140, h: 42, label: '分享助力' },
      ad: { x: cx + 10, y: cy + 36, w: 140, h: 42, label: '观看星辉' },
      playRect: {
        x: 14,
        y: playTop,
        w: viewport.width - 28,
        h: Math.max(160, playBottom - playTop - 8)
      }
    };
  }

  function hitTest(ui, x, y, phase) {
    if (phase === 'stamina') {
      if (inRect(ui.share, x, y)) return 'share';
      if (inRect(ui.ad, x, y)) return 'ad';
      return 'stamina-block';
    }
    if (phase === 'settle') {
      var replaySolo = {
        x: ui.settleScore.x - 72,
        y: ui.replay.y,
        w: 144,
        h: ui.replay.h
      };
      if (inRect(ui.replay, x, y) || inRect(replaySolo, x, y)) return 'replay';
      if (inRect(ui.next, x, y)) return 'next';
      return 'settle-block';
    }
    if (phase === 'aim' || phase === 'between') {
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

  function drawButton(ctx, btn, colors, pressed, opts) {
    opts = opts || {};
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#243456' : (opts.fill || colors.button || '#12183A');
    ctx.fill();
    ctx.strokeStyle = opts.border || colors.buttonBorder || '#67E8F9';
    ctx.lineWidth = opts.selected ? 2 : 1.2;
    ctx.globalAlpha = opts.disabled ? 0.4 : 1;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#E8F3FF';
    ctx.font = (opts.font || '15px ') + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + (opts.dy || 1));
    if (opts.sub) {
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(opts.sub, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 12);
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

  function drawSkills(ctx, ui, state, colors) {
    var uses = state.skillUses || {};
    var i;
    for (i = 0; i < ui.skills.length; i++) {
      var btn = ui.skills[i];
      var left = uses[btn.id] == null ? 0 : uses[btn.id];
      var selected = state.selectedSkill === btn.id;
      var hex = btn.id === 'fire'
        ? colors.skillFire
        : (btn.id === 'ice' ? colors.skillIce : colors.skillSplit);
      drawButton(ctx, btn, colors, state.pressed === 'skill:' + btn.id, {
        selected: selected,
        disabled: left <= 0,
        border: selected ? hex : (colors.buttonBorder || '#67E8F9'),
        fill: selected ? 'rgba(18,24,58,0.96)' : (colors.button || '#12183A'),
        dy: left > 0 ? -6 : 1,
        sub: left > 0 ? ('×' + left) : '—'
      });
    }
  }

  function drawPanel(ctx, viewport, colors, w, h, cy) {
    ctx.fillStyle = 'rgba(7,11,24,0.74)';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    var px = viewport.width * 0.5 - w * 0.5;
    var py = cy - h * 0.42;
    roundRect(ctx, px, py, w, h, 16);
    ctx.fillStyle = colors.bgInner || '#141B3A';
    ctx.fill();
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    return { x: px, y: py, w: w, h: h };
  }

  function drawSettle(ctx, ui, state, colors, viewport) {
    ctx.save();
    drawPanel(ctx, viewport, colors, 300, 248, ui.settleScore.y + 40);
    var settle = state.settle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    var title = settle.won ? '奇境通关' : (settle.oob && settle.score === 0 ? '偏离星表' : '本关结算');
    ctx.fillText(title, ui.settleScore.x, ui.settleScore.y - 36);

    ctx.fillStyle = colors.scorePop || '#FDE68A';
    ctx.font = '700 34px ' + FONT;
    ctx.fillText(String(settle.score), ui.settleScore.x, ui.settleScore.y + 4);

    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.fillText('目标  ' + settle.target + '   ·   星晶  +' + (settle.crystals || 0), ui.settleGap.x, ui.settleGap.y - 4);

    if (settle.isNew) {
      ctx.fillStyle = colors.cellGold || '#F5C542';
      ctx.fillText('新纪录', ui.settleGap.x, ui.settleGap.y + 18);
    } else {
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('距最高分  ' + settle.gap, ui.settleGap.x, ui.settleGap.y + 18);
    }

    ctx.fillStyle = settle.won ? (colors.cellGold || '#F5C542') : (colors.hudDim || '#8AA0C8');
    ctx.font = '12px ' + FONT;
    ctx.fillText(settle.won ? '星核抵达目标' : '弹数用尽', ui.settleGap.x, ui.settleGap.y + 36);

    if (settle.won && settle.hasNext) {
      drawButton(ctx, ui.replay, colors, state.pressed === 'replay');
      drawButton(ctx, ui.next, colors, state.pressed === 'next');
    } else {
      var replay = {
        x: ui.settleScore.x - 72,
        y: ui.replay.y,
        w: 144,
        h: ui.replay.h,
        label: ui.replay.label
      };
      drawButton(ctx, replay, colors, state.pressed === 'replay');
    }
    ctx.restore();
  }

  function drawStamina(ctx, ui, state, colors, viewport) {
    ctx.save();
    drawPanel(ctx, viewport, colors, 300, 220, ui.settleScore.y + 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 20px ' + FONT;
    ctx.fillText('星力耗尽', ui.settleScore.x, ui.settleScore.y - 24);
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    ctx.fillText('分享助力或观看星辉回充星力', ui.settleScore.x, ui.settleScore.y + 4);
    ctx.font = '11px ' + FONT;
    ctx.fillText('仅回复虚拟星力', ui.settleScore.x, ui.settleScore.y + 24);
    drawButton(ctx, ui.share, colors, state.pressed === 'share');
    drawButton(ctx, ui.ad, colors, state.pressed === 'ad', { border: colors.crystal || '#A78BFA' });
    ctx.restore();
  }

  function hintFor(phase, charging) {
    if (phase === 'flight') return '星核飞行中';
    if (charging || phase === 'charging') return '松手弹射';
    if (phase === 'settle') return '';
    if (phase === 'stamina') return '星力耗尽';
    if (phase === 'between') return '符印结算';
    return '选技能，拖动瞄准';
  }

  function draw(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 20px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(state.title || '奇境弹球', ui.title.x, ui.title.y);

    ctx.font = '12px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.textAlign = 'right';
    ctx.fillText('最高  ' + (state.best == null ? 0 : state.best), ui.best.x, ui.best.y);

    if (state.phase !== 'settle' && state.phase !== 'stamina') {
      ctx.textAlign = 'left';
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.hud || '#E8F3FF';
      var levelName = state.levelName || '';
      var line = (state.levelId ? ('第' + state.levelId + '关 ') : '') + levelName;
      ctx.fillText(line, ui.stats.x, ui.stats.y);

      ctx.textAlign = 'right';
      ctx.fillStyle = colors.crystal || '#A78BFA';
      ctx.fillText('星晶 ' + (state.crystals || 0), ui.stats.x + ui.stats.w, ui.stats.y);

      ctx.textAlign = 'center';
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.scorePop || '#FDE68A';
      ctx.fillText((state.score || 0) + ' / ' + (state.target || 0), ui.hint.x - 52, ui.stats.y);
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText('弹 ' + (state.shotsLeft == null ? 0 : state.shotsLeft) +
        '   星力 ' + (state.stamina == null ? 0 : state.stamina), ui.hint.x + 48, ui.stats.y);

      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(state.hint || hintFor(state.phase, state.charging), ui.hint.x, ui.hint.y);
      drawSkills(ctx, ui, state, colors);
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
    if (state.phase === 'stamina') {
      drawStamina(ctx, ui, state, colors, viewport);
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
