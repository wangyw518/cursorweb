(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenFx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function fillDeepSpace(ctx, w, h, colors) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colors.bgOuter || '#070B18');
    g.addColorStop(0.45, colors.bgInner || '#141B3A');
    g.addColorStop(1, colors.bgOuter || '#070B18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var rg = ctx.createRadialGradient(w * 0.5, h * 0.38, 12, w * 0.5, h * 0.42, Math.max(w, h) * 0.72);
    rg.addColorStop(0, rgba(colors.bgInner || '#141B3A', 0.55));
    rg.addColorStop(1, rgba(colors.bgOuter || '#070B18', 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  function makeDust(bounds, count) {
    var dust = [];
    var i;
    var n = count || 48;
    for (i = 0; i < n; i++) {
      var u = (i * 47 + 13) % 97 / 97;
      var v = (i * 31 + 7) % 89 / 89;
      dust.push({
        x: bounds.x + 8 + u * (bounds.w - 16),
        y: bounds.y + 8 + v * (bounds.h - 16),
        r: 0.6 + (i % 3) * 0.45,
        a: 0.12 + (i % 5) * 0.05
      });
    }
    return dust;
  }

  function drawDust(ctx, dust) {
    if (!dust) return;
    ctx.save();
    var i;
    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.fillStyle = 'rgba(232,243,255,' + d.a + ')';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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

  function drawTable(ctx, table, colors) {
    var b = table.bounds;
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 22);
    var g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.15, b.y + b.h);
    g.addColorStop(0, colors.tableOuter || '#070B18');
    g.addColorStop(0.38, colors.tableInner || '#141B3A');
    g.addColorStop(1, colors.tableOuter || '#070B18');
    ctx.fillStyle = g;
    ctx.fill();
    var rg = ctx.createRadialGradient(
      b.x + b.w * 0.5,
      b.y + b.h * 0.42,
      20,
      b.x + b.w * 0.5,
      b.y + b.h * 0.45,
      Math.max(b.w, b.h) * 0.62
    );
    rg.addColorStop(0, rgba(colors.tableInner || '#141B3A', 0.55));
    rg.addColorStop(1, rgba(colors.tableOuter || '#070B18', 0));
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();
  }

  function drawVoids(ctx, table, colors) {
    ctx.save();
    var i;
    for (i = 0; i < table.voids.length; i++) {
      var v = table.voids[i];
      var rg = ctx.createRadialGradient(v.x, v.y, 1, v.x, v.y, table.voidGap * 1.35);
      rg.addColorStop(0, 'rgba(8,4,18,0.96)');
      rg.addColorStop(0.4, rgba(colors.void || '#2E1065', 0.7));
      rg.addColorStop(1, rgba(colors.void || '#2E1065', 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(v.x, v.y, table.voidGap * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWalls(ctx, walls, colors) {
    ctx.save();
    ctx.lineCap = 'round';
    var i;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.shadowColor = colors.bumper || '#38BDF8';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = rgba(colors.bumper || '#38BDF8', 0.22);
      ctx.lineWidth = (w.r || 5) * 3.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.strokeStyle = colors.bumper || '#38BDF8';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = (w.r || 5) * 1.25;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawCells(ctx, cells, colors, flashCell, now) {
    if (!cells) return;
    ctx.save();
    var t = now || 0;
    var i;
    for (i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var hex = colors[cell.rarity === 'bronze' ? 'cellBronze'
        : cell.rarity === 'silver' ? 'cellSilver'
          : cell.rarity === 'gold' ? 'cellGold' : 'cellEpic'] || '#C9D6EA';
      var flashing = flashCell && flashCell === cell;
      var pulse = 0.16 + Math.sin(t * 2.1 + i * 0.35) * 0.04;
      roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 7);
      ctx.fillStyle = rgba(hex, flashing ? 0.42 : pulse);
      ctx.fill();
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 1 : 0.78;
      ctx.lineWidth = flashing ? 2.2 : 1.1;
      ctx.shadowColor = flashing ? '#FFFFFF' : hex;
      ctx.shadowBlur = flashing ? 16 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = flashing ? 0.95 : 0.88;
      drawSigil(ctx, cell, hex, flashing);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawSigil(ctx, cell, hex, flashing) {
    var cx = cell.cx;
    var cy = cell.cy - 1;
    var s = Math.min(cell.w, cell.h) * 0.22;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
    ctx.fillStyle = flashing ? 'rgba(255,255,255,0.85)' : rgba(hex, 0.85);
    ctx.lineWidth = 1.3;
    if (cell.rarity === 'epic') {
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.35);
      ctx.lineTo(s * 0.38, 0);
      ctx.lineTo(0, s * 1.35);
      ctx.lineTo(-s * 0.38, 0);
      ctx.closePath();
      ctx.fill();
    } else if (cell.rarity === 'gold') {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.72, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.72, 0);
      ctx.closePath();
      ctx.fill();
    } else if (cell.rarity === 'silver') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.72, 0.35, Math.PI * 1.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-s * 0.12, 0, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, s * 0.25);
      ctx.lineTo(0, -s * 0.7);
      ctx.lineTo(s * 0.7, s * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * 0.55);
      ctx.lineTo(s * 0.45, s * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    drawChest(ctx, cell, hex, flashing);
  }

  function drawChest(ctx, cell, hex, flashing) {
    var w = Math.min(16, cell.w * 0.34);
    var h = Math.min(10, cell.h * 0.22);
    var x = cell.cx - w * 0.5;
    var y = cell.y + cell.h - h - 4;
    ctx.save();
    ctx.fillStyle = flashing ? '#FFFFFF' : rgba(hex, 0.7);
    ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y + h * 0.32, w, h * 0.68, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.38);
    ctx.lineTo(x + w * 0.18, y + 1);
    ctx.lineTo(x + w * 0.82, y + 1);
    ctx.lineTo(x + w, y + h * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flashing ? '#FFFFFF' : rgba('#E8F3FF', 0.55);
    ctx.beginPath();
    ctx.arc(cell.cx, y + h * 0.58, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTargets(ctx, targets, colors, now) {
    if (!targets) return;
    ctx.save();
    var t = now || 0;
    var i;
    for (i = 0; i < targets.length; i++) {
      var o = targets[i];
      var hex = o.hex || colors.scorePop || '#FDE68A';
      var pulse = 1 + Math.sin(t * 3 + i) * 0.06;
      var alpha = o.collected ? 0.28 : 0.95;
      ctx.globalAlpha = alpha;
      var glow = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, o.r * 3.2 * pulse);
      glow.addColorStop(0, rgba(hex, 0.7));
      glow.addColorStop(1, rgba(hex, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 2.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      var core = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 1, o.x, o.y, o.r);
      core.addColorStop(0, '#FFFFFF');
      core.addColorStop(0.45, hex);
      core.addColorStop(1, '#141B3A');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (o.collected ? 0.72 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawObstacles(ctx, obstacles, colors) {
    ctx.save();
    var i;
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.broken) continue;
      ctx.shadowColor = rgba(colors.obstacleRim || '#7DD3FC', 0.55);
      ctx.shadowBlur = 14;
      var g = ctx.createRadialGradient(o.x - o.r * 0.28, o.y - o.r * 0.32, 1, o.x, o.y, o.r);
      g.addColorStop(0, '#31415F');
      g.addColorStop(0.45, colors.obstacle || '#1B2438');
      g.addColorStop(1, '#070B18');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = colors.obstacleRim || '#7DD3FC';
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rgba(colors.obstacleRim || '#7DD3FC', 0.35);
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.28, o.y - o.r * 0.3, o.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function ringHex(ring, colors) {
    return colors[ring.colorKey] || colors.ringGreen || '#4ADE80';
  }

  function drawRings(ctx, rings, colors, flashRing) {
    ctx.save();
    var i;
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      var hex = ringHex(r, colors);
      var flashing = flashRing && flashRing === r;
      var mid = (r.innerR + r.outerR) * 0.5;
      ctx.shadowColor = flashing ? '#FFFFFF' : hex;
      ctx.shadowBlur = flashing ? 18 : 12;
      ctx.beginPath();
      ctx.arc(r.x, r.y, mid, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 1 : 0.28;
      ctx.lineWidth = (r.outerR - r.innerR) + (flashing ? 5 : 0);
      ctx.stroke();

      ctx.shadowBlur = flashing ? 10 : 0;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.outerR, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 1 : 0.95;
      ctx.lineWidth = flashing ? 3.6 : 2.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(r.x, r.y, r.innerR, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 0.95 : 0.78;
      ctx.lineWidth = flashing ? 2.8 : 1.7;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawLauncher(ctx, launcher, colors) {
    var w = launcher.w;
    var h = launcher.h;
    var x = launcher.x - w * 0.5;
    var y = launcher.y - h * 0.5;
    ctx.save();
    ctx.shadowColor = rgba(colors.capsuleRim || '#67E8F9', 0.65);
    ctx.shadowBlur = 16;
    roundRect(ctx, x, y, w, h, h * 0.5);
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#17324A');
    g.addColorStop(0.55, colors.capsule || '#0B1224');
    g.addColorStop(1, '#070B18');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.capsuleRim || '#67E8F9';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (launcher.power > 0.02) {
      ctx.save();
      roundRect(ctx, x + 4, y + 4, w - 8, h - 8, (h - 8) * 0.5);
      ctx.clip();
      ctx.fillStyle = rgba(colors.aim || '#67E8F9', 0.22 + launcher.power * 0.35);
      ctx.fillRect(x + 4, y + 4, (w - 8) * launcher.power, h - 8);
      ctx.restore();
    }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1.1;
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, (h - 12) * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx, ball, colors, pulse, tint) {
    var p = pulse == null ? 1 : pulse;
    var glowHex = tint || colors.ballGlow || '#7DD3FC';
    ctx.save();
    var glow = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, ball.r * 3.6 * p);
    glow.addColorStop(0, rgba(glowHex, 0.7));
    glow.addColorStop(0.4, rgba(glowHex, 0.22));
    glow.addColorStop(1, rgba(glowHex, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 3.1 * p, 0, Math.PI * 2);
    ctx.fill();

    var core = ctx.createRadialGradient(
      ball.x - ball.r * 0.3,
      ball.y - ball.r * 0.35,
      1,
      ball.x,
      ball.y,
      ball.r
    );
    core.addColorStop(0, '#FFFFFF');
    core.addColorStop(0.55, colors.ball || '#FFFFFF');
    core.addColorStop(1, '#B8E6FF');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAim(ctx, ball, launcher, colors) {
    if (!launcher.dragging || launcher.power < 0.02) return;
    var len = 36 + launcher.power * 78;
    var x2 = ball.x + launcher.ax * len;
    var y2 = ball.y + launcher.ay * len;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(colors.aim || '#67E8F9', 0.22);
    ctx.lineWidth = 7 + launcher.power * 4;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = colors.aim || '#67E8F9';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPreview(ctx, points, colors) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (ctx.setLineDash) ctx.setLineDash([5, 7]);
    ctx.shadowColor = colors.aim || '#67E8F9';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = rgba(colors.aim || '#67E8F9', 0.72);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    var i;
    for (i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    var last = points[points.length - 1];
    ctx.fillStyle = colors.aim || '#67E8F9';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function spawnBurst(x, y, config, hex, opts) {
    if (x == null || y == null) return [];
    opts = opts || {};
    var colors = (config && config.colors) || {};
    var cap = (config && config.burstParticleCap) || 64;
    var life = ((config && config.burstLifeMs) || 420) / 1000;
    var n = opts.count != null ? opts.count : 28;
    var out = [];
    var i;
    for (i = 0; i < n && i < cap; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      var spd = 40 + Math.random() * 140;
      out.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 1.4 + Math.random() * 2.4,
        hex: hex || colors.scorePop || '#FDE68A',
        life: life,
        maxLife: life
      });
    }
    return out;
  }

  function drawParticles(ctx, particles) {
    ctx.save();
    var i;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.fillStyle = rgba(p.hex, Math.max(0, p.life / p.maxLife) * 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlash(ctx, w, h, amount, hex) {
    if (!(amount > 0.004)) return;
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.fillStyle = hex ? rgba(hex, 0.42) : 'rgba(255,255,255,0.42)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawPopup(ctx, popup) {
    if (!popup) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, popup.life * 1.6);
    ctx.font = 'bold 24px "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(7,11,24,0.45)';
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillStyle = popup.hex || '#FDE68A';
    ctx.fillText(popup.text, popup.x, popup.y);
    ctx.restore();
  }

  return {
    hexToRgb: hexToRgb,
    rgba: rgba,
    fillDeepSpace: fillDeepSpace,
    makeDust: makeDust,
    drawDust: drawDust,
    drawTable: drawTable,
    drawCells: drawCells,
    drawTargets: drawTargets,
    drawVoids: drawVoids,
    drawWalls: drawWalls,
    drawObstacles: drawObstacles,
    drawRings: drawRings,
    drawLauncher: drawLauncher,
    drawBall: drawBall,
    drawAim: drawAim,
    drawPreview: drawPreview,
    spawnBurst: spawnBurst,
    drawParticles: drawParticles,
    drawFlash: drawFlash,
    drawPopup: drawPopup,
    ringHex: ringHex
  };
});
