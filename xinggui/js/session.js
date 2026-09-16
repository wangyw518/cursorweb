'use strict';

const math = require('./math.js');
const starsLib = require('./stars.js');
const trailLib = require('./trail.js');
const attract = require('./attract.js');
const scoreLib = require('./score.js');
const fxLib = require('./fx.js');
const hud = require('./hud.js');
const skyLib = require('./sky.js');

function createSession(opts) {
  const cfg = opts.config;
  const rng = opts.rng || math.mulberry32(Date.now() >>> 0);
  const field = starsLib.spawnField(cfg.starCount, opts.w, opts.h, cfg, rng);
  return {
    cfg: cfg,
    w: opts.w,
    h: opts.h,
    rng: rng,
    storage: opts.storage,
    phase: 'title',
    timeLeft: cfg.sessionSeconds,
    score: 0,
    displayScore: 0,
    combo: 0,
    loops: 0,
    stars: field.stars,
    nextId: field.nextId,
    trail: trailLib.createTrail(),
    fx: fxLib.createFx(),
    finger: { active: false, x: 0, y: 0 },
    hint: hud.COPY.hint,
    hintAge: 0,
    clock: 0,
    best: opts.storage ? opts.storage.getBest() : 0,
    settle: null,
    toast: '',
    toastAge: 0,
    buttons: {},
    lastBlankAt: -10,
    comboAt: -99,
    justClosed: false,
    quality: opts.quality || { low: false }
  };
}

function linkMax(session) {
  return session.w * (session.cfg.linkMaxRatio || 0.22);
}

function warnLink(session) {
  return session.w * (session.cfg.warnLinkRatio || 0.175);
}

function closeR(session) {
  return session.w * (session.cfg.closeThresholdRatio || 0.16);
}

function clearPath(session) {
  const byId = starsLib.indexById(session.stars);
  while (session.trail.ids.length) trailLib.pop(session.trail, byId);
  session.hint = hud.COPY.hint;
  session.hintAge = 0;
}

function resize(session, w, h) {
  session.w = w;
  session.h = h;
}

function startPlay(session) {
  session.phase = 'play';
  session.timeLeft = session.cfg.sessionSeconds;
  session.score = 0;
  session.displayScore = 0;
  session.combo = 0;
  session.loops = 0;
  session.settle = null;
  session.hint = hud.COPY.hint;
  session.hintAge = 0;
  trailLib.reset(session.trail);
  const field = starsLib.spawnField(session.cfg.starCount, session.w, session.h, session.cfg, session.rng);
  session.stars = field.stars;
  session.nextId = field.nextId;
  session.fx = fxLib.createFx();
  session.lastBlankAt = -10;
  session.comboAt = -99;
  session.justClosed = false;
}

function pointerDown(session, x, y) {
  session.finger.active = true;
  session.finger.x = x;
  session.finger.y = y;
  fxLib.ripple(session.fx, x, y);

  if (session.phase === 'title') {
    startPlay(session);
    trySelect(session, x, y);
    return 'play';
  }
  if (session.phase === 'settle') {
    const id = hud.hitButton(hud.layoutSettle(session.w, session.h), x, y);
    if (id === 'replay') {
      startPlay(session);
      return 'replay';
    }
    if (id === 'share') return 'share';
    return null;
  }
  if (session.phase === 'play') {
    trySelect(session, x, y, true);
  }
  return null;
}

function pointerMove(session, x, y) {
  session.finger.x = x;
  session.finger.y = y;
  if (session.phase === 'play' && session.finger.active) trySelect(session, x, y, false);
}

function pointerUp(session) {
  session.finger.active = false;
  session.justClosed = false;
}

