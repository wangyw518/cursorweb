var configDefault = require('./config.json');
var { createTimeline } = require('./inputTimeline.js');
var { createTerrain } = require('./terrain.js');
var { createGhostSystem } = require('./ghostReplay.js');
var collision = require('./collision.js');
var { createScore } = require('./score.js');
var sessionMod = require('./session.js');
var hud = require('./hud.js');
var storage = require('./storage.js');
var share = require('./share.js');

function createBody(config) {
  var p = config.physics;
  return {
    x: p.startX,
    y: 0,
    vx: p.baseSpeed,
    vy: 0,
    autoX: 0,
    grounded: true,
    dashing: false,
    dashLeft: 0
  };
}

function cloneBody(body) {
  return {
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    autoX: body.autoX,
    grounded: body.grounded,
    dashing: body.dashing,
    dashLeft: body.dashLeft
  };
}

function stepBody(body, cmd, terrain, config, dt) {
  var p = config.physics;
  body.autoX += p.baseSpeed * dt;

  if (cmd.jump && body.grounded) {
    body.vy = p.jumpVy;
    body.grounded = false;
  }

  if (cmd.dash) {
    body.dashing = true;
    body.dashLeft = p.dashDurationMs / 1000;
    body.vx = p.baseSpeed + p.dashBoost;
    if (body.grounded) {
      body.vy = p.dashLift;
      body.grounded = false;
    } else {
      body.vy = Math.max(body.vy, p.dashLift * 0.45);
    }
  }

  if (body.dashing) {
    body.dashLeft -= dt;
    if (body.dashLeft <= 0) {
      body.dashing = false;
      body.dashLeft = 0;
      body.vx = p.baseSpeed;
    }
  } else {
    body.vx = p.baseSpeed;
  }

  body.vy -= p.gravity * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  terrain.ensureUpTo(body.x + 480);
  var support = terrain.supportY(body.x, p.playerW);
  if (support !== null && body.y <= support && body.vy <= 0) {
    body.y = support;
    body.vy = 0;
    body.grounded = true;
  } else {
    body.grounded = false;
  }
}

