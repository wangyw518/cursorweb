function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function aabbGap(a, b) {
  var dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  var dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

function bodyHeight(body, config) {
  return body.dashing ? config.physics.slideHeight : config.physics.playerH;
}

function worldBox(body, config) {
  return {
    x: body.x,
    y: body.y,
    w: config.physics.playerW,
    h: bodyHeight(body, config)
  };
}

function alignedGhostX(ghost, player) {
  return ghost.x + (player.autoX - ghost.autoX);
}

function alignedGhostBox(ghost, player, config) {
  return {
    x: alignedGhostX(ghost, player),
    y: ghost.y,
    w: config.physics.playerW,
    h: bodyHeight(ghost, config)
  };
}

function hitsObstacle(body, terrain, config) {
  var box = worldBox(body, config);
  var list = terrain.obstaclesNear(body.x, 80);
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (aabbOverlap(box, o)) return o;
  }
  return null;
}

function resolvePlayer(player, ghosts, terrain, config, simStep) {
  var fallen = player.y < -90;
  var terrainHit = !fallen && !!hitsObstacle(player, terrain, config);
  var ghostHit = false;
  var nearMissIds = [];
  var pBox = worldBox(player, config);
  var near = config.nearMissPx;

  for (var i = 0; i < ghosts.length; i++) {
    var g = ghosts[i];
    if (simStep < g.collideAfterStep) continue;
    var gBox = alignedGhostBox(g.body, player, config);
    if (aabbOverlap(pBox, gBox)) {
      ghostHit = true;
      break;
    }
    var gap = aabbGap(pBox, gBox);
    if (gap > 0 && gap < near) nearMissIds.push(g.id);
  }

  return {
    fallen: fallen,
    terrainHit: terrainHit,
    ghostHit: ghostHit,
    nearMissIds: nearMissIds
  };
}

module.exports = {
  aabbOverlap: aabbOverlap,
  aabbGap: aabbGap,
  worldBox: worldBox,
  alignedGhostX: alignedGhostX,
  alignedGhostBox: alignedGhostBox,
  hitsObstacle: hitsObstacle,
  resolvePlayer: resolvePlayer
};
