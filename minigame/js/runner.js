/**
 * Fixed-timestep side-view runner. Physics only steps with config.fixedDt.
 * Player and ghosts share applyJump / applyDash / stepKinematics.
 */

var config = require('./config.json');
var { createTerrain } = require('./terrain');
var { collidePlayerTerrain, collidePlayerGhosts } = require('./collision');
var { createInputTimeline } = require('./inputTimeline');
var { createGhostReplay } = require('./ghostReplay');
var { createScore } = require('./score');

var PLAYER_W = 30;
var PLAYER_H = 42;
var RUN_SPEED = 270;
var DASH_SPEED = 500;
var DASH_DURATION = 0.18;
var JUMP_VY = 580;
var DASH_HOP_VY = 600;
var GRAVITY = 1550;
var DEATH_Y = -140;
var COYOTE_S = 0.08;
var JUMP_BUFFER_S = 0.08;
var START_X = 80;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createBody() {
  return {
    x: START_X,
    y: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: RUN_SPEED,
    vy: 0,
    grounded: true,
    dashRemain: 0,
    dashCdRemain: 0,
    coyote: COYOTE_S,
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

function applyJump(body) {
  if (!body.alive) {
    return false;
  }
  if (!body.grounded && body.coyote <= 0) {
    return false;
  }
  body.vy = JUMP_VY;
  body.grounded = false;
  body.coyote = 0;
  body.jumpBuffer = 0;
  return true;
}

function applyDash(body, dashCdS) {
  if (!body.alive) {
    return false;
  }
  if (body.dashCdRemain > 0) {
    return false;
  }
  var cd = dashCdS == null ? 0.8 : dashCdS;
  body.dashRemain = DASH_DURATION;
  body.dashCdRemain = cd;
  if (body.vy < DASH_HOP_VY) {
    body.vy = DASH_HOP_VY;
  }
  body.grounded = false;
  return true;
}

function stepKinematics(body, dt, terrain, deathY) {
  if (!body.alive) {
    return { dead: false, reason: null, grounded: body.grounded, y: body.y, vy: body.vy };
  }

  if (body.grounded) {
    body.coyote = COYOTE_S;
  } else {
    body.coyote = Math.max(0, body.coyote - dt);
  }

  if (body.dashRemain > 0) {
    body.vx = DASH_SPEED;
    body.dashRemain = Math.max(0, body.dashRemain - dt);
  } else {
    body.vx = RUN_SPEED;
  }
  if (body.dashCdRemain > 0) {
    body.dashCdRemain = Math.max(0, body.dashCdRemain - dt);
  }

  body.vy -= GRAVITY * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  if (terrain && typeof terrain.ensureCoverage === 'function') {
    terrain.ensureCoverage(body.x + 900);
  }

  var hit = collidePlayerTerrain(body, terrain, { deathY: deathY == null ? DEATH_Y : deathY });
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
  var fixedDt = cfg.fixedDt;
  var dashCdS = (cfg.dashCdMs || 800) / 1000;
  var colors = cfg.colors || {};

  var view = {
    width: opts.width || 667,
    height: opts.height || 375
  };

  var seed = 1;
  var terrain = null;
  var timeline = null;
  var ghosts = null;
  var score = createScore();
  var player = null;
  var acc = 0;
  var simTime = 0;
  var cameraX = 0;
  var deathReason = null;

  function physicsWorld() {
    return {
      cloneBody: cloneBody,
      applyJump: applyJump,
      applyDash: function (body) {
        return applyDash(body, dashCdS);
      },
      stepKinematics: stepKinematics,
      terrain: terrain,
      deathY: DEATH_Y,
      fixedDt: fixedDt
    };
  }

  function resetWorld(nextSeed) {
    seed = nextSeed >>> 0;
    terrain = createTerrain(seed);
    timeline = createInputTimeline();
    ghosts = createGhostReplay({ config: cfg });
    score.reset();
    player = createBody();
    acc = 0;
    simTime = 0;
    cameraX = 0;
    deathReason = null;
    terrain.ensureCoverage(player.x + view.width);
  }

  function doJump() {
    if (!player.alive) {
      return false;
    }
    var snap = cloneBody(player);
    if (!applyJump(player)) {
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
    if (!applyDash(player, dashCdS)) {
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
    player.jumpBuffer = JUMP_BUFFER_S;
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

    var hit = stepKinematics(player, dt, terrain, DEATH_Y);
    if (hit.dead) {
      player.alive = false;
      deathReason = hit.reason;
      return;
    }

    simTime += dt;
    player.surviveSec = simTime;
    ghosts.update(simTime, dt, physicsWorld());

    var ghostHit = collidePlayerGhosts(player, ghosts.list());
    if (ghostHit.dead) {
      player.alive = false;
      deathReason = 'ghost';
      ghosts.markHit(ghostHit.ghost);
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
    raw = Math.min(raw, 0.25);
    acc += raw;
    var steps = 0;
    var maxSteps = 5;
    while (acc >= fixedDt && steps < maxSteps) {
      step(fixedDt);
      acc -= fixedDt;
      steps += 1;
    }
    if (steps === maxSteps) {
      acc = 0;
    }
  }

  function groundScreenY() {
    return view.height * 0.72;
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx - cameraX,
      y: groundScreenY() - wy
    };
  }

  function updateCamera() {
    var focus = view.width * 0.28;
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
      var left = worldToScreen(seg.x, 0).x;
      ctx.fillRect(left, gy, seg.w, view.height - gy + 4);
      ctx.fillStyle = '#A4ABC0';
      ctx.fillRect(left, gy, seg.w, 4);
      ctx.fillStyle = colors.terrain || '#8B93A7';
    }

    for (g = 0; g < obstacles.length; g++) {
      var obs = obstacles[g];
      var p = worldToScreen(obs.x, obs.h);
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
    return {
      score: score.get(),
      surviveSec: player.surviveSec,
      dashCdRemainMs: Math.ceil(player.dashCdRemain * 1000),
      dashReady: player.dashCdRemain <= 0 && player.alive,
      dead: !player.alive,
      deathReason: deathReason,
      seed: seed
    };
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
        pendingGhosts: ghosts.pendingCount()
      };
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
      RUN_SPEED: RUN_SPEED,
      DASH_SPEED: DASH_SPEED,
      JUMP_VY: JUMP_VY,
      DASH_HOP_VY: DASH_HOP_VY,
      GRAVITY: GRAVITY,
      PLAYER_W: PLAYER_W,
      PLAYER_H: PLAYER_H,
      DEATH_Y: DEATH_Y
    }
  };
}

module.exports = {
  createRunner,
  clamp,
  createBody,
  cloneBody,
  applyJump,
  applyDash,
  stepKinematics
};
