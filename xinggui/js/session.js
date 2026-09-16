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
    return '继续连线 · 撤销上一段 · 清除整条路径';
  }

  function create(viewport, config, seed) {
    var ui = hud.layout(viewport);
    var field = starField.create(viewport, config, ui.playRect, seed);
    var path = inputPath.create();
    var saved = storage.load();
    return {
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
      score: score.getScore(null),
      timer: config.timerPlaceholder == null ? 60 : config.timerPlaceholder,
      pressed: null,
      best: saved && saved.best ? saved.best : 0,
      ring: ringDetect.detectClosedRing([], field.stars),
      _attract: attract,
      _share: share
    };
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render(session, ctx); };
    session.handlePointer = function (x, y) { return handlePointer(session, x, y); };
    session.resize = function (nextViewport) { resize(session, nextViewport); };
    return session;
  }

  function resize(session, viewport) {
    session.viewport = viewport;
    session.ui = hud.layout(viewport);
    session.field = starField.create(viewport, session.config, session.ui.playRect);
    inputPath.clear(session.path);
    session.particles.length = 0;
  }

  function spawnTrail(session, from, to) {
    if (!from || !to) return;
    var cap = session.config.particleCap || 120;
    var hex = fx.starHex(to, session.config.colors);
    var steps = 10;
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

  function update(session, dt) {
    session.now += dt;
    starField.update(session.field, dt);
    inputPath.tickReject(session.path, dt);
    updateParticles(session, dt);
    if (session.toast) {
      session.toast.ttl -= dt;
      if (session.toast.ttl <= 0) session.toast = null;
    }
    session.ring = ringDetect.detectClosedRing(session.path.starIds, session.field.stars);
    session.score = score.getScore(session.ring);
    if (session.pressedLeft != null) {
      session.pressedLeft -= dt;
      if (session.pressedLeft <= 0) {
        session.pressed = null;
        session.pressedLeft = 0;
      }
    }
  }

  function press(session, name) {
    session.pressed = name;
    session.pressedLeft = 0.12;
  }

  function handlePointer(session, x, y) {
    var action = hud.hitTest(session.ui, x, y);
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
        spawnTrail(
          session,
          starField.getStar(session.field, before),
          star
        );
      }
      if (result.reason === 'too-far') {
        session.toast = { text: '距离过远', ttl: 0.75 };
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
    fx.fillDeepSpace(ctx, vp.width, vp.height, colors);
    fx.drawDust(ctx, session.field.dust, colors);

    var ids = session.path.starIds;
    var tip = ids.length ? starField.getStar(session.field, ids[ids.length - 1]) : null;
    if (tip) {
      fx.drawRangeRing(ctx, tip, linkMaxPx(session), colors);
      fx.drawActiveHalo(ctx, tip, colors, session.field.time);
    }

    var i;
    for (i = 0; i < session.field.stars.length; i++) {
      fx.drawStarGlow(ctx, session.field.stars[i], colors, session.field.time);
    }

    var pts = starField.pointsForIds(session.field, ids);
    fx.drawNeonPath(ctx, pts, colors);

    if (session.path.reject) {
      fx.drawRejectSegment(
        ctx,
        starField.getStar(session.field, session.path.reject.fromId),
        starField.getStar(session.field, session.path.reject.toId),
        colors,
        session.path.reject.ttl
      );
    }

    fx.drawParticles(ctx, session.particles);

    hud.draw(ctx, session.ui, {
      timer: session.timer,
      score: session.score,
      toast: session.toast,
      pressed: session.pressed,
      hint: hintFor(session.path)
    }, colors);
  }

  return {
    create: create,
    resize: resize,
    update: update,
    render: render,
    handlePointer: handlePointer,
    linkMaxPx: linkMaxPx
  };
});
