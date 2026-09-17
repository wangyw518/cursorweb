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
    ctx.arcTo(x, y, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawTable(ctx, table, colors) {
    var b = table.bounds;
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 18);
    var g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, colors.tableOuter || '#070B18');
    g.addColorStop(0.4, colors.tableInner || '#141B3A');
    g.addColorStop(1, colors.tableOuter || '#070B18');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(colors.bumper || '#38BDF8', 0.35);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawVoids(ctx, table, colors) {
    ctx.save();
    var i;
    for (i = 0; i < table.voids.length; i++) {
      var v = table.voids[i];
      var rg = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, table.voidGap * 1.15);
      rg.addColorStop(0, rgba(colors.void || '#2E1065', 0.85));
      rg.addColorStop(0.55, rgba(colors.void || '#2E1065', 0.28));
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
      ctx.strokeStyle = rgba(colors.bumper || '#38BDF8', 0.18);
      ctx.lineWidth = (w.r || 5) * 3.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.strokeStyle = colors.bumper || '#38BDF8';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = (w.r || 5) * 1.15;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawObstacles(ctx, obstacles, colors) {
    ctx.save();
    var i;
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var g = ctx.createRadialGradient(o.x - o.r * 0.25, o.y - o.r * 0.3, 1, o.x, o.y, o.r * 1.35);
      g.addColorStop(0, rgba(colors.obstacleRim || '#7DD3FC', 0.35));
      g.addColorStop(0.45, colors.obstacle || '#1B2438');
      g.addColorStop(1, rgba(colors.bgOuter || '#070B18', 0.95));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.obstacleRim || '#7DD3FC';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.6;
      ctx.stroke();
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
      ctx.beginPath();
      ctx.arc(r.x, r.y, (r.innerR + r.outerR) * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 1 : 0.22;
      ctx.lineWidth = (r.outerR - r.innerR) + (flashing ? 4 : 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(r.x, r.y, r.outerR, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 1 : 0.9;
      ctx.lineWidth = flashing ? 3.4 : 2.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(r.x, r.y, r.innerR, 0, Math.PI * 2);
      ctx.strokeStyle = flashing ? '#FFFFFF' : hex;
      ctx.globalAlpha = flashing ? 0.95 : 0.7;
      ctx.lineWidth = flashing ? 2.6 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLauncher(ctx, launcher, colors) {
    var w = launcher.w;
    var h = launcher.h;
    var x = launcher.x - w * 0.5;
    var y = launcher.y - h * 0.5;
    ctx.save();
    ctx.shadowColor = rgba(colors.capsuleRim || '#67E8F9', 0.45);
    ctx.shadowBlur = 12;
    roundRect(ctx, x, y, w, h, h * 0.5);
    ctx.fillStyle = colors.capsule || '#0B1224';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.capsuleRim || '#67E8F9';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colors.ballGlow || '#7DD3FC';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 5, y + 5, w - 10, h - 10, (h - 10) * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx, ball, colors, pulse) {
    var p = pulse == null ? 1 : pulse;
    ctx.save();
    var glow = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, ball.r * 3.1 * p);
    glow.addColorStop(0, rgba(colors.ballGlow || '#7DD3FC', 0.55));
    glow.addColorStop(0.45, rgba(colors.ballGlow || '#7DD3FC', 0.18));
    glow.addColorStop(1, rgba(colors.ballGlow || '#7DD3FC', 0));
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
    ctx.strokeStyle = rgba(colors.aim || '#67E8F9', 0.55);
    ctx.lineWidth = 1.6;
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
