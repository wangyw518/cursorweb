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
    var top = (viewport.safeTop || 20) + 8;
    var bottomSafe = viewport.safeBottom || 0;
    var skillH = 40;
    var legendH = 18;
    var skillY = viewport.height - bottomSafe - 16 - legendH - skillH;
    var playTop = top + 70;
    var playBottom = skillY - 10;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.44;
    var skillW = 72;
    var skillGap = 10;
    var skillsLeft = cx - (skillW * 1.5 + skillGap);
    return {
      title: { x: pad, y: top + 18 },
      subtitle: { x: pad, y: top + 36 },
      stamina: { x: viewport.width - pad, y: top + 16 },
      best: { x: viewport.width - pad, y: top + 34 },
      meter: { x: cx, y: top + 56 },
      hint: { x: cx, y: skillY - 8 },
      legend: { x: cx, y: skillY + skillH + 14 },
      toast: { x: cx, y: playTop + 22 },
      power: { x: pad, y: skillY - 6, w: viewport.width - pad * 2, h: 3 },
      skillFire: { x: skillsLeft, y: skillY, w: skillW, h: skillH, label: '炎核', skill: 'fire' },
      skillIce: { x: skillsLeft + skillW + skillGap, y: skillY, w: skillW, h: skillH, label: '霜核', skill: 'ice' },
      skillSplit: { x: skillsLeft + (skillW + skillGap) * 2, y: skillY, w: skillW, h: skillH, label: '裂核', skill: 'split' },
      settleScore: { x: cx, y: cy - 64 },
      settleCell: { x: cx, y: cy - 22 },
      settleGap: { x: cx, y: cy - 2 },
      replay: { x: cx - 72, y: cy + 18, w: 144, h: 40, label: '再试一次' },
      next: { x: cx - 72, y: cy + 18, w: 144, h: 40, label: '下一关' },
      share: { x: cx - 72, y: cy + 66, w: 144, h: 36, label: '分享' },
      ad: { x: cx - 72, y: cy + 108, w: 144, h: 36, label: '星尘补给' },
      playRect: {
        x: 16,
        y: playTop,
        w: viewport.width - 32,
        h: Math.max(140, playBottom - playTop)
      }
    };
  }

  function hitTest(ui, x, y, phase, settle) {
    if (phase === 'settle' || phase === 'need-stamina') {
      if (phase === 'settle' && settle && settle.won && settle.hasNext && inRect(ui.next, x, y)) {
        return 'next';
      }
      if (!(settle && settle.needStamina) && inRect(ui.replay, x, y)) {
        return 'replay';
      }
      if (inRect(ui.share, x, y)) return 'share';
      if (inRect(ui.ad, x, y)) return 'ad';
      return 'settle-block';
    }
    if (phase === 'aim') {
      if (inRect(ui.skillFire, x, y)) return 'skill-fire';
      if (inRect(ui.skillIce, x, y)) return 'skill-ice';
      if (inRect(ui.skillSplit, x, y)) return 'skill-split';
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

  function drawButton(ctx, btn, colors, pressed, dim) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#243456' : (colors.button || '#12183A');
    ctx.globalAlpha = dim ? 0.4 : 1;
    ctx.fill();
    ctx.strokeStyle = btn.border || colors.buttonBorder || '#67E8F9';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#E8F3FF';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawSkills(ctx, ui, state, colors) {
    var skills = [
      { btn: ui.skillFire, id: 'fire', hex: colors.skillFire || '#FB7185' },
      { btn: ui.skillIce, id: 'ice', hex: colors.skillIce || '#7DD3FC' },
      { btn: ui.skillSplit, id: 'split', hex: colors.skillSplit || '#C4B5FD' }
    ];
    var i;
    for (i = 0; i < skills.length; i++) {
      var s = skills[i];
      var used = state.skills && state.skills.used && state.skills.used[s.id];
      var armed = state.skills && state.skills.armed === s.id;
      var btn = {
        x: s.btn.x,
        y: s.btn.y,
        w: s.btn.w,
        h: s.btn.h,
        label: s.btn.label,
        border: s.hex
      };
      drawButton(ctx, btn, colors, armed || state.pressed === 'skill-' + s.id, used);
      if (armed && !used) {
        ctx.save();
        ctx.strokeStyle = s.hex;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        roundRect(ctx, s.btn.x - 2, s.btn.y - 2, s.btn.w + 4, s.btn.h + 4, 12);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawLegend(ctx, ui, colors) {
    var items = [
      { hex: colors.cellDust || '#7DD3FC', label: '尘' },
      { hex: colors.cellCrystal || '#5EEAD4', label: '晶' },
      { hex: colors.cellNebula || '#A78BFA', label: '云' },
      { hex: colors.cellRelic || '#F5C542', label: '遗' }
    ];
    var cx = (ui.legend || ui.hint).x;
    var y = (ui.legend || ui.hint).y;
    ctx.save();
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var i;
    var gap = 52;
    var start = cx - gap * 1.5;
    for (i = 0; i < items.length; i++) {
      var x = start + i * gap;
      ctx.beginPath();
      ctx.fillStyle = items[i].hex;
      ctx.globalAlpha = 0.9;
      ctx.arc(x - 12, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(items[i].label, x + 6, y);
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

  function landedCellLine(settle) {
    if (!settle || settle.oob || settle.lastOob) return '落在哪一格  界外';
    if (settle.cellName) return '落在哪一格  ' + settle.cellName;
    return '落在哪一格  空';
  }

  function settleCopy(settle) {
    if (!settle) return { title: '本局分数', line: '', cell: '落在哪一格  空' };
    if (settle.needStamina) {
      return { title: '星尘不足', line: '分享或补给后继续', cell: '' };
    }
    if (settle.won) {
      return {
        title: '奇境通关',
        line: settle.isNew ? '新纪录' : '目标  ' + settle.target,
        cell: landedCellLine(settle)
      };
    }
    if (settle.lost) {
      return {
        title: '未达星轨',
        line: '距目标  ' + Math.max(0, settle.target - settle.score),
        cell: landedCellLine(settle)
      };
    }
    if (settle.oob) return { title: '偏离星表', line: '', cell: landedCellLine(settle) };
    if (settle.isNew) return { title: '本局分数', line: '新纪录', cell: landedCellLine(settle) };
    if (settle.best === 0 && settle.score === 0) {
      return { title: '本局分数', line: '暂无纪录', cell: landedCellLine(settle) };
    }
    return { title: '本局分数', line: '距最高分  ' + settle.gap, cell: landedCellLine(settle) };
  }

  function drawSettle(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.fillStyle = 'rgba(7,11,24,0.72)';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    var panelW = 268;
    var panelH = 286;
    var px = ui.settleScore.x - panelW * 0.5;
    var py = ui.settleScore.y - 64;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fillStyle = colors.bgInner || '#141B3A';
    ctx.fill();
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    var copy = settleCopy(state.settle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.font = '13px ' + FONT;
    ctx.fillText(copy.title, ui.settleScore.x, ui.settleScore.y - 28);

    ctx.fillStyle = colors.scorePop || '#FDE68A';
    ctx.font = '700 36px ' + FONT;
    ctx.fillText(String(state.settle.score || 0), ui.settleScore.x, ui.settleScore.y + 8);

    ctx.font = '14px ' + FONT;
    ctx.fillStyle = state.settle.cellName
      ? (colors.cellRelic || '#F5C542')
      : (colors.hudDim || '#8AA0C8');
    ctx.fillText(copy.cell, (ui.settleCell || ui.settleGap).x, (ui.settleCell || ui.settleGap).y);

    ctx.font = '14px ' + FONT;
    ctx.fillStyle = state.settle.won || state.settle.isNew
      ? (colors.ringGold || '#F5C542')
      : (colors.hudDim || '#8AA0C8');
    ctx.fillText(copy.line, ui.settleGap.x, ui.settleGap.y + 8);

    if (state.settle.edge) {
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.aim || '#67E8F9';
      ctx.fillText('擦边 ×1.2', ui.settleGap.x, ui.settleGap.y + 26);
    }

    var primary = (state.settle.won && state.settle.hasNext) ? ui.next : ui.replay;
    if (!state.settle.needStamina) {
      drawButton(ctx, primary, colors, state.pressed === 'replay' || state.pressed === 'next');
    }
    drawButton(ctx, ui.share, colors, state.pressed === 'share');
    drawButton(ctx, ui.ad, colors, state.pressed === 'ad');
    ctx.restore();
  }

  function hintFor(phase, charging) {
    if (phase === 'flight') return '星尘飞行中';
    if (charging || phase === 'charging') return '松手弹射';
    if (phase === 'settle' || phase === 'need-stamina') return '';
    return '点技能，拖动瞄准弹射';
  }

  function draw(ctx, ui, state, colors, viewport) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '700 20px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('星尘弹射', ui.title.x, ui.title.y);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.fillText('奇境弹球', ui.subtitle.x, ui.subtitle.y);

    ctx.textAlign = 'right';
    ctx.fillStyle = colors.hud || '#E8F3FF';
    ctx.font = '13px ' + FONT;
    var stam = state.stamina == null ? 30 : state.stamina;
    var stamMax = state.staminaMax == null ? 30 : state.staminaMax;
    ctx.fillText('体力  ' + stam + '/' + stamMax, ui.stamina.x, ui.stamina.y);
    ctx.fillStyle = colors.hudDim || '#8AA0C8';
    ctx.fillText('最高  ' + (state.best == null ? 0 : state.best), ui.best.x, ui.best.y);

    if (state.phase !== 'settle' && state.phase !== 'need-stamina') {
      var lv = state.level || {};
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.hud || '#E8F3FF';
      ctx.font = '13px ' + FONT;
      ctx.fillText(
        '关卡 ' + (lv.id || 1) +
          '  ·  ' + (lv.score || 0) + '/' + (lv.target || 0) +
          '  ·  杆 ' + (lv.remaining == null ? 0 : lv.remaining),
        ui.meter.x,
        ui.meter.y
      );
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = colors.hudDim || '#8AA0C8';
      ctx.fillText(state.hint || hintFor(state.phase, state.charging), ui.hint.x, ui.hint.y);
      drawLegend(ctx, ui, colors);
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

    if ((state.phase === 'settle' || state.phase === 'need-stamina') && state.settle) {
      drawSettle(ctx, ui, state, colors, viewport);
    }
  }

  return {
    layout: layout,
    hitTest: hitTest,
    draw: draw,
    hintFor: hintFor,
    settleCopy: settleCopy,
    landedCellLine: landedCellLine,
    inRect: inRect
  };
});
