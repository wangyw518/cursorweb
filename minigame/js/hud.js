/**
 * Top HUD + bottom jump/dash pads + compact death card.
 * No fullscreen overlay.
 */

function hexToRgba(hex, alpha) {
  var raw = (hex || '#ffffff').replace('#', '');
  var n = parseInt(raw, 16);
  var r = (n >> 16) & 255;
  var g = (n >> 8) & 255;
  var b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function computeLayout(view) {
  var width = view.width;
  var height = view.height;
  var menu = view.menu || {};
  var hudTop = 16;
  if (typeof menu.bottom === 'number') {
    hudTop = menu.bottom + 6;
  } else if (typeof menu.top === 'number' && typeof menu.height === 'number') {
    hudTop = menu.top + menu.height + 6;
  }

  var pad = Math.max(14, Math.round(width * 0.03));
  var btnW = Math.max(88, Math.round(width * 0.16));
  var btnH = 48;
  var btnY = height - btnH - 16;

  return {
    width: width,
    height: height,
    hudTop: hudTop,
    jumpBtn: { x: pad, y: btnY, w: btnW, h: btnH },
    dashBtn: { x: width - pad - btnW, y: btnY, w: btnW, h: btnH },
    deathCard: {
      x: width / 2 - 118,
      y: height / 2 - 72,
      w: 236,
      h: 132
    },
    restartBtn: {
      x: width / 2 - 72,
      y: height / 2 + 8,
      w: 144,
      h: 40
    },
    controlSplitX: view.controlSplitX
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function hitTest(x, y, layout, dead) {
  if (dead) {
    if (pointInRect(x, y, layout.restartBtn)) {
      return 'restart';
    }
    return null;
  }
  if (pointInRect(x, y, layout.jumpBtn)) {
    return 'jump';
  }
  if (pointInRect(x, y, layout.dashBtn)) {
    return 'dash';
  }
  var split = layout.controlSplitX == null ? 0.5 : layout.controlSplitX;
  if (x < layout.width * split) {
    return 'jump';
  }
  return 'dash';
}

function roundRect(ctx, x, y, w, h, r) {
  var radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawButton(ctx, rect, label, fill, stroke) {
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#E8EEF8';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) {
    return '0.0s';
  }
  return sec.toFixed(1) + 's';
}

function drawHud(ctx, model, layout, config) {
  var colors = (config && config.colors) || {};
  var player = colors.player || '#5CE1E6';
  var terrain = colors.terrain || '#8B93A7';
  var nearMiss = colors.nearMiss || '#FFE66D';

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = 'bold 15px sans-serif';

  ctx.textAlign = 'left';
  ctx.fillStyle = '#E8EEF8';
  ctx.fillText('分数  ' + (model.score == null ? 0 : model.score), 16, layout.hudTop);

  ctx.textAlign = 'center';
  ctx.fillText('存活  ' + formatTime(model.surviveSec), layout.width / 2, layout.hudTop);

  var cdLeft = layout.width - 16;
  var menuLeft = model.menuLeft;
  if (typeof menuLeft === 'number') {
    cdLeft = menuLeft - 12;
  }
  ctx.textAlign = 'right';
  if (model.dashReady) {
    ctx.fillStyle = player;
    ctx.fillText('冲刺  就绪', cdLeft, layout.hudTop);
  } else {
    ctx.fillStyle = nearMiss;
    var remain = Math.max(0, model.dashCdRemainMs || 0) / 1000;
    ctx.fillText('冲刺  ' + remain.toFixed(1) + 's', cdLeft, layout.hudTop);
  }

  var barX = cdLeft - 86;
  var barY = layout.hudTop + 20;
  var barW = 86;
  var barH = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(barX, barY, barW, barH);
  var readyRatio = model.dashReady
    ? 1
    : 1 - Math.min(1, (model.dashCdRemainMs || 0) / ((config && config.dashCdMs) || 800));
  ctx.fillStyle = model.dashReady ? player : nearMiss;
  ctx.fillRect(barX, barY, barW * readyRatio, barH);

  ctx.restore();

  if (!model.dead) {
    drawButton(ctx, layout.jumpBtn, '跳', 'rgba(92,225,230,0.16)', player);
    drawButton(ctx, layout.dashBtn, '冲', 'rgba(255,230,109,0.14)', nearMiss);
  } else {
    var card = layout.deathCard;
    ctx.save();
    roundRect(ctx, card.x, card.y, card.w, card.h, 12);
    ctx.fillStyle = 'rgba(11,16,32,0.92)';
    ctx.fill();
    ctx.strokeStyle = terrain;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#E8EEF8';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var title = '撞上了';
    if (model.deathReason === 'gap') {
      title = '掉下去了';
    } else if (model.deathReason === 'ghost') {
      title = '晚了一步';
    }
    ctx.fillText(title, card.x + card.w / 2, card.y + 36);
    ctx.restore();

    drawButton(ctx, layout.restartBtn, '再来一局', 'rgba(92,225,230,0.22)', player);
  }
}

module.exports = {
  hexToRgba,
  computeLayout,
  hitTest,
  drawHud
};
