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
  var hazardGapMin = config.hazardGapMin;
  var hazardPostMin = config.hazardPostMin;
  var highHeight = config.highHeight;
  var chunkEdge = 16;
  var grounds = [];
  var obstacles = [];
  var generatedThrough = -1;
  var worldEnd = 0;
  var lastHazardX = null;
  var lastHazardEnd = null;

  function addGround(x1, x2) {
    if (x2 <= x1) return;
    grounds.push({ x1: x1, x2: x2 });
  }

  function nextAllowedX() {
    if (lastHazardX == null) return firstHazardX;
    return Math.max(lastHazardX + hazardGapMin, lastHazardEnd + hazardPostMin);
  }

  function markHazard(x, end) {
    lastHazardX = x;
    lastHazardEnd = end;
  }

  function placeX(rng, minX, width, x1) {
    var maxX = x1 - chunkEdge - width;
    if (maxX < minX) return null;
    return minX + rng() * (maxX - minX);
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

    var allowed = nextAllowedX();
    var placeFrom = Math.max(hazardStart, allowed);
    var roll = rng();

    if (roll < 0.42 || placeFrom >= x1) {
      addGround(hazardStart, x1);
    } else if (roll < 0.62) {
      var gapW = 50 + rng() * 14;
      var gapX = placeX(rng, placeFrom, gapW, x1);
      if (gapX == null) {
        addGround(hazardStart, x1);
      } else {
        addGround(hazardStart, gapX);
        addGround(gapX + gapW, x1);
        markHazard(gapX, gapX + gapW);
      }
    } else if (roll < 0.82) {
      addGround(hazardStart, x1);
      var lowW = 20;
      var ox = placeX(rng, placeFrom, lowW, x1);
      if (ox != null) {
        obstacles.push({
          kind: 'low',
          x: ox,
          y: 0,
          w: lowW,
          h: 24
        });
        markHazard(ox, ox + lowW);
      }
    } else {
      addGround(hazardStart, x1);
      var highW = 30;
      var hx = placeX(rng, placeFrom, highW, x1);
      if (hx != null) {
        obstacles.push({
          kind: 'high',
          x: hx,
          y: 16,
          w: highW,
          h: highHeight
        });
        markHazard(hx, hx + highW);
      }
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
