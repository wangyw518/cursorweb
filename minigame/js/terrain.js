var defaultConfig = require('./config.json');

function mulberry32(seed) {
  var a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(sessionSeed, index) {
  return (sessionSeed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
}

function createTerrain(sessionSeed, cfg) {
  var config = cfg || defaultConfig;
  var chunkW = 220;
  var firstHazardX = config.firstHazardX;
  var highHeight = config.highHeight;
  var grounds = [];
  var obstacles = [];
  var generatedThrough = -1;
  var worldEnd = 0;

  function addGround(x1, x2) {
    if (x2 <= x1) return;
    grounds.push({ x1: x1, x2: x2 });
  }

  function generateChunk(index) {
    var x0 = index * chunkW;
    var x1 = x0 + chunkW;
    var rng = mulberry32(chunkSeed(sessionSeed, index));

    if (x1 <= firstHazardX) {
      addGround(x0, x1);
      worldEnd = Math.max(worldEnd, x1);
      return;
    }

    var hazardStart = Math.max(x0, firstHazardX);
    if (hazardStart > x0) addGround(x0, hazardStart);

    var roll = rng();
    if (roll < 0.42) {
      addGround(hazardStart, x1);
    } else if (roll < 0.62) {
      var gapW = 50 + rng() * 14;
      var gapX = hazardStart + 24 + rng() * 36;
      if (gapX + gapW > x1 - 16) gapX = Math.max(hazardStart, x1 - 16 - gapW);
      addGround(hazardStart, gapX);
      addGround(gapX + gapW, x1);
    } else if (roll < 0.82) {
      addGround(hazardStart, x1);
      obstacles.push({
        kind: 'low',
        x: Math.max(hazardStart + 16, x0 + 70 + rng() * 70),
        y: 0,
        w: 20,
        h: 24
      });
    } else {
      addGround(hazardStart, x1);
      obstacles.push({
        kind: 'high',
        x: Math.max(hazardStart + 16, x0 + 70 + rng() * 70),
        y: 16,
        w: 30,
        h: highHeight
      });
    }
    worldEnd = Math.max(worldEnd, x1);
  }

  function ensureUpTo(x) {
    var need = Math.floor(x / chunkW) + 2;
    while (generatedThrough < need) {
      generatedThrough += 1;
      generateChunk(generatedThrough);
    }
  }

  function supportY(x, w) {
    var left = x;
    var right = x + w;
    var cover = 0;
    for (var i = 0; i < grounds.length; i++) {
      var g = grounds[i];
      var a = Math.max(left, g.x1);
      var b = Math.min(right, g.x2);
      if (b > a) cover += b - a;
    }
    return cover >= 6 ? 0 : null;
  }

  function obstaclesNear(x, range) {
    var out = [];
    var lo = x - 20;
    var hi = x + range;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.x + o.w >= lo && o.x <= hi) out.push(o);
    }
    return out;
  }

  ensureUpTo(firstHazardX + chunkW);

  return {
    chunkW: chunkW,
    grounds: grounds,
    obstacles: obstacles,
    ensureUpTo: ensureUpTo,
    supportY: supportY,
    obstaclesNear: obstaclesNear,
    getWorldEnd: function () {
      return worldEnd;
    }
  };
}

module.exports = { createTerrain: createTerrain, mulberry32: mulberry32 };
