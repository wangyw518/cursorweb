/**
 * Fixed-timestep side-view runner. All feel knobs live in config.json.
 * Player and ghosts share applyJump / applyDash / stepKinematics.
 */

var config = require('./config.json');
var { createTerrain } = require('./terrain');
var { collidePlayerTerrain, collidePlayerGhosts } = require('./collision');
var { createInputTimeline } = require('./inputTimeline');
var { createGhostReplay } = require('./ghostReplay');
var { createScore } = require('./score');
var storage = require('./storage');

function resolvePhys(phys) {
  if (phys && typeof phys === 'object' && phys.runSpeed != null) {
    return phys;
  }
  return physicsOf();
}

function physicsOf(cfg) {
  var c = cfg || config;
  return {
    runSpeed: c.runSpeed,
    jumpVy: c.jumpVy,
    dashBoost: c.dashBoost,
    dashHopVy: c.dashHopVy,
    dashDuration: c.dashDuration,
    dashCdS: (c.dashCdMs || 0) / 1000,
    gravity: c.gravity,
    groundY: c.groundY,
    deathY: c.deathY,
    playerW: c.playerW,
    playerH: c.playerH,
    startX: c.startX,
    coyoteS: c.coyoteS,
    jumpBufferS: c.jumpBufferS,
    groundSnapY: c.groundSnapY,
    obstacleInsetTop: c.obstacleInsetTop,
    obstacleQueryPad: c.obstacleQueryPad,
    terrainLookahead: c.terrainLookahead,
    groundScreenRatio: c.groundScreenRatio,
    cameraFocus: c.cameraFocus,
    maxFrameDt: c.maxFrameDt,
    maxPhysicsSteps: c.maxPhysicsSteps,
    fixedDt: c.fixedDt
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createBody(phys) {
  var p = resolvePhys(phys);
  return {
    x: p.startX,
    y: p.groundY,
    w: p.playerW,
    h: p.playerH,
    vx: p.runSpeed,
    vy: 0,
    grounded: true,
    dashRemain: 0,
    dashCdRemain: 0,
    coyote: p.coyoteS,
    jumpBuffer: 0,
    alive: true,
    surviveSec: 0
  };
}

function cloneBody(body) {
  return {
    x: body.x,
    y: body.y,
    w: body.w,
    h: body.h,
    vx: body.vx,
    vy: body.vy,
    grounded: body.grounded,
    dashRemain: body.dashRemain,
    dashCdRemain: body.dashCdRemain,
    coyote: body.coyote,
    jumpBuffer: 0,
    alive: true,
    surviveSec: body.surviveSec || 0
  };
}

function applyJump(body, phys) {
  var p = resolvePhys(phys);
  if (!body.alive) {
    return false;
  }
  if (!body.grounded && body.coyote <= 0) {
    return false;
  }
  body.vy = p.jumpVy;
  body.grounded = false;
  body.coyote = 0;
  body.jumpBuffer = 0;
  return true;
}

function applyDash(body, phys) {
  var p = resolvePhys(phys);
  if (!body.alive) {
    return false;
  }
  if (body.dashCdRemain > 0) {
    return false;
  }
  body.dashRemain = p.dashDuration;
  body.dashCdRemain = p.dashCdS;
  if (body.vy < p.dashHopVy) {
    body.vy = p.dashHopVy;
  }
  body.grounded = false;
  return true;
}

function collideOpts(phys) {
  return {
    deathY: phys.deathY,
    groundY: phys.groundY,
    maxSnap: phys.groundSnapY,
    insetTop: phys.obstacleInsetTop,
    queryPad: phys.obstacleQueryPad
  };
}

function stepKinematics(body, dt, terrain, phys) {
  var p = resolvePhys(phys);
  if (!body.alive) {
    return { dead: false, reason: null, grounded: body.grounded, y: body.y, vy: body.vy };
  }

  if (body.grounded) {
    body.coyote = p.coyoteS;
  } else {
    body.coyote = Math.max(0, body.coyote - dt);
  }

  if (body.dashRemain > 0) {
    body.vx = p.dashBoost;
    body.dashRemain = Math.max(0, body.dashRemain - dt);
  } else {
    body.vx = p.runSpeed;
  }
  if (body.dashCdRemain > 0) {
    body.dashCdRemain = Math.max(0, body.dashCdRemain - dt);
  }

  body.vy -= p.gravity * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  if (terrain && typeof terrain.ensureCoverage === 'function') {
    terrain.ensureCoverage(body.x + p.terrainLookahead);
  }

  var hit = collidePlayerTerrain(body, terrain, collideOpts(p));
  body.y = hit.y;
  body.vy = hit.vy;
  body.grounded = hit.grounded;
  if (hit.dead) {
    body.alive = false;
  }
  return hit;
}

function createRunner(options) {
  var opts = options || {};
  var cfg = opts.config || config;
  var phys = physicsOf(cfg);
  var colors = cfg.colors || {};

  var view = {
    width: opts.width || 667,
    height: opts.height || 375
  };

  var seed = 1;
  var terrain = null;
  var timeline = null;
  var ghosts = null;
  var score = createScore(cfg);
  var player = null;
  var acc = 0;
  var simTime = 0;
  var cameraX = 0;
  var deathReason = null;
  var settlement = null;

  function physicsWorld() {
    return {
      cloneBody: cloneBody,
      applyJump: function (body) {
        return applyJump(body, phys);
      },
      applyDash: function (body) {
        return applyDash(body, phys);
      },
      stepKinematics: function (body, dt, nextTerrain, deathY) {
        return stepKinematics(body, dt, nextTerrain, phys);
      },
      terrain: terrain,
      deathY: phys.deathY,
      fixedDt: phys.fixedDt
    };
  }

  function resetWorld(nextSeed) {
    seed = nextSeed >>> 0;
    terrain = createTerrain(seed, cfg);
    timeline = createInputTimeline();
    ghosts = createGhostReplay({ config: cfg });
    score.reset();
    player = createBody(phys);
    acc = 0;
    simTime = 0;
    cameraX = 0;
    deathReason = null;
    settlement = null;
    storage.setLastSeed(seed);
    terrain.ensureCoverage(player.x + view.width);
  }

  function finalizeDeath(reason) {
    player.alive = false;
    deathReason = reason;
    var sc = score.get();
    var prevHigh = storage.getHighScore();
    var isNew = sc > prevHigh;
    if (isNew) {
      storage.setHighScore(sc);
    }
    storage.setLastSeed(seed);
    var gap = isNew ? 0 : Math.max(0, prevHigh - sc);
    settlement = {
      score: sc,
      surviveSec: player.surviveSec,
      highScore: isNew ? sc : prevHigh,
      prevHigh: prevHigh,
      isNewRecord: isNew,
      gap: gap,
      seed: seed,
      recordCopy: isNew ? '新纪录' : '还差 ' + gap + ' 分破纪录'
    };
  }

  function doJump() {
    if (!player.alive) {
      return false;
    }
    var snap = cloneBody(player);
    if (!applyJump(player, phys)) {
      return false;
    }
    timeline.record(simTime, 'jump');
    ghosts.offer(simTime, 'jump', snap);
    return true;
  }

  function doDash() {
    if (!player.alive) {
      return false;
    }
    var snap = cloneBody(player);
    if (!applyDash(player, phys)) {
      return false;
    }
    timeline.record(simTime, 'dash');
    ghosts.offer(simTime, 'dash', snap);
    return true;
  }

  function requestJump() {
    if (!player.alive) {
      return false;
    }
    if (player.grounded || player.coyote > 0) {
      return doJump();
    }
    player.jumpBuffer = phys.jumpBufferS;
    return false;
  }

  function requestDash() {
    return doDash();
  }

  function step(dt) {
    if (!player.alive) {
      return;
    }

    if (player.jumpBuffer > 0) {
      player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
      if (player.grounded || player.coyote > 0) {
        doJump();
      }
    }

    var hit = stepKinematics(player, dt, terrain, phys);
    if (hit.dead) {
      finalizeDeath(hit.reason);
      return;
    }

    simTime += dt;
    player.surviveSec = simTime;
    score.update(dt);
    ghosts.update(simTime, dt, physicsWorld());
    score.probeGhosts(player, ghosts.list(), simTime);

    var ghostHit = collidePlayerGhosts(player, ghosts.list());
    if (ghostHit.dead) {
      ghosts.markHit(ghostHit.ghost);
      finalizeDeath('ghost');
    }
  }

  function updateFrame(frameDt) {
    if (!player.alive) {
      return;
    }
    var raw = frameDt;
    if (!isFinite(raw) || raw < 0) {
      raw = 0;
    }
    raw = Math.min(raw, phys.maxFrameDt);
    acc += raw;
    var steps = 0;
    while (acc >= phys.fixedDt && steps < phys.maxPhysicsSteps) {
      step(phys.fixedDt);
      acc -= phys.fixedDt;
      steps += 1;
    }
    if (steps === phys.maxPhysicsSteps) {
      acc = 0;
    }
  }

  function groundScreenY() {
    return view.height * phys.groundScreenRatio;
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx - cameraX,
      y: groundScreenY() - (wy - phys.groundY)
    };
  }

  function updateCamera() {
    var focus = view.width * phys.cameraFocus;
    cameraX = player.x - focus;
    if (cameraX < 0) {
      cameraX = 0;
    }
  }

  function drawBackdrop(ctx) {
    ctx.fillStyle = colors.bg || '#0B1020';
    ctx.fillRect(0, 0, view.width, view.height);

    var gy = groundScreenY();
    ctx.fillStyle = '#070B16';
    ctx.fillRect(0, gy, view.width, view.height - gy);

    var i;
    ctx.fillStyle = 'rgba(232,238,248,0.35)';
    for (i = 0; i < 28; i++) {
      var sx = ((i * 73 - cameraX * 0.12) % (view.width + 40) + view.width + 40) % (view.width + 40) - 20;
      var sy = 18 + ((i * 47) % Math.max(24, gy - 48));
      var size = 1 + (i % 3 === 0 ? 1 : 0);
      ctx.fillRect(sx, sy, size, size);
    }

    ctx.fillStyle = 'rgba(139,147,167,0.18)';
    for (i = 0; i < 10; i++) {
      var bw = 36 + (i % 4) * 14;
      var bh = 40 + ((i * 17) % 70);
      var bx = ((i * 120 - cameraX * 0.22) % (view.width + 160) + view.width + 160) % (view.width + 160) - 80;
      ctx.fillRect(bx, gy - bh, bw, bh);
    }
  }

  function drawTerrain(ctx) {
    var minX = cameraX - 40;
    var maxX = cameraX + view.width + 40;
    var gy = groundScreenY();
    var grounds = terrain.getGroundSegments(minX, maxX);
    var obstacles = terrain.getObstacles(minX, maxX);
    var g;

    ctx.fillStyle = colors.terrain || '#8B93A7';
    for (g = 0; g < grounds.length; g++) {
      var seg = grounds[g];
      var left = worldToScreen(seg.x, phys.groundY).x;
      ctx.fillRect(left, gy, seg.w, view.height - gy + 4);
      ctx.fillStyle = '#A4ABC0';
      ctx.fillRect(left, gy, seg.w, 4);
      ctx.fillStyle = colors.terrain || '#8B93A7';
    }

    for (g = 0; g < obstacles.length; g++) {
      var obs = obstacles[g];
      var p = worldToScreen(obs.x, obs.y + obs.h);
      ctx.fillStyle = obs.kind === 'high' ? '#6F768A' : '#8B93A7';
      ctx.fillRect(p.x, p.y, obs.w, obs.h);
      ctx.fillStyle = 'rgba(232,238,248,0.12)';
      ctx.fillRect(p.x, p.y, obs.w, 4);
    }
  }

  function drawPlayer(ctx) {
    var p = worldToScreen(player.x, player.y + player.h);
    var flashing = player.dashRemain > 0;
    ctx.fillStyle = flashing ? '#9FF7FA' : (colors.player || '#5CE1E6');
    ctx.fillRect(p.x, p.y, player.w, player.h);
    ctx.fillStyle = 'rgba(11,16,32,0.25)';
    ctx.fillRect(p.x + 6, p.y + 8, 8, 8);
    ctx.fillRect(p.x + 16, p.y + 8, 8, 8);
  }

  function render(ctx) {
    updateCamera();
    drawBackdrop(ctx);
    drawTerrain(ctx);
    ghosts.draw(ctx, { worldToScreen: worldToScreen });
    drawPlayer(ctx);
  }

  function getHudModel() {
    var sc = score.get();
    var model = {
      score: sc,
      surviveSec: player.surviveSec,
      dashCdRemainMs: Math.ceil(player.dashCdRemain * 1000),
      dashReady: player.dashCdRemain <= 0 && player.alive,
      dead: !player.alive,
      deathReason: deathReason,
      seed: seed,
      multiplierRemain: score.getMultiplierRemain(),
      nearMissCount: score.getNearMissCount()
    };
    if (settlement) {
      model.gap = settlement.gap;
      model.isNewRecord = settlement.isNewRecord;
      model.highScore = settlement.highScore;
      model.prevHigh = settlement.prevHigh;
      model.recordCopy = settlement.recordCopy;
    }
    return model;
  }

  function resize(width, height) {
    view.width = width;
    view.height = height;
  }

  function packPlayer() {
    return {
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h,
      vx: player.vx,
      vy: player.vy,
      grounded: player.grounded,
      dashRemain: player.dashRemain,
      dashCdRemain: player.dashCdRemain,
      coyote: player.coyote,
      alive: player.alive,
      surviveSec: player.surviveSec
    };
  }

  resetWorld(opts.seed == null ? 1 : opts.seed);

  return {
    start: function (nextSeed) {
      resetWorld(nextSeed == null ? seed : nextSeed);
    },
    restart: function (nextSeed) {
      resetWorld(nextSeed == null ? seed : nextSeed);
    },
    jump: requestJump,
    dash: requestDash,
    step: step,
    updateFrame: updateFrame,
    render: render,
    resize: resize,
    getHudModel: getHudModel,
    getGhosts: function () {
      return ghosts.list();
    },
    getState: function () {
      return {
        seed: seed,
        simTime: simTime,
        acc: acc,
        cameraX: cameraX,
        player: packPlayer(),
        deathReason: deathReason,
        inputEvents: timeline.getEvents(),
        ghosts: ghosts.list().map(function (g) {
          return {
            type: g.type,
            sourceT: g.sourceT,
            age: g.age,
            flash: g.flash,
            x: g.body.x,
            y: g.body.y,
            vx: g.body.vx,
            vy: g.body.vy,
            grounded: g.body.grounded
          };
        }),
        pendingGhosts: ghosts.pendingCount(),
        score: score.get(),
        nearMissCount: score.getNearMissCount(),
        multiplierRemain: score.getMultiplierRemain(),
        settlement: settlement
      };
    },
    getScore: function () {
      return score;
    },
    isDead: function () {
      return !player.alive;
    },
    getTerrain: function () {
      return terrain;
    },
    getTimeline: function () {
      return timeline;
    },
    constants: {
      RUN_SPEED: phys.runSpeed,
      DASH_SPEED: phys.dashBoost,
      JUMP_VY: phys.jumpVy,
      DASH_HOP_VY: phys.dashHopVy,
      GRAVITY: phys.gravity,
      PLAYER_W: phys.playerW,
      PLAYER_H: phys.playerH,
      DEATH_Y: phys.deathY
    }
  };
}

module.exports = {
  createRunner,
  clamp,
  physicsOf,
  createBody,
  cloneBody,
  applyJump,
  applyDash,
  stepKinematics
};
