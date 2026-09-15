/**
 * Player vs terrain (M0) and player vs active ghosts (M1).
 */

var defaultConfig = require('./config.json');

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function aabbDistance(a, b) {
  var dx = 0;
  if (a.x + a.w < b.x) {
    dx = b.x - (a.x + a.w);
  } else if (b.x + b.w < a.x) {
    dx = a.x - (b.x + b.w);
  }
  var dy = 0;
  if (a.y + a.h < b.y) {
    dy = b.y - (a.y + a.h);
  } else if (b.y + b.h < a.y) {
    dy = a.y - (b.y + b.h);
  }
  return Math.sqrt(dx * dx + dy * dy);
}

function playerAabb(player) {
  return {
    x: player.x,
    y: player.y,
    w: player.w,
    h: player.h
  };
}

function obstacleHitbox(obstacle, insetTop) {
  var pad = insetTop == null ? 0 : insetTop;
  return {
    x: obstacle.x,
    y: obstacle.y,
    w: obstacle.w,
    h: Math.max(1, obstacle.h - pad)
  };
}

function hasGroundSupport(player, terrain) {
  if (!terrain || typeof terrain.supportAt !== 'function') {
    return false;
  }
  return terrain.supportAt(player.x, player.w) != null;
}

function resolveGround(player, terrain, options) {
  var opts = options || {};
  var supported = hasGroundSupport(player, terrain);
  var groundY = opts.groundY == null ? defaultConfig.groundY : opts.groundY;
  var maxSnap = opts.maxSnap == null ? defaultConfig.groundSnapY : opts.maxSnap;
  if (supported && player.y <= groundY && player.vy <= 0 && player.y >= groundY - maxSnap) {
    return {
      y: groundY,
      vy: 0,
      grounded: true
    };
  }
  return {
    y: player.y,
    vy: player.vy,
    grounded: false
  };
}

function hitObstacle(player, terrain, options) {
  if (!terrain || typeof terrain.getObstacles !== 'function') {
    return null;
  }
  var opts = options || {};
  var pad = opts.queryPad == null ? defaultConfig.obstacleQueryPad : opts.queryPad;
  var body = playerAabb(player);
  var list = terrain.getObstacles(player.x - pad, player.x + player.w + pad);
  for (var i = 0; i < list.length; i++) {
    if (aabbOverlap(body, obstacleHitbox(list[i], opts.insetTop == null ? defaultConfig.obstacleInsetTop : opts.insetTop))) {
      return list[i];
    }
  }
  return null;
}

function fellInGap(player, deathY) {
  var floor = deathY == null ? defaultConfig.deathY : deathY;
  return player.y < floor;
}

/**
 * After integration: snap to ground or report a terrain death.
 */
function collidePlayerTerrain(player, terrain, options) {
  var opts = options || {};
  var ground = resolveGround(player, terrain, opts);
  var next = {
    y: ground.y,
    vy: ground.vy,
    grounded: ground.grounded,
    dead: false,
    reason: null
  };

  var probe = {
    x: player.x,
    y: next.y,
    w: player.w,
    h: player.h,
    vy: next.vy
  };

  var obstacle = hitObstacle(probe, terrain, opts);
  if (obstacle) {
    next.dead = true;
    next.reason = 'obstacle';
    return next;
  }

  if (fellInGap(probe, opts.deathY)) {
    next.dead = true;
    next.reason = 'gap';
  }

  return next;
}

function ghostBody(ghost) {
  return ghost && ghost.body ? ghost.body : ghost;
}

function hitGhost(player, ghosts) {
  if (!ghosts || !ghosts.length) {
    return null;
  }
  var body = playerAabb(player);
  for (var i = 0; i < ghosts.length; i++) {
    var other = ghostBody(ghosts[i]);
    if (!other) {
      continue;
    }
    if (aabbOverlap(body, playerAabb(other))) {
      return ghosts[i];
    }
  }
  return null;
}

function collidePlayerGhosts(player, ghosts) {
  var hit = hitGhost(player, ghosts);
  if (!hit) {
    return { dead: false, reason: null, ghost: null };
  }
  return { dead: true, reason: 'ghost', ghost: hit };
}

module.exports = {
  aabbOverlap,
  aabbDistance,
  playerAabb,
  obstacleHitbox,
  hasGroundSupport,
  resolveGround,
  hitObstacle,
  fellInGap,
  collidePlayerTerrain,
  hitGhost,
  collidePlayerGhosts
};
