/**
 * Player vs terrain only (M0). Ghost / near-miss queries come later.
 */

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
  var pad = insetTop == null ? 2 : insetTop;
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
  var supported = hasGroundSupport(player, terrain);
  var maxSnap = options && options.maxSnap != null ? options.maxSnap : 28;
  if (supported && player.y <= 0 && player.vy <= 0 && player.y >= -maxSnap) {
    return {
      y: 0,
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

function hitObstacle(player, terrain) {
  if (!terrain || typeof terrain.getObstacles !== 'function') {
    return null;
  }
  var body = playerAabb(player);
  var list = terrain.getObstacles(player.x - 8, player.x + player.w + 8);
  for (var i = 0; i < list.length; i++) {
    if (aabbOverlap(body, obstacleHitbox(list[i]))) {
      return list[i];
    }
  }
  return null;
}

function fellInGap(player, deathY) {
  var floor = deathY == null ? -140 : deathY;
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

  var obstacle = hitObstacle(probe, terrain);
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

module.exports = {
  aabbOverlap,
  playerAabb,
  obstacleHitbox,
  hasGroundSupport,
  resolveGround,
  hitObstacle,
  fellInGap,
  collidePlayerTerrain
};
