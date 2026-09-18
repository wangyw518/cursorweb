(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuFx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function spawnBurst(list, x, y, hex, count) {
    var n = count || 18;
    var i;
    for (i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n;
      var spd = 40 + (i % 5) * 12;
      list.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.42,
        max: 0.42,
        hex: hex || '#FDE68A',
        r: 2.2
      });
    }
    return list;
  }

  function step(list, dt) {
    var i = list.length;
    while (i--) {
      var p = list[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) list.splice(i, 1);
    }
    return list;
  }

  function draw(ctx, list) {
    var i;
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.hex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  return {
    spawnBurst: spawnBurst,
    step: step,
    draw: draw
  };
});