function hexToRgb(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function createGame(platform, config) {
  config = config || configDefault;
  var dt = config.fixedDt;
  var colors = config.colors;
  var playerRgb = hexToRgb(colors.player);
  var acc = 0;
  var pendingJump = false;
  var pendingDash = false;
  var lastDashStep = -9999;
  var dashCdSteps = Math.round(config.dashCdMs / (dt * 1000));
  var flash = 0;
  var shareHint = '';
  var lastSettleLayout = null;
  var lastControls = null;
  var titleAlpha = 1;

  var session;
  var timeline;
  var terrain;
  var ghosts;
  var score;
  var player;
  var highScore = storage.getHighScore();

  var ghostSys = null;

  function boot(seed) {
    session = sessionMod.createSession(seed);
    timeline = createTimeline();
    terrain = createTerrain(session.seed);
    score = createScore(config);
    player = createBody(config);
    acc = 0;
    pendingJump = false;
    pendingDash = false;
    lastDashStep = -9999;
    flash = 0;
    shareHint = '';
    titleAlpha = 1;
    ghostSys = createGhostSystem(config, {
      createBody: createBody,
      stepBody: stepBody
    });
  }

  boot();

  function dashReady() {
    return session.simStep - lastDashStep >= dashCdSteps;
  }

  function dashCdLeft() {
    var left = dashCdSteps - (session.simStep - lastDashStep);
    if (left <= 0) return 0;
    return left * dt;
  }

  function requestJump() {
    if (!session.alive) return;
    pendingJump = true;
  }

  function requestDash() {
    if (!session.alive) return;
    if (!dashReady()) return;
    pendingDash = true;
  }

  function die(reason) {
    if (!session.alive) return;
    var snap = score.snapshot(session.simTimeMs);
    sessionMod.kill(session, reason, snap, highScore);
    if (session.settle.isRecord) {
      highScore = storage.setHighScore(session.settle.score);
    }
  }

  function stepOnce() {
    if (!session.alive) return;
    var cmd = { jump: false, dash: false };
    if (pendingJump && player.grounded) {
      cmd.jump = true;
      timeline.push(session.simStep, 'jump');
    }
    if (pendingDash && dashReady()) {
      cmd.dash = true;
      lastDashStep = session.simStep;
      timeline.push(session.simStep, 'dash');
    }
    pendingJump = false;
    pendingDash = false;

    stepBody(player, cmd, terrain, config, dt);
    session.simStep += 1;
    session.simTimeMs = session.simStep * dt * 1000;
    ghostSys.sync(session.simStep, timeline, terrain);
    score.tick(session.simTimeMs, dt);

    var hits = collision.resolvePlayer(
      player,
      ghostSys.list(),
      terrain,
      config,
      session.simStep
    );
    for (var i = 0; i < hits.nearMissIds.length; i++) {
      if (score.nearMiss(hits.nearMissIds[i], session.simTimeMs)) {
        flash = 1;
      }
    }
    if (hits.fallen) die('fall');
    else if (hits.terrainHit) die('terrain');
    else if (hits.ghostHit) die('ghost');
  }

  function tick(wallDt) {
    flash = Math.max(0, flash - Math.max(0, wallDt) * 2.4);
    titleAlpha = Math.max(0, titleAlpha - Math.max(0, wallDt) * 0.35);
    if (!session.alive) return;
    acc += Math.min(Math.max(wallDt, 0), 0.1);
    var guard = 0;
    while (acc >= dt && guard < 5) {
      acc -= dt;
      guard += 1;
      stepOnce();
    }
  }

  function groundScreenY(view) {
    return view.h * 0.68;
  }

  function camX(view) {
    return player.x - view.w * 0.28;
  }

  function worldToScreen(x, y, h, view) {
    return {
      x: x - camX(view),
      y: groundScreenY(view) - y - h
    };
  }

  function drawBackground(ctx, view) {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#1c2744';
    ctx.lineWidth = 1;
    var cam = camX(view);
    var gy = groundScreenY(view);
    for (var i = -1; i < 16; i++) {
      var gx = Math.floor(cam / 48) * 48 + i * 48 - cam;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTerrain(ctx, view) {
    var cam = camX(view);
    var gy = groundScreenY(view);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, gy, view.w, view.h - gy);
    ctx.fillStyle = colors.terrain;
    for (var i = 0; i < terrain.grounds.length; i++) {
      var g = terrain.grounds[i];
      var x = g.x1 - cam;
      var w = g.x2 - g.x1;
      if (x + w < -20 || x > view.w + 20) continue;
      ctx.fillRect(x, gy, w, 26);
    }
    ctx.fillStyle = '#a8b0c2';
    for (var j = 0; j < terrain.grounds.length; j++) {
      var s = terrain.grounds[j];
      var sx = s.x1 - cam;
      var sw = s.x2 - s.x1;
      if (sx + sw < -20 || sx > view.w + 20) continue;
      ctx.fillRect(sx, gy, sw, 3);
    }

    for (var k = 0; k < terrain.obstacles.length; k++) {
      var o = terrain.obstacles[k];
      var sx = o.x - cam;
      if (sx + o.w < -10 || sx > view.w + 10) continue;
      var sy = gy - o.y - o.h;
      ctx.fillStyle = o.kind === 'high' ? '#a4abb8' : colors.terrain;
      ctx.fillRect(sx, sy, o.w, o.h);
    }
  }

  function drawActor(ctx, box, view, alpha, fill, outline) {
    var scr = worldToScreen(box.x, box.y, box.h, view);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(scr.x, scr.y, box.w, box.h);
    if (outline) {
      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(scr.x + 0.5, scr.y + 0.5, box.w - 1, box.h - 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillRect(scr.x + 2, scr.y + 2, Math.max(1, box.w - 4), 4);
    ctx.restore();
  }

  function draw(ctx) {
    if (!ctx) return;
    var view = platform.logical;
    drawBackground(ctx, view);
    drawTerrain(ctx, view);

    var list = ghostSys.list();
    var ghostFill = 'rgba(' + playerRgb.r + ',' + playerRgb.g + ',' + playerRgb.b + ',' + colors.ghostAlpha + ')';
    for (var i = 0; i < list.length; i++) {
      var gBox = collision.alignedGhostBox(list[i].body, player, config);
      drawActor(ctx, gBox, view, 1, ghostFill, colors.player);
    }

    var pBox = collision.worldBox(player, config);
    var playerFill = flash > 0 ? colors.nearMissFlash : colors.player;
    drawActor(ctx, pBox, view, 1, playerFill);

    var snap = score.snapshot(session.simTimeMs);
    hud.drawTopBar(ctx, view, snap, dashCdLeft(), flash, colors);
    hud.drawHint(
      ctx,
      view,
      ['左跳  ·  右冲', '残影会晚 1.5 秒沿同样轨迹回来'],
      session.alive ? Math.min(1, titleAlpha + (session.simTimeMs < config.quietMs ? 0.55 : 0)) : 0
    );

    if (session.alive) {
      lastControls = hud.layoutControls(view);
      hud.drawControls(ctx, lastControls, colors, dashReady());
      lastSettleLayout = null;
    } else if (session.settle) {
      lastControls = null;
      lastSettleLayout = hud.drawSettle(ctx, view, session.settle, shareHint, colors);
    }
  }

  function handleTap(p) {
    var view = platform.logical;
    if (!session.alive && session.settle) {
      var layout = lastSettleLayout || hud.layoutSettle(view, shareHint);
      if (hud.hitRect(layout.replay, p)) {
        replay();
        return;
      }
      if (hud.hitRect(layout.share, p)) {
        var fields = share.shareSettle(session.settle);
        shareHint = '分享已模拟：' + fields.title;
        return;
      }
      return;
    }
    var controls = lastControls || hud.layoutControls(view);
    if (hud.hitRect(controls.jump, p)) {
      requestJump();
      return;
    }
    if (hud.hitRect(controls.dash, p)) {
      requestDash();
      return;
    }
    if (p.x < view.w * 0.5) requestJump();
    else requestDash();
  }

  function replay() {
    boot();
  }

  if (platform && typeof platform.onTap === 'function') {
    platform.onTap(handleTap);
  }

  function getDebugState() {
    return {
      session: session,
      player: player,
      ghosts: ghostSys.list(),
      timeline: timeline,
      score: score.snapshot(session.simTimeMs),
      highScore: highScore,
      seed: session.seed,
      settleLayout: lastSettleLayout
    };
  }

  return {
    tick: tick,
    draw: draw,
    requestJump: requestJump,
    requestDash: requestDash,
    handleTap: handleTap,
    replay: replay,
    stepOnce: stepOnce,
    getDebugState: getDebugState,
    boot: boot
  };
}

module.exports = {
  createBody: createBody,
  cloneBody: cloneBody,
  stepBody: stepBody,
  createGame: createGame
};
