(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./starField') : root.XingguiStarField,
    typeof require === 'function' ? require('./inputPath') : root.XingguiInputPath,
    typeof require === 'function' ? require('./hud') : root.XingguiHud,
    typeof require === 'function' ? require('./fx') : root.XingguiFx,
    typeof require === 'function' ? require('./ringDetect') : root.XingguiRingDetect,
    typeof require === 'function' ? require('./attract') : root.XingguiAttract,
    typeof require === 'function' ? require('./score') : root.XingguiScore,
    typeof require === 'function' ? require('./storage') : root.XingguiStorage,
    typeof require === 'function' ? require('./share') : root.XingguiShare
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  starField,
  inputPath,
  hud,
  fx,
  ringDetect,
  attract,
  score,
  storage,
  share
) {
  'use strict';

  function linkMaxPx(session) {
    return session.viewport.width * session.config.linkMaxPxRatio;
  }

  function hintFor(path) {
    if (!path.starIds.length) return '点亮一颗星，连接附近的星';
    if (path.starIds.length === 1) return '点附近的星连线 · 双击空白取消';
    if (path.starIds.length >= 4) return '点回起点闭合星环';
    return '继续连线 · 撤销上一段 · 清除整条路径';
  }

  function comboText(session) {
    if (session.phase !== 'play') return '';
    var last = session.combo.lastCloseAt;
    if (last < 0) return '';
    var age = session.now * 1000 - last;
    if (age > (session.config.comboWindowMs || 8000)) return '';
    if (session.combo.count < 1) return '';
    return '连击  ×' + session.combo.multiplier;
  }

  function emptyCombo() {
    return { count: 0, lastCloseAt: -1, multiplier: 1 };
  }

  function create(viewport, config, seed) {
    var ui = hud.layout(viewport);
    var field = starField.create(viewport, config, ui.playRect, seed);
    var path = inputPath.create();
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      ui: ui,
      field: field,
      path: path,
      particles: [],
      toast: null,
      now: 0,
      lastEmptyTapAt: -1,
      lastEmptyX: 0,
      lastEmptyY: 0,
      score: 0,
      remainingMs: config.sessionMs || 60000,
      timer: Math.ceil((config.sessionMs || 60000) / 1000),
      pressed: null,
      pressedLeft: 0,
      hitStop: 0,
      flash: 0,
      pulse: 0,
      popups: [],
      closeFx: null,
      best: saved && saved.best ? saved.best : 0,
      combo: emptyCombo(),
      lastAward: null,
      lastShare: null,
      phase: 'play',
      settle: null,
      ring: ringDetect.detectClosedRing([], field.stars),
      _attract: attract,
      _share: share
    };
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render(session, ctx); };
    session.handlePointer = function (x, y) { return handlePointer(session, x, y); };
    session.resize = function (nextViewport) { resize(session, nextViewport); };
    session.restart = function () { return restart(session); };
    return session;
  }

  function resize(session, viewport) {
    session.viewport = viewport;
    session.ui = hud.layout(viewport);
    if (session.phase === 'play') {
      session.field = starField.create(viewport, session.config, session.ui.playRect);
      inputPath.clear(session.path);
      session.particles.length = 0;
      session.closeFx = null;
    }
  }

  function restart(session) {
    var saved = storage.load();
    session.ui = hud.layout(session.viewport);
    session.field = starField.create(session.viewport, session.config, session.ui.playRect);
    inputPath.clear(session.path);
    session.particles.length = 0;
    session.toast = null;
    session.now = 0;
    session.lastEmptyTapAt = -1;
    session.score = 0;
    session.remainingMs = session.config.sessionMs || 60000;
    session.timer = Math.ceil(session.remainingMs / 1000);
    session.hitStop = 0;
    session.flash = 0;
    session.pulse = 0;
    session.popups = [];
    session.closeFx = null;
    session.best = saved && saved.best ? saved.best : 0;
    session.combo = emptyCombo();
    session.lastAward = null;
    session.phase = 'play';
    session.settle = null;
    session.ring = ringDetect.detectClosedRing([], session.field.stars);
    return { kind: 'restart' };
  }

  function settleNow(session) {
    if (session.phase === 'settle') return session.settle;
    session.phase = 'settle';
    session.remainingMs = 0;
    session.timer = 0;
    inputPath.clear(session.path);
    var prevBest = storage.load().best || 0;
    var isNew = session.score > prevBest;
    var best = isNew ? session.score : prevBest;
    if (isNew) storage.save({ best: session.score });
    session.best = best;
    session.settle = {
      score: session.score,
      best: best,
      gap: isNew ? 0 : prevBest - session.score,
      isNew: isNew
    };
    return session.settle;
  }

  function spawnTrail(session, from, to) {
    if (!from || !to) return;
    var cap = session.config.particleCap || session.config.burstParticleCap || 120;
    var hex = session.config.colors.pathHead || fx.starHex(to, session.config.colors);
    var steps = Math.max(2, (session.config.trailPointsPerNode || 2) * 4);
    for (var i = 0; i < steps; i++) {
      if (session.particles.length >= cap) session.particles.shift();
      var t = i / (steps - 1);
      session.particles.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        vx: (to.x - from.x) * 0.04 + (Math.random() - 0.5) * 12,
        vy: (to.y - from.y) * 0.04 + (Math.random() - 0.5) * 12,
        r: 1.2 + Math.random() * 1.4,
        hex: hex,
        life: 0.38,
        maxLife: 0.38
      });
    }
  }

  function updateParticles(session, dt) {
    var next = [];
    for (var i = 0; i < session.particles.length; i++) {
      var p = session.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > 0) next.push(p);
    }
    session.particles = next;
  }

  function updatePopups(session, dt) {
    if (!session.popups) return;
    var next = [];
    for (var i = 0; i < session.popups.length; i++) {
      var p = session.popups[i];
      p.life -= dt * 0.9;
      p.y -= 22 * dt;
      if (p.life > 0) next.push(p);
    }
    session.popups = next;
  }

  function copyRingPoints(vertices) {
    var pts = [];
    var i;
    for (i = 0; i < (vertices || []).length; i++) {
      pts.push({ x: vertices[i].x, y: vertices[i].y });
    }
    if (pts.length >= 2) {
      var a = pts[0];
      var b = pts[pts.length - 1];
      if (a.x !== b.x || a.y !== b.y) pts.push({ x: a.x, y: a.y });
    }
    return pts;
  }

  function pushBurst(session, x, y, hex, opts) {
    var cap = session.config.burstParticleCap || session.config.particleCap || 120;
    var burst = fx.spawnBurst(x, y, session.config, hex, opts);
    for (var i = 0; i < burst.length; i++) {
      if (session.particles.length >= cap) session.particles.shift();
      session.particles.push(burst[i]);
    }
  }

  function emitCloseBursts(session) {
    var closeFx = session.closeFx;
    if (!closeFx || !closeFx.pendingBurst) return;
    var pending = closeFx.pendingBurst;
    closeFx.pendingBurst = null;
    pushBurst(session, pending.cx, pending.cy, pending.hex, { kind: 'center' });
    for (var i = 0; i < pending.vertices.length; i++) {
      pushBurst(
        session,
        pending.vertices[i].x,
        pending.vertices[i].y,
        fx.starHex(pending.vertices[i], session.config.colors),
        { kind: 'vertex' }
      );
    }
  }

  function tickCloseFx(session, dt) {
    var closeFx = session.closeFx;
    if (!closeFx) return;
    if (closeFx.flashFrames > 0) {
      closeFx.flashFrames -= 1;
      if (closeFx.flashFrames <= 0) {
        emitCloseBursts(session);
        session.flash = 0;
      }
    }
    closeFx.life -= dt;
    if (closeFx.life <= 0 && !closeFx.pendingBurst && closeFx.flashFrames <= 0) {
      session.closeFx = null;
    }
  }

  function applyClose(session) {
    var ring = ringDetect.detectClosedRing(
      session.path.starIds,
      session.field.stars,
      { playRect: session.field.playRect, config: session.config }
    );
    session.ring = ring;
    if (!ring.closed) return { ok: false, reason: 'not-closed' };

    session.combo = score.advanceCombo(
      session.combo,
      session.now * 1000,
      session.config.comboWindowMs || 8000
    );
    var awarded = score.scoreRing(ring, {
      comboCount: session.combo.count,
      hadUndo: !!session.path.hadUndo,
      config: session.config
    });
    session.lastAward = awarded;
    session.score += awarded.score;

    var cx = 0;
    var cy = 0;
    var i;
    for (i = 0; i < ring.vertices.length; i++) {
      cx += ring.vertices[i].x;
      cy += ring.vertices[i].y;
    }
    if (ring.vertices.length) {
      cx /= ring.vertices.length;
      cy /= ring.vertices.length;
    }

    var gone = [];
    for (i = 0; i < ring.inRing.length; i++) gone.push(ring.inRing[i].id);
    starField.removeByIds(session.field, gone);
    starField.refill(session.field, session.viewport, session.config, function (p) {
      return ringDetect.windingNumber(p, ring.vertices) !== 0;
    });

    inputPath.clear(session.path);
    session.particles.length = 0;
    var burstHex = awarded.perfect
      ? (session.config.perfectFlashColor || session.config.colors.perfect)
      : session.config.colors.scorePop;
    // Thicken → 1-frame white ring flash → then particles.
    // Mid-tier may cut outer glow / half particles, never flash or hit-stop.
    session.closeFx = {
      points: copyRingPoints(ring.vertices),
      life: 0.42,
      flashFrames: 2,
      pendingBurst: {
        cx: cx,
        cy: cy,
        hex: burstHex,
        vertices: ring.vertices.slice()
      }
    };
    session.flash = awarded.perfect ? 0.28 : 0.16;
    session.pulse = 1;
    session.popups = [];
    session.popups.push({
      x: cx,
      y: cy - 12,
      text: '+' + awarded.score,
      life: 1,
      hex: session.config.colors.scorePop,
      kind: 'score'
    });
    if (awarded.multiplier > 1) {
      session.popups.push({
        x: cx,
        y: cy + 18,
        text: '×' + awarded.multiplier,
        life: 1,
        hex: session.config.colors.combo,
        kind: 'combo'
      });
    }
    if (awarded.perfect) {
      session.popups.push({
        x: cx,
        y: cy + (awarded.multiplier > 1 ? 40 : 20),
        text: '完美',
        life: 1.1,
        hex: session.config.perfectFlashColor || session.config.colors.perfect,
        kind: 'perfect'
      });
    }
    session.hitStop = session.config.hitStopFrames || 0;
    session.toast = {
      text: awarded.perfect ? ('完美  +' + awarded.score) : ('+' + awarded.score),
      ttl: 0.95,
      perfect: awarded.perfect
    };
    return { ok: true, reason: 'closed', ring: ring, awarded: awarded };
  }

  function update(session, dt) {
    session.now += dt;
    tickCloseFx(session, dt);
    if (session.flash > 0 && !(session.closeFx && session.closeFx.flashFrames > 0)) {
      session.flash = Math.max(0, session.flash - dt * 2.8);
    }
    if (session.pulse > 0) session.pulse = Math.max(0, session.pulse - dt * 3.4);
    updatePopups(session, dt);
    if (session.phase === 'play') {
      session.remainingMs -= dt * 1000;
      if (session.remainingMs <= 0) {
        session.remainingMs = 0;
        settleNow(session);
      }
      session.timer = Math.max(0, Math.ceil(session.remainingMs / 1000));
    }

    if (session.hitStop > 0) {
      session.hitStop -= 1;
    } else if (session.phase === 'play') {
      starField.update(session.field, dt);
      if (session.path.starIds.length) {
        attract.applyAttract(
          session.field.stars,
          starField.pointsForIds(session.field, session.path.starIds),
          session.config.attractRadius,
          dt,
          session.field.playRect,
          session.config.attractStrength
        );
      }
    }

    inputPath.tickReject(session.path, dt);
    updateParticles(session, dt);
    if (session.toast) {
      session.toast.ttl -= dt;
      if (session.toast.ttl <= 0) session.toast = null;
    }
    if (session.pressedLeft > 0) {
      session.pressedLeft -= dt;
      if (session.pressedLeft <= 0) session.pressed = null;
    }
  }

  function press(session, name) {
    session.pressed = name;
    session.pressedLeft = 0.12;
  }

  function handlePointer(session, x, y) {
    var action = hud.hitTest(session.ui, x, y, session.phase);
    if (session.phase === 'settle') {
      if (action === 'replay') {
        press(session, 'replay');
        return restart(session);
      }
      if (action === 'share') {
        press(session, 'share');
        session.lastShare = share.share({
          score: session.score,
          best: session.best,
          title: '星轨'
        });
        return { kind: 'share', share: session.lastShare };
      }
      return { kind: 'settle-block' };
    }

    if (action === 'undo') {
      press(session, 'undo');
      inputPath.undo(session.path);
      return { kind: 'undo', path: inputPath.ids(session.path) };
    }
    if (action === 'clear') {
      press(session, 'clear');
      inputPath.clear(session.path);
      session.particles.length = 0;
      return { kind: 'clear', path: [] };
    }

    var star = starField.hitTest(session.field, x, y, session.config);
    if (star) {
      session.lastEmptyTapAt = -1;
      var before = inputPath.lastId(session.path);
      var result = inputPath.handleStarTap(
        session.path,
        session.field.stars,
        star.id,
        linkMaxPx(session)
      );
      if (result.ok && result.reason === 'linked') {
        spawnTrail(session, starField.getStar(session.field, before), star);
      }
      if (result.ok && result.reason === 'closed') {
        var closed = applyClose(session);
        return {
          kind: 'close',
          starId: star.id,
          result: result,
          awarded: closed.awarded,
          ring: closed.ring,
          path: []
        };
      }
      if (result.reason === 'too-far') {
        session.toast = { text: '距离过远', ttl: 0.75 };
      }
      if (result.reason === 'already-used') {
        session.toast = { text: '不能连回已用的星', ttl: 0.7 };
      }
      return { kind: 'star', starId: star.id, result: result, path: inputPath.ids(session.path) };
    }

    var windowS = (session.config.doubleTapMs || 350) / 1000;
    var slop = session.config.doubleTapSlopPx || 28;
    var isDouble = session.lastEmptyTapAt >= 0 &&
      (session.now - session.lastEmptyTapAt) <= windowS &&
      starField.dist({ x: x, y: y }, { x: session.lastEmptyX, y: session.lastEmptyY }) <= slop;
    session.lastEmptyTapAt = session.now;
    session.lastEmptyX = x;
    session.lastEmptyY = y;
    if (isDouble) {
      inputPath.clear(session.path);
      session.particles.length = 0;
      return { kind: 'double-clear', path: [] };
    }
    return { kind: 'empty', path: inputPath.ids(session.path) };
  }

  function render(session, ctx) {
    var vp = session.viewport;
    var colors = session.config.colors;
    var scale = 1 + 0.016 * (session.pulse || 0);
    ctx.save();
    ctx.translate(vp.width / 2, vp.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-vp.width / 2, -vp.height / 2);

    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawDust(ctx, session.field.dust, colors);

    var ids = session.path.starIds;
    var tip = ids.length ? starField.getStar(session.field, ids[ids.length - 1]) : null;
    var origin = ids.length ? starField.getStar(session.field, ids[0]) : null;
    if (tip && session.phase === 'play') {
      fx.drawRangeRing(ctx, tip, linkMaxPx(session), colors);
      fx.drawActiveHalo(ctx, tip, colors, session.field.time);
    }
    if (origin && ids.length >= 4 && session.phase === 'play') {
      fx.drawActiveHalo(ctx, origin, colors, session.field.time * 1.4);
    }

    var i;
    for (i = 0; i < session.field.stars.length; i++) {
      var star = session.field.stars[i];
      fx.drawStarGlow(ctx, star, session.config, session.field.time, !!(tip && star.id === tip.id));
    }

    var pts = starField.pointsForIds(session.field, ids);
    fx.drawNeonPath(ctx, pts, session.config);

    var closeFx = session.closeFx;
    var flashing = !!(closeFx && closeFx.flashFrames > 0);
    if (closeFx && closeFx.points && closeFx.points.length >= 2) {
      fx.drawNeonPath(ctx, closeFx.points, session.config, {
        thicken: true,
        closed: true,
        whiteFlash: flashing
      });
    }

    if (session.path.reject) {
      fx.drawRejectSegment(
        ctx,
        starField.getStar(session.field, session.path.reject.fromId),
        starField.getStar(session.field, session.path.reject.toId),
        colors,
        session.path.reject.ttl
      );
    }

    if (!closeFx || !closeFx.pendingBurst) {
      fx.drawParticles(ctx, session.particles);
    }
    for (i = 0; i < (session.popups || []).length; i++) {
      fx.drawPopup(ctx, session.popups[i], colors);
    }
    ctx.restore();

    if (flashing) {
      fx.drawFlash(ctx, vp.width, vp.height, session.flash || 0.2, '#FFFFFF');
    }

    hud.draw(ctx, session.ui, {
      timer: session.timer,
      score: session.score,
      toast: session.toast,
      pressed: session.pressed,
      hint: hintFor(session.path),
      comboText: comboText(session),
      phase: session.phase,
      settle: session.settle
    }, colors);
  }

  return {
    create: create,
    resize: resize,
    update: update,
    render: render,
    handlePointer: handlePointer,
    restart: restart,
    settleNow: settleNow,
    linkMaxPx: linkMaxPx
  };
});
