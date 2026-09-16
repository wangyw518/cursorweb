(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiFx = api;
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
    var g = ctx.createLinearGradient(0, 0, w * 0.15, h);
    g.addColorStop(0, colors.deepSpace || '#0a0e1a');
    g.addColorStop(0.52, colors.deepSpaceMid || '#10182c');
    g.addColorStop(1, colors.nebula || '#160e24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var vg = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.1, w * 0.5, h * 0.5, h * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function starHex(star, colors) {
    return star.hue === 'magenta' ? colors.starMagenta : colors.starCyan;
  }

  function drawDust(ctx, dust, colors) {
    ctx.save();
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.fillStyle = rgba(colors.hud || '#c8d4f0', d.a);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStarGlow(ctx, star, colors, time) {
    var pulse = 1 + Math.sin((time || 0) * 2.1 + star.phase) * (star.tier ? 0.14 : 0.07);
    var hex = starHex(star, colors);
    var r = star.radius * pulse;
    var glowR = r * (star.tier ? 5.4 : 3.7);
    var coreA = star.tier ? 1 : 0.78;

    ctx.save();
    var g = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowR);
    g.addColorStop(0, rgba(hex, coreA));
    g.addColorStop(0.28, rgba(hex, star.tier ? 0.42 : 0.22));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(star.x, star.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,' + (star.tier ? 0.92 : 0.55) + ')';
    ctx.beginPath();
    ctx.arc(star.x, star.y, Math.max(1.2, r * 0.38), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function strokePoly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawNeonPath(ctx, points, colors) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = colors.neonTrail || '#c86bff';
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 13;
    strokePoly(ctx, points);

    ctx.strokeStyle = colors.neonPath || '#7af0ff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5.5;
    strokePoly(ctx, points);

    ctx.strokeStyle = '#f2ffff';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.6;
    strokePoly(ctx, points);
    ctx.restore();
  }

  function drawRejectSegment(ctx, a, b, colors, ttl) {
    if (!a || !b) return;
    var alpha = Math.max(0, Math.min(1, ttl / 0.32));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = colors.reject || '#ff5a6a';
    ctx.globalAlpha = 0.25 + 0.55 * alpha;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRangeRing(ctx, star, radius, colors) {
    if (!star) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colors.neonPath || '#7af0ff';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1.15;
    if (ctx.setLineDash) ctx.setLineDash([3, 7]);
    ctx.stroke();
    ctx.restore();
  }

  function drawActiveHalo(ctx, star, colors, time) {
    if (!star) return;
    var hex = starHex(star, colors);
    var pulse = 1 + Math.sin((time || 0) * 4) * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius * 3.2 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = hex;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(ctx, particles) {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.fillStyle = rgba(p.hex, Math.max(0, p.life / p.maxLife) * 0.85);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return {
    hexToRgb: hexToRgb,
    rgba: rgba,
    fillDeepSpace: fillDeepSpace,
    starHex: starHex,
    drawDust: drawDust,
    drawStarGlow: drawStarGlow,
    drawNeonPath: drawNeonPath,
    drawRejectSegment: drawRejectSegment,
    drawRangeRing: drawRangeRing,
    drawActiveHalo: drawActiveHalo,
    drawParticles: drawParticles
  };
});
