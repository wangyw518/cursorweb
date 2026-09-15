function roundRect(ctx, x, y, w, h, r) {
  var rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTopBar(ctx, view, snapshot, dashCd01, flash, colors) {
  var w = view.w;
  var pad = 10;
  var h = 36;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#12192d';
  roundRect(ctx, pad, 8, w - pad * 2, h, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash) * 0.55;
    ctx.fillStyle = colors.nearMissFlash;
    roundRect(ctx, pad, 8, w - pad * 2, h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#e8eefc';
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'middle';
  var cy = 8 + h / 2;
  var score = snapshot.score;
  var sec = snapshot.surviveSec.toFixed(1);
  var cd = dashCd01 <= 0 ? '就绪' : dashCd01.toFixed(1) + 's';
  var mid = w / 2;
  ctx.textAlign = 'left';
  ctx.fillText('分 ' + score, pad + 12, cy);
  ctx.textAlign = 'center';
  ctx.fillText(sec + 's', mid, cy);
  ctx.textAlign = 'right';
  ctx.fillStyle = dashCd01 <= 0 ? colors.player : '#9aa6c3';
  ctx.fillText('冲 ' + cd, w - pad - 12, cy);

  if (snapshot.multiplier > 1) {
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.nearMissFlash;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('×1.5', pad + 12, 52);
  }
  ctx.restore();
}

function layoutControls(view) {
  var margin = 16;
  var btnH = 52;
  var gap = 12;
  var y = view.h - btnH - 18;
  var btnW = (view.w - margin * 2 - gap) / 2;
  return {
    jump: { x: margin, y: y, w: btnW, h: btnH, label: '跳' },
    dash: { x: margin + btnW + gap, y: y, w: btnW, h: btnH, label: '冲' }
  };
}

function drawControls(ctx, controls, colors, dashReady) {
  function button(rect, fill, ready) {
    ctx.save();
    ctx.globalAlpha = ready ? 0.95 : 0.45;
    ctx.fillStyle = fill;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0B1020';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rect.label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }
  button(controls.jump, colors.player, true);
  button(controls.dash, colors.nearMissFlash, dashReady);
}

function hitRect(rect, p) {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

function layoutSettle(view, shareHint) {
  var cardW = Math.min(320, view.w - 32);
  var cardH = shareHint ? 292 : 248;
  var x = (view.w - cardW) / 2;
  var y = view.h * 0.26;
  var replay = { x: x + 20, y: y + cardH - 100, w: cardW - 40, h: 44, label: '再跑一次' };
  var share = { x: x + 20, y: y + cardH - 48, w: cardW - 40, h: 36, label: '分享成绩' };
  return { x: x, y: y, w: cardW, h: cardH, replay: replay, share: share };
}

function drawSettle(ctx, view, settle, shareHint, colors) {
  var layout = layoutSettle(view, shareHint);
  ctx.save();
  ctx.fillStyle = '#151c30';
  roundRect(ctx, layout.x, layout.y, layout.w, layout.h, 16);
  ctx.fill();
  ctx.strokeStyle = colors.player;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#e8eefc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('晚一步', layout.x + layout.w / 2, layout.y + 18);

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = colors.player;
  ctx.fillText(String(settle.score), layout.x + layout.w / 2, layout.y + 48);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#c5cde0';
  ctx.fillText('存活 ' + settle.surviveSec.toFixed(1) + ' 秒', layout.x + layout.w / 2, layout.y + 86);

  ctx.font = 'bold 14px sans-serif';
  if (settle.isRecord) {
    ctx.fillStyle = colors.nearMissFlash;
    ctx.fillText('新纪录！', layout.x + layout.w / 2, layout.y + 112);
  } else {
    ctx.fillStyle = '#9aa6c3';
    ctx.fillText('距最高分还差 ' + settle.gap, layout.x + layout.w / 2, layout.y + 112);
  }

  ctx.fillStyle = colors.player;
  roundRect(ctx, layout.replay.x, layout.replay.y, layout.replay.w, layout.replay.h, 10);
  ctx.fill();
  ctx.fillStyle = '#0B1020';
  ctx.font = 'bold 16px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(layout.replay.label, layout.replay.x + layout.replay.w / 2, layout.replay.y + layout.replay.h / 2);

  ctx.strokeStyle = '#8B93A7';
  ctx.lineWidth = 1.5;
  roundRect(ctx, layout.share.x, layout.share.y, layout.share.w, layout.share.h, 10);
  ctx.stroke();
  ctx.fillStyle = '#c5cde0';
  ctx.font = '13px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(layout.share.label, layout.share.x + layout.share.w / 2, layout.share.y + layout.share.h / 2);

  if (shareHint) {
    ctx.font = '10px sans-serif';
    ctx.fillStyle = colors.nearMissFlash;
    ctx.textBaseline = 'top';
    wrapText(ctx, shareHint, layout.x + layout.w / 2, layout.y + 136, layout.w - 28, 13);
  }
  ctx.restore();
  return layout;
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  var chars = text.split('');
  var line = '';
  var yy = y;
  for (var i = 0; i < chars.length; i++) {
    var test = line + chars[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = chars[i];
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

function drawHint(ctx, view, lines, alpha) {
  if (alpha <= 0) return;
  var list = Array.isArray(lines) ? lines : [lines];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#c5cde0';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (var i = 0; i < list.length; i++) {
    ctx.fillText(list[i], view.w / 2, 52 + i * 16);
  }
  ctx.restore();
}

module.exports = {
  drawTopBar: drawTopBar,
  layoutControls: layoutControls,
  drawControls: drawControls,
  hitRect: hitRect,
  layoutSettle: layoutSettle,
  drawSettle: drawSettle,
  drawHint: drawHint
};
