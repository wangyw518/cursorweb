var config = require('../js/config.json');
var { createTerrain } = require('../js/terrain.js');
var { createBody, stepBody, createGame } = require('../js/runner.js');
var { createHeadless } = require('../js/platform.js');
var collision = require('../js/collision.js');

var RUNS = 80;
var MAX_STEPS = 3600;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  var i = (sorted.length - 1) * p;
  var lo = Math.floor(i);
  var hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

function scanHazard(player, terrain, look, cfg) {
  var w = cfg.physics.playerW;
  var nearest = null;
  var obs = terrain.obstaclesNear(player.x - 6, look + 24);
  for (var i = 0; i < obs.length; i++) {
    var o = obs[i];
    if (o.x + o.w >= player.x - 4) {
      if (!nearest || o.x < nearest.x) nearest = o;
    }
  }
  var gapX = null;
  for (var d = 2; d < look; d += 3) {
    if (terrain.supportY(player.x + d, w) === null) {
      gapX = player.x + d;
      break;
    }
  }
  if (gapX != null && (!nearest || gapX < nearest.x)) {
    return { kind: 'gap', x: gapX, w: 8, y: 0, h: 0 };
  }
  return nearest;
}

function ghostThreat(state, cfg) {
  var player = state.player;
  var pBox = collision.worldBox(player, cfg);
  var list = state.ghosts;
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (state.session.simStep < g.collideAfterStep) continue;
    var gBox = collision.alignedGhostBox(g.body, player, cfg);
    var gap = collision.aabbGap(pBox, gBox);
    var yClose = g.body.y < 22;
    if (gap < 18 && yClose) return true;
  }
  return false;
}

function think(game, cfg) {
  var state = game.getDebugState();
  if (!state.session.alive) return;
  var player = state.player;
  var hazard = scanHazard(player, state.terrain, 96, cfg);
  if (hazard) {
    var dist = hazard.x - player.x;
    if (hazard.kind === 'high') {
      if (dist < 30 && dist > -4 && state.dashReady) game.requestDash();
    } else if (dist < 54 && player.grounded) {
      game.requestJump();
    }
  } else if (player.grounded && state.ghosts.length) {
    if (state.dashReady) game.requestDash();
    else if (ghostThreat(state, cfg)) game.requestJump();
  }
}

function playSeed(seed, cfg) {
  var game = createGame(createHeadless(), cfg);
  game.boot(seed);
  for (var i = 0; i < MAX_STEPS; i++) {
    think(game, cfg);
    game.stepOnce();
    var s = game.getDebugState();
    if (!s.session.alive) {
      return {
        seed: seed,
        surviveSec: s.session.settle.surviveSec,
        reason: s.session.deathReason
      };
    }
  }
  var live = game.getDebugState();
  return {
    seed: seed,
    surviveSec: live.session.simTimeMs / 1000,
    reason: 'timeout'
  };
}

function summarize(rows) {
  var times = rows.map(function (r) { return r.surviveSec; }).sort(function (a, b) { return a - b; });
  var causes = {};
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i].reason || 'unknown';
    causes[k] = (causes[k] || 0) + 1;
  }
  return {
    n: rows.length,
    median: percentile(times, 0.5),
    p25: percentile(times, 0.25),
    p75: percentile(times, 0.75),
    min: times[0],
    max: times[times.length - 1],
    causes: causes
  };
}

function runBatch(n, cfg) {
  var rows = [];
  for (var i = 0; i < n; i++) {
    rows.push(playSeed(1000 + i * 17, cfg));
  }
  return { rows: rows, stats: summarize(rows) };
}

function stubTerrain(grounds, obstacles) {
  return {
    grounds: grounds,
    obstacles: obstacles,
    ensureUpTo: function () {},
    supportY: function (x, w) {
      var cover = 0;
      for (var i = 0; i < grounds.length; i++) {
        var a = Math.max(x, grounds[i].x1);
        var b = Math.min(x + w, grounds[i].x2);
        if (b > a) cover += b - a;
      }
      return cover >= 6 ? 0 : null;
    },
    obstaclesNear: function () {
      return obstacles;
    }
  };
}

function drive(cfg, terrain, cmds, steps) {
  var body = createBody(cfg);
  var dead = null;
  for (var s = 0; s < steps; s++) {
    var cmd = cmds[s] || { jump: false, dash: false };
    stepBody(body, cmd, terrain, cfg, cfg.fixedDt);
    if (body.y < -90) {
      dead = 'fall';
      break;
    }
    if (collision.hitsObstacle(body, terrain, cfg)) {
      dead = 'terrain';
      break;
    }
  }
  return { body: body, dead: dead };
}

function cmdAt(step, type) {
  var c = { jump: false, dash: false };
  c[type] = true;
  return c;
}

function smokeNarrative(cfg) {
  var ground = [{ x1: -40, x2: 800 }];
  var low = stubTerrain(ground, [{ kind: 'low', x: 90, y: 0, w: 20, h: 24 }]);
  var high = stubTerrain(ground, [{
    kind: 'high',
    x: 90,
    y: 16,
    w: 30,
    h: cfg.highHeight
  }]);

  var walkLow = drive(cfg, low, {}, 90);
  var jumpLow = drive(cfg, low, { 12: cmdAt(12, 'jump') }, 90);
  var walkHigh = drive(cfg, high, {}, 90);
  var jumpHigh = drive(cfg, high, { 12: cmdAt(12, 'jump') }, 90);
  var dashHigh = drive(cfg, high, { 23: cmdAt(23, 'dash') }, 120);

  return {
    walkLowDies: walkLow.dead === 'terrain',
    jumpLowLives: !jumpLow.dead && jumpLow.body.x > 130,
    walkHighDies: walkHigh.dead === 'terrain',
    jumpHighDies: jumpHigh.dead === 'terrain',
    dashHighLives: !dashHigh.dead && dashHigh.body.x > 140
  };
}

function main() {
  var smoke = smokeNarrative(config);
  var batch = runBatch(RUNS, config);
  var out = {
    config: {
      firstHazardX: config.firstHazardX,
      hazardGapMin: config.hazardGapMin,
      hazardPostMin: config.hazardPostMin,
      jumpVy: config.physics.jumpVy,
      dashLift: config.physics.dashLift,
      highHeight: config.highHeight
    },
    smoke: smoke,
    stats: batch.stats
  };
  console.log(JSON.stringify(out, null, 2));
  var okSmoke = smoke.walkLowDies && smoke.jumpLowLives && smoke.walkHighDies &&
    smoke.jumpHighDies && smoke.dashHighLives;
  if (!okSmoke) {
    console.error('smoke narrative failed');
    process.exit(2);
  }
  return out;
}

if (require.main === module) {
  main();
}

module.exports = {
  playSeed: playSeed,
  runBatch: runBatch,
  smokeNarrative: smokeNarrative,
  summarize: summarize
};
