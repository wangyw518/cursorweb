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
    var g = ctx.createRadialGradient(w * 0.5, h * 0.38, 16, w * 0.5, h * 0.48, Math.max(w, h) * 0.78);
    g.addColorStop(0, colors.bgInner || '#12183A');
    g.addColorStop(1, colors.bgOuter || '#070B18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function starHex(star, colors) {
    if (star.tier === 1) return colors.starHigh || '#E8F3FF';
    return colors.starLow || '#7EC8FF';
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

  function drawStarGlow(ctx, star, config, time, selected) {
    var colors = config.colors || config;
    var pulse = 1 + Math.sin((time || 0) * 2.1 + star.phase) * (star.tier ? 0.12 : 0.06);
    var hex = starHex(star, colors);
    var glowHex = colors.glow || '#5B8CFF';
    var inner = (config.glowInnerR || 6) * (star.tier ? 1.15 : 0.85) * pulse;
    var outer = (config.glowOuterR || 14) * (star.tier ? 1.2 : 0.9) * pulse;

    ctx.save();
    var g = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, outer);
    g.addColorStop(0, rgba(hex, star.tier ? 1 : 0.82));
    g.addColorStop(0.22, rgba(glowHex, star.tier ? 0.5 : 0.28));
    g.addColorStop(1, rgba(glowHex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(star.x, star.y, outer, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = selected
      ? (colors.selectedCore || '#FFFFFF')
      : rgba(hex, star.tier ? 0.95 : 0.7);
    ctx.beginPath();
    ctx.arc(star.x, star.y, Math.max(1.4, inner * 0.42), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function strokePoly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawNeonPath(ctx, points, config) {
    if (!points || points.length < 2) return;
    var colors = config.colors || config;
    var trailA = config.trailAlpha0 == null ? 0.55 : config.trailAlpha0;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = colors.path || '#A78BFA';
    ctx.globalAlpha = Math.max(0.18, trailA * 0.4);
    ctx.lineWidth = 12;
    strokePoly(ctx, points);

    ctx.strokeStyle = colors.path || '#A78BFA';
    ctx.globalAlpha = trailA;
    ctx.lineWidth = 5;
    strokePoly(ctx, points);

    var headFrom = points[points.length - 2];
    var headTo = points[points.length - 1];
    ctx.strokeStyle = colors.pathHead || '#22D3EE';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(headFrom.x, headFrom.y);
    ctx.lineTo(headTo.x, headTo.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRejectSegment(ctx, a, b, colors, ttl) {
    if (!a || !b) return;
    var alpha = Math.max(0, Math.min(1, ttl / 0.32));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = colors.reject || colors.perfect || '#F472B6';
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
    ctx.strokeStyle = colors.pathHead || '#22D3EE';
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

  /**
   * M2 stub. Keys burstParticleCap / burstLifeMs / perfectFlashColor are frozen.
   */
  function spawnBurst(/* x, y, config */) {
    return [];
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
    drawParticles: drawParticles,
    spawnBurst: spawnBurst
  };
});