function trySelect(session, x, y, isDown) {
  if (session.phase !== 'play' || !session.trail.live || session.justClosed) return;
  const cfg = session.cfg;
  const byId = starsLib.indexById(session.stars);
  const pts = trailLib.toPoints(session.trail, byId);
  const maxLink = linkMax(session);
  const closable = pts.length >= cfg.minLoopStars;
  const first = byId[trailLib.firstId(session.trail)];

  if (closable && first && math.dist(x, y, first.x, first.y) <= closeR(session)) {
    closeLoop(session, byId);
    return;
  }

  const last = byId[trailLib.lastId(session.trail)];
  if (isDown && last && math.dist(x, y, last.x, last.y) <= cfg.hitRadius * 0.75 && pts.length) {
    trailLib.pop(session.trail, byId);
    return;
  }

  const star = starsLib.findNearest(session.stars, x, y, cfg.hitRadius, function (s) {
    return !s.selected;
  });
  if (!star) {
    if (isDown && session.trail.ids.length) {
      if (session.clock - session.lastBlankAt < 0.38) {
        clearPath(session);
        session.toast = '轨迹已抹去';
        session.toastAge = 0;
      }
      session.lastBlankAt = session.clock;
    }
    return;
  }
  if (!trailLib.canAdd(session.trail, star, maxLink, byId)) {
    if (session.trail.ids.length) {
      session.toast = '再近一些';
      session.toastAge = 0;
    }
    return;
  }
  trailLib.addStar(session.trail, star);
  star.pulse = 1;
  fxLib.ripple(session.fx, star.x, star.y);
  if (session.trail.ids.length === cfg.minLoopStars - 1) {
    session.hint = hud.COPY.closeHint;
    session.hintAge = 0;
  }
  const origin = starsLib.indexById(session.stars)[trailLib.firstId(session.trail)];
  if (session.trail.ids.length >= cfg.minLoopStars && origin &&
      math.dist(star.x, star.y, origin.x, origin.y) <= closeR(session)) {
    closeLoop(session, starsLib.indexById(session.stars));
  }
}

function closeLoop(session, byId) {
  const cfg = session.cfg;
  const trail = session.trail;
  const loopPts = trailLib.closedPoints(trail, byId);
  if (loopPts.length < cfg.minLoopStars) return;

  const trailSet = Object.create(null);
  for (let i = 0; i < trail.ids.length; i++) trailSet[trail.ids[i]] = true;

  const cleared = [];
  let enclosed = 0;
  for (let i = 0; i < session.stars.length; i++) {
    const s = session.stars[i];
    if (s.dead) continue;
    const onTrail = !!trailSet[s.id];
    const inside = !onTrail && math.pointInPolygon(s.x, s.y, loopPts);
    if (onTrail || inside) {
      cleared.push(s);
      if (inside) enclosed++;
    }
  }

  const openPts = trailLib.toPoints(trail, byId);
  const areaFac = scoreLib.areaFactor(math.polygonArea(loopPts), session.w, session.h, cfg);
  const perfect = scoreLib.isPerfect(enclosed, math.polylineSelfIntersects(openPts), cfg);
  const gained = scoreLib.scoreLoop(trail.ids.length, enclosed, areaFac, session.combo, perfect, cfg);
  session.score += gained;
  session.combo = scoreLib.nextCombo(session.combo);
  session.comboAt = session.clock;
  session.loops += 1;

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < loopPts.length; i++) { cx += loopPts[i].x; cy += loopPts[i].y; }
  cx /= loopPts.length;
  cy /= loopPts.length;

  const low = session.quality && session.quality.low;
  fxLib.hitStop(session.fx, cfg.hitStopFrames);
  fxLib.flash(session.fx, 0.26);
  fxLib.pulse(session.fx, 1);
  fxLib.ring(session.fx, cx, cy, perfect ? cfg.comboColor : '#E8F2FF');
  fxLib.popup(session.fx, cx, cy - 12, '+' + gained, cfg.scorePop || '#FDE68A');
  if (perfect) fxLib.popup(session.fx, cx, cy + 16, '完美', cfg.comboColor || '#F472B6');

  const burstN = low ? 8 : 14;
  for (let i = 0; i < cleared.length; i++) {
    const s = cleared[i];
    fxLib.burst(session.fx, s.x, s.y, s.color, burstN, cfg);
    s.dead = true;
    s.selected = false;
  }

  starsLib.compact(session.stars);
  session.nextId = starsLib.refill(
    session.stars, session.nextId, cfg.starCount,
    session.w, session.h, cfg, session.rng
  );
  trailLib.reset(trail);
  session.hint = '';
  session.justClosed = true;
}

