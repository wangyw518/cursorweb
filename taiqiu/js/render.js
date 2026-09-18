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

  function pathProjectedRect(ctx, session, rect, pad) {
    var p = pad || 0;
    var tl = table.project(rect.x - p, rect.y - p, session.table, session.viewMode);
    var tr = table.project(rect.x + rect.w + p, rect.y - p, session.table, session.viewMode);
    var br = table.project(rect.x + rect.w + p, rect.y + rect.h + p, session.table, session.viewMode);
    var bl = table.project(rect.x - p, rect.y + rect.h + p, session.table, session.viewMode);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    return { tl: tl, tr: tr, br: br, bl: bl };
  }

  function drawWood(ctx, session) {
    var o = session.table.outer;
    var colors = session.config.colors;
    ctx.save();
    pathProjectedRect(ctx, session, o, 0);
    var g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    g.addColorStop(0, colors.woodLight);
    g.addColorStop(0.4, colors.wood);
    g.addColorStop(1, colors.woodDark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#24140A';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    var i;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#4A2A12';
    ctx.lineWidth = 1;
    for (i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(o.x + 5, o.y + 6 + i * (o.h / 12));
      ctx.bezierCurveTo(
        o.x + o.w * 0.3, o.y + i * (o.h / 12),
        o.x + o.w * 0.7, o.y + 14 + i * (o.h / 12),
        o.x + o.w - 5, o.y + 6 + i * (o.h / 12)
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFelt(ctx, session) {
    var f = session.table.felt;
    var colors = session.config.colors;
    ctx.save();
    pathProjectedRect(ctx, session, f, 0);
    ctx.clip();
    var mid = table.project(f.cx, f.cy, session.table, session.viewMode);
    var g = ctx.createRadialGradient(mid.x, mid.y, 16, mid.x, mid.y, f.h * 0.78);
    g.addColorStop(0, colors.feltLight);
    g.addColorStop(0.42, colors.felt);
    g.addColorStop(1, colors.feltDark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, session.viewport.width, session.viewport.height);

    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = colors.feltNap;
    ctx.lineWidth = 1;
    var y;
    for (y = f.y; y < f.y + f.h; y += 4) {
      var a = table.project(f.x, y, session.table, session.viewMode);
      var b = table.project(f.x + f.w, y + 1.2, session.table, session.viewMode);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#0A7A48';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 5;
    pathProjectedRect(ctx, session, f, 1.2);
    ctx.stroke();
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

  function zoneColor(kind, colors) {
    if (kind === 'meteor') return colors.tileMeteor || '#7DD3FC';
    if (kind === 'comet') return colors.tileComet || '#C4B5FD';
    if (kind === 'stellar') return colors.tileStellar || '#F5D76E';
    return colors.tileNova || '#FDE68A';
  }

  function drawZoneMark(ctx, t, p, s, hex) {
    ctx.strokeStyle = hex;
    ctx.fillStyle = hex;
    ctx.lineWidth = 1.2;
    if (t.pattern === 'streak') {
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.7, p.y + s * 0.35);
      ctx.lineTo(p.x + s * 0.7, p.y - s * 0.35);
      ctx.stroke();
      return;
    }
    if (t.pattern === 'arc') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.42, 0.4, 2.6);
      ctx.stroke();
      return;
    }
    if (t.pattern === 'burst') {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s * 0.55);
      ctx.lineTo(p.x + s * 0.18, p.y - s * 0.12);
      ctx.lineTo(p.x + s * 0.55, p.y);
      ctx.lineTo(p.x + s * 0.18, p.y + s * 0.12);
      ctx.lineTo(p.x, p.y + s * 0.55);
      ctx.lineTo(p.x - s * 0.18, p.y + s * 0.12);
      ctx.lineTo(p.x - s * 0.55, p.y);
      ctx.lineTo(p.x - s * 0.18, p.y - s * 0.12);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  }

  function tileHasLandFlash(session, tile) {
    return !!(
      session.landFlash &&
      session.landFlash.frames > 0 &&
      session.landFlash.tileId === tile.id
    );
  }

  function consumeLandFlash(session) {
    if (!session.landFlash) return;
    session.landFlash.frames -= 1;
    if (session.landFlash.frames <= 0) session.landFlash = null;
  }

  function findLandFlashTile(session) {
    if (!session.landFlash || session.landFlash.frames <= 0) return null;
    var i;
    for (i = 0; i < session.tiles.length; i++) {
      if (session.tiles[i].id === session.landFlash.tileId) return session.tiles[i];
    }
    return null;
  }

  function paintLandFlashDiamond(ctx, session, tile, sizeScale) {
    var p = table.project(tile.x, tile.y, session.table, session.viewMode);
    var s = tile.size * sizeScale * p.s;
    drawDiamond(ctx, p.x, p.y, s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    return p;
  }

  function drawLandFlash(ctx, session) {
    var tile = findLandFlashTile(session);
    if (!tile) return;
    ctx.save();
    ctx.globalAlpha = 1;
    paintLandFlashDiamond(ctx, session, tile, 0.62);
    ctx.restore();
  }

  function drawTiles(ctx, session) {
    var colors = session.config.colors;
    var i;
    for (i = 0; i < session.tiles.length; i++) {
      var t = session.tiles[i];
      var p = table.project(t.x, t.y, session.table, session.viewMode);
      var s = t.size * 0.5 * p.s;
      var hex = zoneColor(t.kind, colors);
      var flashing = tileHasLandFlash(session, t);
      ctx.save();
      if (flashing) {
        ctx.globalAlpha = 1;
        paintLandFlashDiamond(ctx, session, t, 0.5);
      } else {
        drawDiamond(ctx, p.x, p.y, s);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = hex;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = hex;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      drawZoneMark(ctx, t, p, s, flashing ? '#FFFFFF' : hex);
      ctx.font = 'bold ' + Math.max(8, 9 * p.s) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = flashing ? '#FFFFFF' : hex;
      ctx.fillText(t.label + ' +' + t.bonusXingbi, p.x, p.y + s * 0.78);
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
      ctx.arc(p.x, p.y, r + 4.4, 0, Math.PI * 2);
      var chrome = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
      chrome.addColorStop(0, '#F8FAFC');
      chrome.addColorStop(0.35, colors.chrome);
      chrome.addColorStop(1, colors.chromeDark);
      ctx.fillStyle = chrome;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.pocket;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x - r * 0.15, p.y - r * 0.2, r * 0.72, -0.9, 0.6);
      ctx.stroke();
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

  function remoteStick(session) {
    var rem = session.remoteAim;
    if (!rem || session.phase !== 'Aim') return null;
    if (hud.ownTurn && hud.ownTurn(session)) return null;
    var ang = rem.aimAngle != null ? rem.aimAngle : (rem.angle != null ? rem.angle : Math.atan2(rem.ay || -1, rem.ax || 0));
    return {
      ax: rem.ax != null ? rem.ax : Math.cos(ang),
      ay: rem.ay != null ? rem.ay : Math.sin(ang),
      power: rem.power || 0,
      angle: ang,
      dragging: (rem.power || 0) > 0.03
    };
  }

  function drawAim(ctx, session) {
    var stick = session.cue;
    var preview = session.preview;
    var rem = remoteStick(session);
    if (rem) {
      stick = rem;
      preview = (session.remoteAim && (session.remoteAim.preview || session.remoteAim.aimLine)) || preview;
      if (preview && preview.length && !preview.points) preview = { points: preview };
    }
    if (session.phase !== 'Aim' || !stick || stick.power < 0.04) return;
    if (!rem && !session.cue.dragging) return;
    var colors = session.config.colors;
    var pts = preview && preview.points ? preview.points : [];
    if ((!pts || !pts.length) && rem) {
      var cueBallAim = null;
      var bi;
      for (bi = 0; bi < session.balls.length; bi++) {
        if (session.balls[bi].id === 'cue') cueBallAim = session.balls[bi];
      }
      if (cueBallAim) {
        var span = 80 + stick.power * 200;
        pts = [
          { x: cueBallAim.x, y: cueBallAim.y },
          { x: cueBallAim.x + stick.ax * span, y: cueBallAim.y + stick.ay * span }
        ];
      }
    }
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
    if (preview && preview.ghost) {
      var g = table.project(preview.ghost.x, preview.ghost.y, session.table, session.viewMode);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(g.x, g.y, session.balls[0].r * g.s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCueStick(ctx, session) {
    if (session.phase !== 'Aim') return;
    var stick = session.cue;
    var rem = remoteStick(session);
    if (rem) stick = rem;
    else if (session.versus && hud.ownTurn && !hud.ownTurn(session)) return;
    var cueBall = null;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      if (session.balls[i].id === 'cue') cueBall = session.balls[i];
    }
    if (!cueBall || cueBall.pocketed) return;
    var pose = cue.stickPose(stick, cueBall, session.viewport);
    if (!pose) return;
    var a = table.project(pose.tipX, pose.tipY, session.table, session.viewMode);
    var b = table.project(pose.tailX, pose.tailY, session.table, session.viewMode);
    var colors = session.config.colors;
    ctx.save();
    if (rem) ctx.globalAlpha = 0.48;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(a.x + 1.4, a.y + 2);
    ctx.lineTo(b.x + 1.4, b.y + 2);
    ctx.stroke();
    var wood = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    wood.addColorStop(0, '#E8C98A');
    wood.addColorStop(0.35, colors.cueWood);
    wood.addColorStop(1, '#8A6232');
    ctx.strokeStyle = wood;
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = colors.cueWrap;
    ctx.lineWidth = 7.2;
    ctx.beginPath();
    ctx.moveTo(b.x * 0.28 + a.x * 0.72, b.y * 0.28 + a.y * 0.72);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = colors.cueFerrule;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * 0.07, a.y + (b.y - a.y) * 0.07);
    ctx.stroke();
    ctx.fillStyle = colors.cueTip;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 2.6, 0, Math.PI * 2);
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
    drawLandFlash(ctx, session);
    hud.drawChrome(ctx, session);
    hud.drawSplash(ctx, session);
    if (!(session.landFlash && session.landFlash.frames > 0)) {
      hud.drawSettle(ctx, session);
    }
    if (hud.drawRoomPanel) hud.drawRoomPanel(ctx, session);
    consumeLandFlash(session);
  }

  return {
    draw: draw,
    drawTiles: drawTiles,
    drawBall: drawBall,
    drawLandFlash: drawLandFlash,
    tileHasLandFlash: tileHasLandFlash,
    remoteStick: remoteStick
  };
});
