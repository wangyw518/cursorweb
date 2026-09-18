(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuHud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONT = '"WenQuanYi Micro Hei", "PingFang SC", "Droid Sans Fallback", sans-serif';

  function inRect(r, x, y) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  function layout(viewport) {
    var pad = 14;
    var top = (viewport.safeTop || 20) + 6;
    var bottomSafe = viewport.safeBottom || 0;
    var footerH = 72;
    var playTop = top + 86;
    var playBottom = viewport.height - bottomSafe - footerH - 10;
    var cx = viewport.width * 0.5;
    var cy = viewport.height * 0.46;
    return {
      title: { x: pad, y: top + 16 },
      target: { x: pad, y: top + 36 },
      best: { x: pad, y: top + 52 },
      mode: {
        x: pad,
        y: playBottom + 6,
        w: 70,
        h: 26,
        label: '瞄准3D'
      },
      ai: {
        x: pad + 76,
        y: playBottom + 6,
        w: 70,
        h: 26,
        label: '弱AI试杆'
      },
      room: {
        x: pad + 152,
        y: playBottom + 6,
        w: 78,
        h: 26,
        label: '好友对局'
      },
      rerack: {
        x: pad + 236,
        y: playBottom + 6,
        w: 78,
        h: 26,
        label: '新开一局'
      },
      bgm: {
        x: viewport.width - pad - 46,
        y: top,
        w: 46,
        h: 22,
        label: '音乐'
      },
      hint: { x: viewport.width - pad, y: playTop + 10 },
      turn: { x: cx, y: top + 68 },
      clock: { x: viewport.width - pad, y: top + 36 },
      name0: { x: pad, y: top + 36, w: 102, h: 22 },
      name1: { x: pad + 110, y: top + 36, w: 102, h: 22 },
      disclaimer: { x: cx, y: viewport.height - bottomSafe - 12 },
      power: { x: pad, y: playBottom + 34, w: Math.max(80, viewport.width - pad * 2 - 52), h: 10 },
      powerLabel: { x: viewport.width - pad, y: playBottom + 43 },
      settleCard: { x: cx - 132, y: cy - 140, w: 264, h: 292 },
      settleScore: { x: cx, y: cy - 98 },
      settleGap: { x: cx, y: cy - 18 },
      settleProp: { x: cx, y: cy + 6 },
      replay: { x: cx - 72, y: cy + 32, w: 144, h: 38, label: '再来一局' },
      back: { x: cx - 72, y: cy + 76, w: 144, h: 34, label: '返回' },
      share: { x: cx - 72, y: cy + 116, w: 144, h: 32, label: '分享成绩' },
      count: { x: cx, y: top + 78 },
      splashCard: { x: cx - 132, y: cy - 148, w: 264, h: 300 },
      aiSplash: { x: cx - 124, y: cy + 12, w: 116, h: 42, label: '人机对战' },
      start: { x: cx - 124, y: cy + 12, w: 116, h: 42, label: '人机对战' },
      practice: { x: cx + 8, y: cy + 12, w: 116, h: 42, label: '练习模式' },
      roomSplash: { x: cx - 72, y: cy + 64, w: 144, h: 36, label: '好友对局' },
      roomPanel: { x: cx - 132, y: cy - 110, w: 264, h: 220 },
      roomInvite: { x: cx - 72, y: cy + 8, w: 144, h: 34, label: '邀请好友' },
      roomClose: { x: cx - 72, y: cy + 50, w: 144, h: 34, label: '关闭' },
      playRect: {
        x: 10,
        y: playTop,
        w: viewport.width - 20,
        h: Math.max(180, playBottom - playTop)
      }
    };
  }

  function hitTest(ui, x, y, phase, session) {
    if (phase === 'Settle') {
      if (inRect(ui.replay, x, y)) return 'replay';
      if (session && (session.mode === 'practice' || (session.settle && session.settle.practice))) {
        if (inRect(ui.settleCard, x, y)) return 'settle-block';
        return 'settle-block';
      }
      if (ui.back && inRect(ui.back, x, y)) return 'back';
      if ((!session || !session.versus) && inRect(ui.share, x, y)) return 'share';
      if (inRect(ui.settleCard, x, y)) return 'settle-block';
    }
    if (session && session.roomPanel) {
      if (ui.roomClose && inRect(ui.roomClose, x, y)) return 'room-close';
      if (ui.roomInvite && inRect(ui.roomInvite, x, y)) return 'room';
      if (ui.roomPanel && inRect(ui.roomPanel, x, y)) return 'room';
    }
    if (phase === 'Splash') {
      if (ui.roomSplash && inRect(ui.roomSplash, x, y)) return 'room';
      if (ui.practice && inRect(ui.practice, x, y)) return 'practice';
      if (ui.aiSplash && inRect(ui.aiSplash, x, y)) return 'start-ai';
      if (ui.start && inRect(ui.start, x, y)) return 'start-ai';
      return 'start-ai';
    }
    if (ui.bgm && inRect(ui.bgm, x, y)) return 'bgm';
    if (inRect(ui.mode, x, y)) return 'aim3d';
    if (ui.ai && (!session || (!session.versus && session.mode !== 'ai')) && inRect(ui.ai, x, y)) return 'ai';
    if (ui.room && showsRoomChrome(session) && inRect(ui.room, x, y)) return 'room';
    if (ui.rerack && inRect(ui.rerack, x, y)) return 'rerack';
    return null;
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

  function charUnits(ch) {
    var code = ch.charCodeAt(0);
    return code > 127 ? 2 : 1;
  }

  function truncateName(raw, maxChars) {
    var s = String(raw || '').trim();
    var cap = maxChars == null ? 6 : maxChars;
    if (!s) return '';
    if (s.length <= cap) return s;
    return s.slice(0, cap) + '…';
  }

  function isAiMode(session) {
    return !!(session && (session.localAi || session.mode === 'ai'));
  }

  function isPractice(session) {
    return !!(session && session.mode === 'practice' && !session.versus);
  }

  function showsRoomChrome(session) {
    return !isAiMode(session) && !isPractice(session);
  }

  function turnLabel(session) {
    if (!session.versus) return '';
    var mine = ownTurn(session);
    if (isAiMode(session)) return mine ? '轮到你' : 'AI出杆中';
    var rem = session.remoteAim && !mine && session.remoteAim.kind !== 'firing';
    if (rem) return '对方瞄准中';
    if (session.remoteBusy === 'firing' && !mine) return '对方出杆';
    return mine ? '轮到你出杆' : '对方出杆';
  }

  function settleOutcome(session, s) {
    s = s || session.settle || {};
    if (isPractice(session) || s.practice) return '本局星币';
    if (!session.versus && !s.versus) {
      return (s.win || s.reason === 'nine') ? '你赢了' : '本杆星币';
    }
    if (s.outcome === 'win') return '你赢了';
    if (s.outcome === 'lose') return '你输了';
    if (s.winnerOpenId && session.myOpenId) {
      return s.winnerOpenId === session.myOpenId ? '你赢了' : '你输了';
    }
    var winner = s.winner != null ? s.winner : session.winner;
    return winner === (session.mySeat || 0) ? '你赢了' : '你输了';
  }

  function seatFallback(seat) {
    return seat === 1 ? '好友' : '房主';
  }

  function nameOf(session, seat) {
    if (isAiMode(session) && seat === 1) return '简单AI';
    var names = session && session.names;
    var raw = names && names[seat] ? names[seat] : '';
    if (!raw && isAiMode(session) && seat === 0) {
      raw = session.displayName || '玩家';
    }
    if (!raw) raw = seatFallback(seat);
    return truncateName(raw) || (isAiMode(session) && seat === 0 ? '玩家' : seatFallback(seat));
  }

  function ownTurn(session) {
    return !session.versus || session.turn === session.mySeat ||
      (session.hotseat && !(session.room && session.room.guestJoined));
  }

  function remainSec(session) {
    var at = session.aimDeadlineAt || 0;
    if (!at) return 0;
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  function drawNameChip(ctx, box, session, seat, colors) {
    if (!box) return;
    var active = session.versus && session.turn === seat &&
      !(session.hotseat && !(session.room && session.room.guestJoined) && seat === 1);
    var label = nameOf(session, seat) + ' ' + ((session.scores && session.scores[seat]) || 0);
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = active ? 'rgba(61, 42, 24, 0.92)' : 'rgba(24, 18, 12, 0.55)';
    ctx.fill();
    ctx.strokeStyle = active ? '#F5D76E' : (colors.buttonBorder || '#D4B483');
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = active ? '#F5D76E' : (colors.hud || '#F4E8D4');
    ctx.font = (active ? 'bold 12px ' : '12px ') + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, box.x + box.w * 0.5, box.y + box.h * 0.5 + 1);
    ctx.restore();
  }

  function drawButton(ctx, btn, colors, pressed) {
    ctx.save();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = pressed ? '#3D2A18' : (colors.button || '#2A1C12');
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder || '#D4B483';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = colors.buttonText || '#F4E8D4';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 1);
    ctx.restore();
  }

  function drawChrome(ctx, session) {
    var ui = session.ui;
    var colors = session.config.colors;
    var lowest = session.target;
    ctx.save();
    ctx.fillStyle = colors.hud;
    ctx.font = 'bold 17px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(session.config.title || '星券台球', ui.title.x, ui.title.y);

    ctx.fillStyle = colors.hudDim;
    ctx.font = '12px ' + FONT;
    var mine = ownTurn(session);
    if (isPractice(session)) {
      ctx.fillStyle = colors.hud;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('练习  ·  ' + ((session.scores && session.scores[0]) || 0) + ' 星币', ui.target.x, ui.target.y);
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.fillText(lowest ? ('目标 ' + lowest.n + ' 号球') : '目标已完成', ui.best.x, ui.best.y);
    } else if (session.versus) {
      drawNameChip(ctx, ui.name0 || { x: ui.best.x, y: ui.target.y - 14, w: 102, h: 22 }, session, 0, colors);
      drawNameChip(ctx, ui.name1 || { x: ui.best.x + 110, y: ui.target.y - 14, w: 102, h: 22 }, session, 1, colors);
      ctx.fillStyle = mine ? '#F5D76E' : colors.hudDim;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(turnLabel(session) + (lowest ? (' · 目标 ' + lowest.n + ' 号') : ''), ui.target.x, ui.turn ? ui.turn.y - 2 : ui.best.y + 16);
    } else {
      var targetText = lowest ? ('目标 ' + lowest.n + ' 号球') : '目标已完成';
      ctx.fillText(targetText, ui.target.x, ui.target.y);
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.hud;
      ctx.font = '12px ' + FONT;
      ctx.fillText('最佳 ' + (session.best || 0) + ' 星币', ui.best.x, ui.best.y);
    }

    if (session.versus && session.phase !== 'Splash' && session.phase !== 'Settle') {
      var clock = remainSec(session);
      if (clock > 0 && session.phase === 'Aim') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = clock <= 5 ? '#F87171' : '#F5D76E';
        if (clock <= 5) ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 160));
        ctx.font = (clock <= 5 ? 'bold 34px ' : 'bold 26px ') + FONT;
        ctx.fillText(String(clock), ui.count ? ui.count.x : session.viewport.width * 0.5, ui.count ? ui.count.y : ui.title.y + 62);
        ctx.restore();
      }
    }

    drawButton(ctx, {
      x: ui.mode.x,
      y: ui.mode.y,
      w: ui.mode.w,
      h: ui.mode.h,
      label: session.aim3d ? '瞄准3D·开' : '瞄准3D'
    }, colors, session.pressed === 'aim3d' || session.aim3d);
    if (ui.ai && !session.versus && session.mode !== 'ai') {
      drawButton(ctx, {
        x: ui.ai.x,
        y: ui.ai.y,
        w: ui.ai.w,
        h: ui.ai.h,
        label: ui.ai.label
      }, colors, session.pressed === 'ai');
    }
    if (ui.room && showsRoomChrome(session)) {
      drawButton(ctx, {
        x: ui.room.x,
        y: ui.room.y,
        w: ui.room.w,
        h: ui.room.h,
        label: session.room ? '房间码' : ui.room.label
      }, colors, session.pressed === 'room');
    }
    if (ui.rerack && session.phase !== 'Splash') {
      drawButton(ctx, ui.rerack, colors, session.pressed === 'rerack');
    }
    if (ui.bgm) {
      drawButton(ctx, {
        x: ui.bgm.x,
        y: ui.bgm.y,
        w: ui.bgm.w,
        h: ui.bgm.h,
        label: session.bgm === false ? '音乐关' : '音乐'
      }, colors, session.pressed === 'bgm' || session.bgm === false);
    }

    if (session.phase === 'Aim' && session.cue.dragging) {
      var p = session.cue.power;
      var full = p >= 0.98 || session.cue.full;
      ctx.fillStyle = '#2A1C12';
      roundRect(ctx, ui.power.x, ui.power.y, ui.power.w, ui.power.h, 4);
      ctx.fill();
      ctx.fillStyle = full ? '#FFF3B0' : '#F5D76E';
      if (session.powerFlash && session.powerFlash > 0) {
        ctx.fillStyle = '#FFFFFF';
      }
      roundRect(ctx, ui.power.x, ui.power.y, ui.power.w * p, ui.power.h, 4);
      ctx.fill();
      if (full) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.fillStyle = full ? '#F5D76E' : colors.hud;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(full ? '满' : (Math.round(p * 100) + '%'), ui.powerLabel.x, ui.powerLabel.y);
      ctx.textBaseline = 'alphabetic';
    } else if (session.phase === 'Aim') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(session.versus && !mine
        ? turnLabel(session)
        : '拖动球杆后拉蓄力', ui.hint.x, ui.hint.y);
    } else if (session.phase === 'Shot') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText('出杆中…', ui.hint.x, ui.hint.y);
    } else if (session.phase === 'WaitCueStop') {
      ctx.fillStyle = colors.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText('等待母球停稳…', ui.hint.x, ui.hint.y);
    }

    if (session.banner && session.banner.text) {
      var hasDetail = !!(session.banner.detail);
      var bh = hasDetail ? 40 : 26;
      ctx.fillStyle = session.banner.kind === 'foul' ? 'rgba(120, 28, 28, 0.86)' : 'rgba(36, 24, 15, 0.82)';
      roundRect(ctx, 18, ui.title.y + 52, session.viewport.width - 36, bh, 8);
      ctx.fill();
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(session.banner.text, session.viewport.width * 0.5, ui.title.y + (hasDetail ? 68 : 70));
      if (hasDetail) {
        ctx.font = '11px ' + FONT;
        ctx.fillStyle = '#FECACA';
        ctx.fillText(session.banner.detail, session.viewport.width * 0.5, ui.title.y + 84);
      }
    } else if (session.toast && session.toast.text) {
      ctx.fillStyle = colors.hud;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(session.toast.text, ui.hint.x, ui.hint.y - 16);
    }

    ctx.fillStyle = colors.disclaimer || '#A89880';
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(session.config.disclaimer, ui.disclaimer.x, ui.disclaimer.y);
    ctx.restore();
  }

  function drawSettle(ctx, session) {
    if (session.phase !== 'Settle' || !session.settle) return;
    var ui = session.ui;
    var colors = session.config.colors;
    var s = session.settle;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 9, 6, 0.55)';
    ctx.fillRect(0, 0, session.viewport.width, session.viewport.height);
    roundRect(ctx, ui.settleCard.x, ui.settleCard.y, ui.settleCard.w, ui.settleCard.h, 16);
    ctx.fillStyle = '#24180F';
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = colors.hud;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    var title = '本杆星币';
    if (isPractice(session) || (!session.versus && !s.versus)) {
      title = '本局星币';
    } else if (s.win || s.reason === 'nine') {
      title = settleOutcome(session, s);
    } else if (!s.legal) {
      if (s.reason === 'scratch') title = '犯规 · 白球入袋';
      else if (s.reason === 'order') title = '犯规 · 打错目标球';
      else if (s.reason === 'whiff') title = '犯规 · 未碰目标球';
      else if (s.reason === 'timeout') title = '超时未击球';
      else title = '未进目标球';
    }
    ctx.fillText(title, ui.settleScore.x, ui.settleScore.y - 22);

    ctx.font = 'bold 32px ' + FONT;
    ctx.fillStyle = '#F5D76E';
    if (s.versus && (s.scores || s.stars)) {
      var hostStar = (s.stars && (s.stars.host != null ? s.stars.host : s.stars[0])) || (s.scores && s.scores[0]) || 0;
      var guestStar = (s.stars && (s.stars.guest != null ? s.stars.guest : s.stars[1])) || (s.scores && s.scores[1]) || 0;
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillText(
        nameOf(session, 0) + ' ' + hostStar +
          '  ·  ' + nameOf(session, 1) + ' ' + guestStar,
        ui.settleScore.x,
        ui.settleScore.y + 8
      );
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = colors.hud;
      ctx.fillText('本杆 ' + String(s.coins != null ? s.coins : s.points) + ' 星币', ui.settleScore.x, ui.settleScore.y + 32);
    } else {
      var shown = (isPractice(session) && session.scores)
        ? (session.scores[0] || 0)
        : (s.coins != null ? s.coins : s.points);
      ctx.fillText(String(shown) + ' 星币', ui.settleScore.x, ui.settleScore.y + 16);
    }

    if (!isPractice(session) && !s.practice) {
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = colors.hud;
      var gapText = s.isNew ? '新纪录' : ('距最佳 还差 ' + s.gap + ' 星币');
      ctx.fillText(gapText, ui.settleGap.x, ui.settleGap.y);

      ctx.font = '11px ' + FONT;
      ctx.fillStyle = colors.hudDim;
      var propLine = s.starApplied
        ? ('得分加成 ' + (s.pocketBonus || 0) + ' · 落点加成 ' + (s.zoneLabel || '新星') + ' +' + (s.landingBonus || 0))
        : '未获得落点加成';
      ctx.fillText(propLine, ui.settleProp.x, ui.settleProp.y);

      ctx.font = '10px ' + FONT;
      ctx.fillStyle = colors.disclaimer;
      ctx.fillText(s.disclaimer, ui.settleProp.x, ui.settleProp.y + 16);
    } else {
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = colors.disclaimer;
      ctx.fillText(s.disclaimer, ui.settleGap.x, ui.settleGap.y);
    }

    drawButton(ctx, ui.replay, colors, session.pressed === 'replay');
    if (!isPractice(session) && !s.practice) {
      if (ui.back) drawButton(ctx, ui.back, colors, session.pressed === 'back');
      if (!session.versus && ui.share) {
        drawButton(ctx, ui.share, colors, session.pressed === 'share');
      }
    }
    ctx.restore();
  }

  function drawSplash(ctx, session) {
    if (session.phase !== 'Splash') return;
    var ui = session.ui;
    var colors = session.config.colors;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 9, 6, 0.62)';
    ctx.fillRect(0, 0, session.viewport.width, session.viewport.height);
    roundRect(ctx, ui.splashCard.x, ui.splashCard.y, ui.splashCard.w, ui.splashCard.h, 16);
    ctx.fillStyle = '#24180F';
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = colors.hud;
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(session.config.title || '星券台球', ui.splashCard.x + ui.splashCard.w * 0.5, ui.splashCard.y + 48);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim;
    ctx.fillText('俯视九球 · 落点加成', ui.splashCard.x + ui.splashCard.w * 0.5, ui.splashCard.y + 78);
    ctx.font = '10px ' + FONT;
    ctx.fillStyle = colors.disclaimer;
    wrapText(ctx, session.config.disclaimer, ui.splashCard.x + ui.splashCard.w * 0.5, ui.splashCard.y + 108, 220);
    if (ui.aiSplash) {
      drawButton(ctx, ui.aiSplash, colors, true);
      ctx.save();
      roundRect(ctx, ui.aiSplash.x - 2, ui.aiSplash.y - 2, ui.aiSplash.w + 4, ui.aiSplash.h + 4, 12);
      ctx.strokeStyle = '#F5D76E';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else {
      drawButton(ctx, ui.start, colors, session.pressed === 'start' || session.pressed === 'start-ai');
    }
    if (ui.practice) {
      drawButton(ctx, ui.practice, colors, session.pressed === 'practice');
    }
    if (ui.roomSplash) {
      drawButton(ctx, ui.roomSplash, colors, session.pressed === 'room');
    }
    ctx.restore();
  }

  function drawRoomPanel(ctx, session) {
    if (!session.roomPanel || !session.roomPanel.roomId) return;
    var ui = session.ui;
    var colors = session.config.colors;
    var card = ui.roomPanel;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 9, 6, 0.45)';
    ctx.fillRect(0, 0, session.viewport.width, session.viewport.height);
    roundRect(ctx, card.x, card.y, card.w, card.h, 16);
    ctx.fillStyle = '#24180F';
    ctx.fill();
    ctx.strokeStyle = colors.buttonBorder;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = colors.hud;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('好友对局', card.x + card.w * 0.5, card.y + 36);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = colors.hudDim;
    ctx.fillText('房间码 ' + session.roomPanel.roomId, card.x + card.w * 0.5, card.y + 66);
    ctx.font = '11px ' + FONT;
    wrapText(ctx, session.roomPanel.hint || '分享给好友，加入后同步台面', card.x + card.w * 0.5, card.y + 90, 228);
    if (ui.roomInvite) {
      drawButton(ctx, ui.roomInvite, colors, session.pressed === 'room');
    }
    drawButton(ctx, ui.roomClose, colors, session.pressed === 'room-close');
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxW) {
    var chars = String(text || '').split('');
    var line = '';
    var yy = y;
    var i;
    ctx.textAlign = 'center';
    for (i = 0; i < chars.length; i++) {
      var next = line + chars[i];
      if (ctx.measureText(next).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = chars[i];
        yy += 16;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  return {
    FONT: FONT,
    inRect: inRect,
    layout: layout,
    hitTest: hitTest,
    roundRect: roundRect,
    drawButton: drawButton,
    drawChrome: drawChrome,
    drawSettle: drawSettle,
    drawSplash: drawSplash,
    drawRoomPanel: drawRoomPanel,
    truncateName: truncateName,
    turnLabel: turnLabel,
    settleOutcome: settleOutcome,
    nameOf: nameOf,
    seatFallback: seatFallback,
    ownTurn: ownTurn,
    remainSec: remainSec,
    isAiMode: isAiMode,
    isPractice: isPractice,
    showsRoomChrome: showsRoomChrome,
    drawNameChip: drawNameChip
  };
});