function endSession(session, reason) {
  if (session.phase !== 'play') return;
  session.phase = 'settle';
  session.finger.active = false;
  const bestBefore = session.best;
  if (session.storage) session.best = session.storage.setBest(session.score);
  const isNew = session.score > bestBefore && session.score > 0;
  session.settle = {
    reason: reason,
    score: session.score,
    best: Math.max(session.best, session.score),
    gap: Math.max(0, Math.max(session.best, bestBefore) - session.score),
    isNewBest: isNew,
    line: scoreLib.poeticLine(session.score, session.loops, session.combo, reason),
    loops: session.loops,
    combo: session.combo
  };
  if (reason === 'break') fxLib.shake(session.fx, 0.5);
}

function step(session, dt) {
  session.clock += dt;
  if (session.toast) {
    session.toastAge += dt;
    if (session.toastAge > 2) session.toast = '';
  }
  session.hintAge += dt;
  session.displayScore = math.lerp(session.displayScore, session.score, Math.min(1, dt * 7));
  if (Math.abs(session.displayScore - session.score) < 0.5) session.displayScore = session.score;
  if (session.combo > 0 && session.clock - session.comboAt > (session.cfg.comboWindow || 8)) {
    session.combo = 0;
  }

  if (session.fx.hitStop > 0) {
    session.fx.hitStop -= 1;
    fxLib.update(session.fx, dt * 0.35);
    return;
  }

  const world = {
    w: session.w,
    h: session.h,
    pad: session.cfg.edgePadding,
    drift: session.cfg.driftSpeed,
    selectedDrift: session.cfg.selectedDrift,
    spawnFade: session.cfg.spawnFade
  };
  starsLib.updateStars(session.stars, dt, world);

  const byId = starsLib.indexById(session.stars);
  const pts = trailLib.toPoints(session.trail, byId);
  const attractOn = session.cfg.attractEnabled !== false && !(session.quality && session.quality.low);
  if (session.phase === 'play' && pts.length >= 2 && attractOn) {
    attract.applyAttraction(
      session.stars, pts,
      session.cfg.attractRadius,
      session.cfg.attractStrength,
      dt
    );
  }

  fxLib.update(session.fx, dt);

  if (session.phase !== 'play') return;

  session.timeLeft -= dt;
  if (session.timeLeft <= 0) {
    session.timeLeft = 0;
    endSession(session, 'time');
    return;
  }

  if (trailLib.isBroken(session.trail, byId, linkMax(session))) {
    fxLib.shatterTrail(session.fx, pts);
    endSession(session, 'break');
  }
}

