import { clear, el, resultPanel, toast } from '../shared/dom.js';

export const redPacket = {
  id: 'red-packet',
  name: '红包会跑',
  tagline: '点早是空的，点晚被截走',
  vibe: '手速街机 · 30 秒',
};

export function mountRedPacket(root) {
  const stage = root;
  clear(stage);
  const canvas = el('canvas');
  const hud = el('div', { className: 'hud-top' });
  stage.append(canvas, hud);
  const ctx = canvas.getContext('2d');

  let cssW = 0;
  let cssH = 0;
  let packets = [];
  let score = 0;
  let combo = 0;
  let timeLeft = 30;
  let spawnCd = 0;
  let over = false;
  let running = false;
  let last = performance.now();
  let raf;

  function resize() {
    const r = stage.getBoundingClientRect();
    cssW = r.width;
    cssH = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn() {
    const ripeDelay = 0.35 + Math.random() * 0.55;
    packets.push({
      x: 40 + Math.random() * (cssW - 80),
      y: 80 + Math.random() * (cssH - 220),
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 180,
      r: 28,
      age: 0,
      ripeAt: ripeDelay,
      expireAt: ripeDelay + 0.55 + Math.random() * 0.35,
      stolen: false,
      value: Math.random() < 0.12 ? 8.88 : Math.random() < 0.5 ? 1.68 : 0.01,
    });
  }

  function tap(x, y) {
    if (!running || over) return;
    let hit = null;
    let best = Infinity;
    for (const p of packets) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r + 16 && d < best) {
        best = d;
        hit = p;
      }
    }
    if (!hit) {
      combo = 0;
      return;
    }
    if (hit.age < hit.ripeAt) {
      combo = 0;
      score = Math.max(0, score - 0.5);
      toast(stage, '太早了！空包');
      packets = packets.filter((p) => p !== hit);
      return;
    }
    if (hit.stolen || hit.age > hit.expireAt) {
      combo = 0;
      toast(stage, '被别人截走了');
      packets = packets.filter((p) => p !== hit);
      return;
    }
    combo += 1;
    const gain = hit.value * (1 + Math.min(combo, 8) * 0.08);
    score += gain;
    toast(stage, `+¥${gain.toFixed(2)}  连击x${combo}`);
    packets = packets.filter((p) => p !== hit);
  }

  function finish() {
    over = true;
    running = false;
    stage.append(
      resultPanel({
        title: score >= 12 ? '手速封神' : score >= 6 ? '小赚一笔' : '只摸到灰',
        body: `抢到 ¥${score.toFixed(2)}，最大连击相关表现看手感。分享一句：我摸到 ${score.toFixed(2)}，你来？`,
        actions: [
          {
            label: '再抢 30 秒',
            primary: true,
            onClick: () => {
              stage.querySelector('.panel')?.remove();
              start();
            },
          },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function start() {
    packets = [];
    score = 0;
    combo = 0;
    timeLeft = 30;
    spawnCd = 0;
    over = false;
    running = true;
    last = performance.now();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running) {
      timeLeft -= dt;
      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawn();
        spawnCd = Math.max(0.28, 0.7 - (30 - timeLeft) * 0.012);
      }
      for (const p of packets) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 30 || p.x > cssW - 30) p.vx *= -1;
        if (p.y < 70 || p.y > cssH - 80) p.vy *= -1;
        if (!p.stolen && p.age > p.expireAt - 0.12 && Math.random() < 0.04) p.stolen = true;
      }
      packets = packets.filter((p) => p.age < p.expireAt + 0.25);
      if (timeLeft <= 0) finish();
    }

    // draw chatty bg
    ctx.fillStyle = '#1b2a24';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = 'rgba(214,255,63,0.05)';
    for (let i = 0; i < 6; i += 1) ctx.fillRect(20, 90 + i * 70, cssW - 40, 36);

    for (const p of packets) {
      const ripe = p.age >= p.ripeAt && !p.stolen && p.age <= p.expireAt;
      const early = p.age < p.ripeAt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(p.age * 10) * 0.12);
      ctx.fillStyle = p.stolen ? '#666' : early ? '#b84a4a' : '#e64545';
      round(ctx, -22, -28, 44, 56, 8);
      ctx.fill();
      ctx.fillStyle = ripe ? '#ffd36a' : '#c9a24a';
      ctx.fillRect(-14, -8, 28, 10);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('¥', 0, 18);
      if (ripe) {
        ctx.strokeStyle = 'rgba(255,211,106,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    hud.innerHTML = `<span>倒计时 <strong>${Math.max(0, timeLeft).toFixed(1)}s</strong></span><span>金额 <strong>¥${score.toFixed(2)}</strong></span><span>连击 <strong>${combo}</strong></span>`;
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    tap(e.clientX - r.left, e.clientY - r.top);
  });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  stage.append(
    resultPanel({
      title: '红包会跑',
      body: '红包装熟会亮圈，那时再点。太早=空包，太晚=被截走。目标：30 秒多抢。',
      actions: [
        {
          label: '开抢',
          primary: true,
          onClick: () => {
            stage.querySelector('.panel')?.remove();
            resize();
            start();
          },
        },
      ],
    }),
  );

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    clear(root);
  };
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
