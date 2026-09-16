'use strict';

const math = require('./math.js');

const MAX_PARTICLES = 140;

function createFx() {
  return {
    particles: [],
    flashes: [],
    rings: [],
    ripples: [],
    popups: [],
    pulse: 0,
    flash: 0,
    hitStop: 0,
    shake: 0,
    vignette: 0
  };
}

function burst(fx, x, y, color, n) {
  const count = n || 16;
  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
    const a = Math.random() * Math.PI * 2;
    const spd = 28 + Math.random() * 140;
    fx.particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 1,
      decay: 1.15 + Math.random() * 1.4,
      r: 1.1 + Math.random() * 2.4,
      color: color || '#E8F2FF'
    });
  }
}

function shatterTrail(fx, points) {
  for (let i = 1; i < points.length; i++) {
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      burst(
        fx,
        math.lerp(points[i - 1].x, points[i].x, t),
        math.lerp(points[i - 1].y, points[i].y, t),
        '#FFB0A4',
        4
      );
    }
  }
}

function flash(fx, amount) {
  fx.flash = Math.max(fx.flash, amount == null ? 0.28 : amount);
}

function pulse(fx, amount) {
  fx.pulse = Math.max(fx.pulse, amount == null ? 1 : amount);
}

function hitStop(fx, frames) {
  fx.hitStop = Math.max(fx.hitStop, frames || 3);
}

function shake(fx, amount) {
  fx.shake = Math.max(fx.shake, amount || 0.35);
}

function ring(fx, x, y, color) {
  fx.rings.push({ x: x, y: y, r: 6, life: 1, color: color || '#E8F2FF' });
}

function ripple(fx, x, y) {
  fx.ripples.push({ x: x, y: y, r: 4, life: 1 });
}

function popup(fx, x, y, text, color) {
  fx.popups.push({ x: x, y: y, text: text, life: 1, color: color || '#F4F7FF' });
}

function update(fx, dt) {
  fx.flash = Math.max(0, fx.flash - dt * 2.8);
  fx.pulse = Math.max(0, fx.pulse - dt * 3.4);
  fx.shake = Math.max(0, fx.shake - dt * 2.2);
  fx.vignette = Math.max(0, fx.vignette - dt * 0.25);

  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= p.decay * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    if (p.life <= 0) fx.particles.splice(i, 1);
  }
  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const r = fx.rings[i];
    r.life -= dt * 1.6;
    r.r += dt * 220;
    if (r.life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.ripples.length - 1; i >= 0; i--) {
    const r = fx.ripples[i];
    r.life -= dt * 2.2;
    r.r += dt * 90;
    if (r.life <= 0) fx.ripples.splice(i, 1);
  }
  for (let i = fx.popups.length - 1; i >= 0; i--) {
    const p = fx.popups[i];
    p.life -= dt * 0.85;
    p.y -= dt * 28;
    if (p.life <= 0) fx.popups.splice(i, 1);
  }
}

function draw(ctx, fx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < fx.particles.length; i++) {
    const p = fx.particles[i];
    ctx.globalAlpha = Math.max(0, p.life) * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.6 + p.life * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < fx.rings.length; i++) {
    const r = fx.rings[i];
    ctx.globalAlpha = r.life * 0.55;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  for (let i = 0; i < fx.ripples.length; i++) {
    const r = fx.ripples[i];
    ctx.globalAlpha = r.life * 0.28;
    ctx.strokeStyle = 'rgba(220,230,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < fx.popups.length; i++) {
    const p = fx.popups[i];
    ctx.globalAlpha = Math.min(1, p.life * 1.8);
    ctx.fillStyle = p.color;
    ctx.font = '18px "PingFang SC","Hiragino Sans GB","WenQuanYi Micro Hei","Microsoft YaHei",sans-serif';
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function drawFlash(ctx, fx, w, h) {
  if (fx.flash <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = fx.flash;
  ctx.fillStyle = 'rgba(236, 244, 255, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

module.exports = {
  createFx: createFx,
  burst: burst,
  shatterTrail: shatterTrail,
  flash: flash,
  pulse: pulse,
  hitStop: hitStop,
  shake: shake,
  ring: ring,
  ripple: ripple,
  popup: popup,
  update: update,
  draw: draw,
  drawFlash: drawFlash
};
