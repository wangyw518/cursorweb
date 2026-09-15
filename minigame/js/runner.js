/**
 * Fixed-timestep side-view runner. Physics only steps with config.fixedDt.
 */

var config = require('./config.json');
var { createTerrain } = require('./terrain');
var { collidePlayerTerrain } = require('./collision');
var { createInputTimeline } = require('./inputTimeline');
var { createGhostReplay } = require('./ghostReplay');
var { createScore } = require('./score');

var PLAYER_W = 30;
var PLAYER_H = 42;
var RUN_SPEED = 270;
var DASH_SPEED = 500;
var DASH_DURATION = 0.18;
var JUMP_VY = 560;
var DASH_HOP_VY = 500;
var GRAVITY = 1550;
var DEATH_Y = -140;
var COYOTE_S = 0.08;
var JUMP_BUFFER_S = 0.08;
var START_X = 80;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  var ghosts = createGhostReplay();
  var score = createScore();
  var player = null;
  var acc = 0;
  var simTime = 0;
  var cameraX = 0;
  var coyote = 0;
  var jumpBuffer = 0;
  var deathReason = null;

  function resetWorld(nextSeed) {
    seed = nextSeed >>> 0;
    terrain = createTerrain(seed);
    timeline = createInputTimeline();
    ghosts.reset();
    score.reset();
    player = {
      x: START_X,
      y: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: RUN_SPEED,
      vy: 0,
      grounded: true,
      dashRemain: 0,
      dashCdRemain: 0,
      alive: true,
      surviveSec: 0
    };
    acc = 0;
    simTime = 0;
    cameraX = 0;
    coyote = COYOTE_S;
    jumpBuffer = 0;
    deathReason = null;
    terrain.ensureCoverage(player.x + view.width);
  }

  function doJump() {
    if (!player.alive) {
      return false;
    }
    if (!player.grounded && coyote <= 0) {
      return false;
    }
    player.vy = JUMP_VY;
    player.grounded = false;
    coyote = 0;
    jumpBuffer = 0;
    timeline.record(simTime, 'jump');
    return true;
  }

  function doDash() {
    if (!player.alive) {
      return false;
    }
    if (player.dashCdRemain > 0) {
      return false;
    }
    player.dashRemain = DASH_DURATION;
    player.dashCdRemain = dashCdS;
    if (player.vy < DASH_HOP_VY) {
      player.vy = DASH_HOP_VY;
    }
    player.grounded = false;
    timeline.record(simTime, 'dash');
    return true;
  }

  function requestJump() {
    if (!player.alive) {
      return false;
    }
    if (player.grounded || coyote > 0) {
      return doJump();
    }
    jumpBuffer = JUMP_BUFFER_S;
    return false;
  }

  function requestDash() {
    return doDash();
  }

  function step(dt) {
    if (!player.alive) {
      return;
    }

    if (player.grounded) {
      coyote = COYOTE_S;
    } else {
      coyote = Math.max(0, coyote - dt);
    }

    if (jumpBuffer > 0) {
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (player.grounded || coyote > 0) {
        doJump();
      }
    }

    if (player.dashRemain > 0) {
      player.vx = DASH_SPEED;
      player.dashRemain = Math.max(0, player.dashRemain - dt);
    } else {
      player.vx = RUN_SPEED;
    }
    if (player.dashCdRemain > 0) {
      player.dashCdRemain = Math.max(0, player.dashCdRemain - dt);
    }

    player.vy -= GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    terrain.ensureCoverage(player.x + view.width);
    var hit = collidePlayerTerrain(player, terrain, { deathY: DEATH_Y });
    player.y = hit.y;
    player.vy = hit.vy;
    player.grounded = hit.grounded;

    if (hit.dead) {
      player.alive = false;
      deathReason = hit.reason;
      return;
    }

    simTime += dt;
    player.surviveSec = simTime;
    ghosts.update();
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
    ghosts.draw(ctx);
  }

  function render(ctx) {
    updateCamera();
    drawBackdrop(ctx);
    drawTerrain(ctx);
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
    getState: function () {
      return {
        seed: seed,
        simTime: simTime,
        acc: acc,
        cameraX: cameraX,
        player: {
          x: player.x,
          y: player.y,
          w: player.w,
          h: player.h,
          vx: player.vx,
          vy: player.vy,
          grounded: player.grounded,
          dashRemain: player.dashRemain,
          dashCdRemain: player.dashCdRemain,
          alive: player.alive,
          surviveSec: player.surviveSec
        },
        deathReason: deathReason,
        inputEvents: timeline.getEvents()
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
  clamp
};
