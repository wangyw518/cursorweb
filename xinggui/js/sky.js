'use strict';

function createSky(w, h, rng) {
  const dust = [];
  for (let i = 0; i < 160; i++) {
    dust.push({
      x: rng(),
      y: rng(),
      r: rng() < 0.85 ? 0.45 + rng() * 0.7 : 0.9 + rng() * 1.3,
      a: 0.15 + rng() * 0.55,
      tw: rng() * Math.PI * 2,
      spd: 0.4 + rng() * 1.4,
      layer: rng() < 0.35 ? 0 : rng() < 0.7 ? 1 : 2
    });
  }
  return {
    dust: dust,
    nebula: [
      { x: 0.18, y: 0.22, r: 0.55, color: 'rgba(48, 36, 110, 0.38)' },
      { x: 0.78, y: 0.18, r: 0.48, color: 'rgba(18, 52, 88, 0.40)' },
      { x: 0.62, y: 0.72, r: 0.58, color: 'rgba(62, 24, 72, 0.28)' },
      { x: 0.28, y: 0.78, r: 0.36, color: 'rgba(16, 64, 72, 0.22)' }
    ],
    shoot: { t: 4 + rng() * 6, x: 0, y: 0, vx: 0, vy: 0, life: 0 },
    rng: rng
  };
}

function updateSky(sky, dt, w) {
  sky.shoot.t -= dt;
  if (sky.shoot.life > 0) {
    sky.shoot.life -= dt;
    sky.shoot.x += sky.shoot.vx * dt;
    sky.shoot.y += sky.shoot.vy * dt;
  } else if (sky.shoot.t <= 0) {
    const rng = sky.rng;
    sky.shoot.t = 5 + rng() * 8;
    sky.shoot.life = 0.55;
    sky.shoot.x = rng() * w * 0.7;
    sky.shoot.y = 40 + rng() * 180;
    sky.shoot.vx = 380 + rng() * 220;
    sky.shoot.vy = 120 + rng() * 90;
  }
}

function drawSky(ctx, sky, w, h, time, urgency) {
  ctx.save();
  ctx.fillStyle = '#070B18';
  ctx.fillRect(0, 0, w, h);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(10, 16, 36, 0.0)');
  g.addColorStop(1, 'rgba(4, 6, 14, 0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < sky.nebula.length; i++) {
    const n = sky.nebula[i];
    const ox = Math.sin(time * 0.03 + i) * 18;
    const oy = Math.cos(time * 0.025 + i * 1.3) * 14;
    const x = n.x * w + ox;
    const y = n.y * h + oy;
    const r = n.r * Math.max(w, h);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, n.color);
    grad.addColorStop(1, 'rgba(7,11,24,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const band = ctx.createLinearGradient(0, h * 0.28, w, h * 0.62);
  band.addColorStop(0, 'rgba(80, 90, 140, 0)');
  band.addColorStop(0.45, 'rgba(120, 130, 180, 0.06)');
  band.addColorStop(1, 'rgba(80, 90, 140, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < sky.dust.length; i++) {
    const d = sky.dust[i];
    const par = 0.15 + d.layer * 0.12;
    const x = ((d.x * w + time * par * 6) % (w + 20)) - 10;
    const y = ((d.y * h + Math.sin(time * 0.05 + d.tw) * 4) % (h + 20)) - 10;
    const tw = 0.55 + 0.45 * Math.sin(time * d.spd + d.tw);
    ctx.globalAlpha = d.a * tw;
    ctx.fillStyle = '#E8EEFF';
    ctx.beginPath();
    ctx.arc(x, y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sky.shoot.life > 0) {
    const s = sky.shoot;
    const fade = Math.min(1, s.life * 2);
    ctx.globalAlpha = fade * 0.7;
    const grd = ctx.createLinearGradient(s.x - s.vx * 0.08, s.y - s.vy * 0.08, s.x, s.y);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x - s.vx * 0.08, s.y - s.vy * 0.08);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }
  ctx.restore();

  if (urgency > 0) {
    ctx.save();
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(70, 16, 28, ' + (0.18 * urgency).toFixed(3) + ')');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

module.exports = {
  createSky: createSky,
  updateSky: updateSky,
  drawSky: drawSky
};
