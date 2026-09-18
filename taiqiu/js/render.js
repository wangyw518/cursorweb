/**
 * Premium felt / wood / chrome / cue drawing. Geometric tiles only — no bills.
 */
(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./table') : root.TaiqiuTable,
    typeof require === 'function' ? require('./cue') : root.TaiqiuCue,
    typeof require === 'function' ? require('./fx') : root.TaiqiuFx,
    typeof require === 'function' ? require('./hud') : root.TaiqiuHud
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (table, cue, fx, hud) {
  'use strict';

  var FONT = hud.FONT;

  function projectBall(session, ball) {
    return table.project(ball.x, ball.y, session.table, session.viewMode);
  }

  function drawBackground(ctx, session) {
    var v = session.viewport;
    var g = ctx.createLinearGradient(0, 0, 0, v.height);
    g.addColorStop(0, '#1A140E');
    g.addColorStop(1, session.config.colors.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.width, v.height);
  }

  function drawWood(ctx, session) {
    var o = session.table.outer;
    var colors = session.config.colors;
    ctx.save();
    hud.roundRect(ctx, o.x, o.y, o.w, o.h, o.r);
    var g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    g.addColorStop(0, colors.woodLight);
    g.addColorStop(0.45, colors.wood);
    g.addColorStop(1, colors.woodDark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#2A160A';
    ctx.lineWidth = 2;
    ctx.stroke();

    var i;
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#3A220F';
    ctx.lineWidth = 1;
    for (i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(o.x + 6, o.y + 8 + i * (o.h / 10));
      ctx.bezierCurveTo(
        o.x + o.w * 0.35, o.y + i * (o.h / 10),
        o.x + o.w * 0.65, o.y + 16 + i * (o.h / 10),
        o.x + o.w - 6, o.y + 8 + i * (o.h / 10)
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFelt(ctx, session) {
    var f = session.table.felt;
    var colors = session.config.colors;
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.clip();
    var g = ctx.createRadialGradient(f.cx, f.cy, 12, f.cx, f.cy, f.h * 0.72);
    g.addColorStop(0, colors.feltLight);
    g.addColorStop(0.45, colors.felt);
    g.addColorStop(1, colors.feltDark);
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, f.h);

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = colors.feltNap;
    ctx.lineWidth = 1;
    var y;
    for (y = f.y; y < f.y + f.h; y += 5) {
      ctx.beginPath();
      ctx.moveTo(f.x, y);
      ctx.lineTo(f.x + f.w, y + 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDiamond(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  }

  function drawTiles(ctx, session) {
    var colors = session.config.colors;
    var i;
    for (i = 0; i < session.tiles.length; i++) {
      var t = session.tiles[i];
      var p = table.project(t.x, t.y, session.table, session.viewMode);
      var s = t.size * 0.55 * p.s;
      var hex = t.kind === 'practice'
        ? colors.tilePractice
        : (t.kind === 'target' ? colors.tileTarget : colors.tileScore);
      ctx.save();
      ctx.globalAlpha = 0.22;
      drawDiamond(ctx, p.x, p.y, s);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = hex;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = hex;
      if (t.kind === 'score') {
        var k;
        var star = '★';
        ctx.font = (9 * p.s) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var marks = '';
        for (k = 0; k < t.stars; k++) marks += star;
        ctx.fillText(marks, p.x, p.y - 1);
      } else {
        ctx.font = (8 * p.s) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.kind === 'practice' ? '练' : '标', p.x, p.y);
      }
      ctx.restore();
    }
  }

  function drawPockets(ctx, session) {
    var colors = session.config.colors;
    var i;
    for (i = 0; i < session.table.pockets.length; i++) {
      var pk = session.table.pockets[i];
      var p = table.project(pk.x, pk.y, session.table, session.viewMode);
      var r = pk.r * p.s;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3.2, 0, Math.PI * 2);
      var chrome = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
      chrome.addColorStop(0, colors.chrome);
      chrome.addColorStop(1, colors.chromeDark);
      ctx.fillStyle = chrome;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.pocket;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSights(ctx, session) {
    var i;
    ctx.save();
    ctx.fillStyle = '#E8D5A3';
    for (i = 0; i < session.table.sights.length; i++) {
      var s = session.table.sights[i];
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 3);
      ctx.lineTo(s.x + 2.4, s.y);
      ctx.lineTo(s.x, s.y + 3);
      ctx.lineTo(s.x - 2.4, s.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAim(ctx, session) {
    if (session.phase !== 'aim' || !session.cue.dragging || session.cue.power < 0.04) return;
    var colors = session.config.colors;
    var pts = session.preview && session.preview.points ? session.preview.points : [];
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = colors.aim;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    var i;
    for (i = 0; i < pts.length; i++) {
      var p = table.project(pts[i].x, pts[i].y, session.table, session.viewMode);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (session.preview && session.preview.ghost) {
      var g = table.project(session.preview.ghost.x, session.preview.ghost.y, session.table, session.viewMode);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(g.x, g.y, session.balls[0].r * g.s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCueStick(ctx, session) {
    if (session.phase !== 'aim') return;
    var cueBall = null;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      if (session.balls[i].id === 'cue') cueBall = session.balls[i];
    }
    if (!cueBall || cueBall.pocketed) return;
    var pose = cue.stickPose(session.cue, cueBall);
    if (!pose) return;
    var a = table.project(pose.tipX, pose.tipY, session.table, session.viewMode);
    var b = table.project(pose.tailX, pose.tailY, session.table, session.viewMode);
    var colors = session.config.colors;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.cueWood;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = colors.cueWrap;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(b.x * 0.35 + a.x * 0.65, b.y * 0.35 + a.y * 0.65);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = colors.cueFerrule;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * 0.06, a.y + (b.y - a.y) * 0.06);
    ctx.stroke();
    ctx.fillStyle = colors.cueTip;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBall(ctx, session, ball) {
    if (ball.pocketed) return;
    var p = projectBall(session, ball);
    var r = ball.r * p.s;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x + 1.2, p.y + 1.8, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    var g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, 1, p.x, p.y, r);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.18, ball.color);
    g.addColorStop(1, ball.id === 'cue' ? '#D1D5DB' : ball.color);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (ball.n >= 1) {
      ctx.fillStyle = ball.n === 8 ? '#F8FAFC' : '#F8FAFC';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold ' + Math.max(8, r * 0.95) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.n), p.x, p.y + 0.4);
    }
    ctx.restore();
  }

  function draw(session, ctx) {
    drawBackground(ctx, session);
    drawWood(ctx, session);
    drawFelt(ctx, session);
    drawTiles(ctx, session);
    drawPockets(ctx, session);
    drawSights(ctx, session);
    drawAim(ctx, session);
    var i;
    for (i = 0; i < session.balls.length; i++) {
      if (session.balls[i].id !== 'cue') drawBall(ctx, session, session.balls[i]);
    }
    for (i = 0; i < session.balls.length; i++) {
      if (session.balls[i].id === 'cue') drawBall(ctx, session, session.balls[i]);
    }
    drawCueStick(ctx, session);
    fx.draw(ctx, session.particles);
    hud.drawChrome(ctx, session);
    hud.drawSettle(ctx, session);
  }

  return {
    draw: draw,
    drawTiles: drawTiles,
    drawBall: drawBall
  };
});
