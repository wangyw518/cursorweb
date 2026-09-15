/**
 * Seeded side-view terrain: flat ground, gaps, low crates, high crates.
 * Same seed always yields the same layout. Heights / first-hazard from config.
 */

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

function createTerrain(seed, cfg) {
  var config = cfg || defaultConfig;
  var firstHazardX = config.firstHazardX;
  var lookahead = config.terrainLookahead;
  var lowHeight = config.lowHeight;
  var highHeight = config.highHeight;
  var groundY = config.groundY;
  var feetInset = config.feetInset;

  var rng = mulberry32(seed >>> 0);
  var grounds = [];
  var gaps = [];
  var obstacles = [];
  var cursor = 0;

  function addGround(x, w) {
    if (w <= 0) {
      return;
    }
    var last = grounds.length ? grounds[grounds.length - 1] : null;
    if (last && Math.abs(last.x + last.w - x) < 0.01) {
      last.w += w;
      return;
    }
    grounds.push({ type: 'ground', x: x, y: groundY, w: w, h: 0 });
  }

  function addGap(x, w) {
    gaps.push({ type: 'gap', x: x, w: w });
  }

  function addObstacle(kind, x, w, h) {
    obstacles.push({
      type: 'obstacle',
      kind: kind,
      x: x,
      y: groundY,
      w: w,
      h: h
    });
  }

  function generateUntil(untilX) {
    while (cursor < untilX) {
      if (cursor < firstHazardX) {
        addGround(cursor, firstHazardX - cursor);
        cursor = firstHazardX;
        continue;
      }

      var roll = rng();
      if (roll < 0.3) {
        var gapW = 70 + rng() * 22;
        addGap(cursor, gapW);
        cursor += gapW;
        var afterGap = 210 + rng() * 90;
        addGround(cursor, afterGap);
        cursor += afterGap;
      } else if (roll < 0.66) {
        var lowPre = 28;
        var lowW = 28 + rng() * 10;
        var lowPost = 220 + rng() * 80;
        addGround(cursor, lowPre + lowW + lowPost);
        addObstacle('low', cursor + lowPre, lowW, lowHeight);
        cursor += lowPre + lowW + lowPost;
      } else {
        var highPre = 28;
        var highW = 22 + rng() * 8;
        var highPost = 240 + rng() * 90;
        addGround(cursor, highPre + highW + highPost);
        addObstacle('high', cursor + highPre, highW, highHeight);
        cursor += highPre + highW + highPost;
      }
    }
  }

  function overlapsRange(item, minX, maxX) {
    return item.x < maxX && item.x + item.w > minX;
  }

  function filterRange(list, minX, maxX) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (overlapsRange(list[i], minX, maxX)) {
        out.push(list[i]);
      }
    }
    return out;
  }

  generateUntil(firstHazardX + 400);

  return {
    ensureCoverage: function (maxX) {
      generateUntil(maxX + lookahead);
    },
    getGroundSegments: function (minX, maxX) {
      return filterRange(grounds, minX, maxX);
    },
    getGaps: function (minX, maxX) {
      return filterRange(gaps, minX, maxX);
    },
    getObstacles: function (minX, maxX) {
      return filterRange(obstacles, minX, maxX);
    },
    supportAt: function (x, w) {
      var feetL = x + w * feetInset;
      var feetR = x + w * (1 - feetInset);
      for (var i = 0; i < grounds.length; i++) {
        var g = grounds[i];
        if (g.x < feetR && g.x + g.w > feetL) {
          return groundY;
        }
      }
      return null;
    },
    generatedUntil: function () {
      return cursor;
    }
  };
}

module.exports = {
  createTerrain
};