function draw(session, ctx, sky, view, time) {
  const urgency = session.phase === 'play' ? math.clamp((10 - session.timeLeft) / 10, 0, 1) : 0;
  const pulse = session.fx.pulse;
  const scale = 1 + 0.016 * pulse;
  const sh = session.fx.shake;
  const ox = sh ? (Math.random() - 0.5) * 5 * sh : 0;
  const oy = sh ? (Math.random() - 0.5) * 5 * sh : 0;

  ctx.save();
  ctx.translate(session.w / 2 + ox, session.h / 2 + oy);
  ctx.scale(scale, scale);
  ctx.translate(-session.w / 2, -session.h / 2);

  if (sky) skyLib.drawSky(ctx, sky, session.w, session.h, time, urgency, session.cfg, session.quality);

  const byId = starsLib.indexById(session.stars);
  const pts = trailLib.toPoints(session.trail, byId);
  const first = byId[trailLib.firstId(session.trail)];
  const stretch = trailLib.stretchT(session.trail, byId, warnLink(session), linkMax(session));
  const closable = pts.length >= session.cfg.minLoopStars;
  const finger = session.phase === 'play' ? session.finger : null;

  if (session.phase !== 'settle') {
    starsLib.drawTrail(ctx, pts, finger, stretch, closable, first, time, session.cfg, session.quality);
  }

  const nearR = session.cfg.hitRadius * 1.6;
  for (let i = 0; i < session.stars.length; i++) {
    const s = session.stars[i];
    const near = (finger && finger.active)
      ? math.clamp(1 - math.dist(finger.x, finger.y, s.x, s.y) / nearR, 0, 1)
      : 0;
    starsLib.drawStar(ctx, s, time, {
      near: near,
      origin: first && s.id === first.id && session.phase === 'play',
      closeable: closable && first && s.id === first.id && session.phase === 'play',
      glowInnerR: session.cfg.glowInnerR,
      glowOuterR: session.cfg.glowOuterR,
      low: session.quality && session.quality.low
    });
  }

  fxLib.draw(ctx, session.fx);
  ctx.restore();

  fxLib.drawFlash(ctx, session.fx, session.w, session.h);

  if (session.phase === 'title') {
    hud.drawTitle(ctx, session, view);
    session.buttons = hud.layoutTitle(view.w, view.h);
  } else if (session.phase === 'play') {
    hud.drawPlayHud(ctx, session, view);
    session.buttons = {};
  } else if (session.phase === 'settle') {
    session.buttons = hud.drawSettle(ctx, session, view);
  }
  if (session.toast) hud.drawToast(ctx, session.toast, view, session.toastAge);
}

function scriptGlowShot(session) {
  startPlay(session);
  const w = session.w;
  const h = session.h;
  const span = w * (session.cfg.linkMaxRatio || 0.22) * 0.72;
  const cx = w * 0.5;
  const cy = h * 0.48;
  const colors = session.cfg.palette;
  function star(id, x, y, color) {
    return {
      id: id, x: x, y: y, vx: 0, vy: 0, angle: 0, turn: 0,
      r: 8.4, color: color,
      twinkle: 0.2, twinkleSpeed: 1, selected: false, selIndex: -1,
      dead: false, born: 1, pulse: 0
    };
  }
  session.stars = [
    star(1, cx - span / 2, cy - span / 2, colors[0]),
    star(2, cx + span / 2, cy - span / 2, colors[1]),
    star(3, cx + span / 2, cy + span / 2, colors[2]),
    star(4, cx - span / 2, cy + span / 2, colors[3]),
    star(5, cx - span / 6, cy, colors[4]),
    star(6, cx + span / 6, cy, colors[5]),
    star(7, cx - span * 1.6, cy - span, colors[1]),
    star(8, cx + span * 1.55, cy + span, colors[2])
  ];
  session.nextId = 9;
  return session.stars.slice(0, 4).map(function (s) {
    return { x: s.x, y: s.y };
  }).concat([{ x: session.stars[0].x, y: session.stars[0].y }]);
}

function sharePayload(session) {
  const sc = session.settle ? session.settle.score : session.score;
  return {
    title: '我在「星轨」织出了 ' + sc + ' 分',
    imageUrl: 'share-cover.png',
    query: 'from=share&score=' + sc
  };
}

module.exports = {
  createSession: createSession,
  resize: resize,
  startPlay: startPlay,
  pointerDown: pointerDown,
  pointerMove: pointerMove,
  pointerUp: pointerUp,
  step: step,
  draw: draw,
  endSession: endSession,
  closeLoop: closeLoop,
  scriptGlowShot: scriptGlowShot,
  sharePayload: sharePayload
};
