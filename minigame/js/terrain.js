/**
 * Seeded side-view terrain: flat ground, gaps, low crates, high crates.
 * Same seed always yields the same layout.
 */

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

var FIRST_HAZARD_X = 620;
var LOOKAHEAD = 900;
var LOW_HEIGHT = 36;
var HIGH_HEIGHT = 70;

function createTerrain(seed) {
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
    grounds.push({ type: 'ground', x: x, y: 0, w: w, h: 0 });
  }

  function addGap(x, w) {
    gaps.push({ type: 'gap', x: x, w: w });
  }

  function addObstacle(kind, x, w, h) {
    obstacles.push({
      type: 'obstacle',
      kind: kind,
      x: x,
      y: 0,
      w: w,
      h: h
    });
  }

  function generateUntil(untilX) {
    while (cursor < untilX) {
      if (cursor < FIRST_HAZARD_X) {
        addGround(cursor, FIRST_HAZARD_X - cursor);
        cursor = FIRST_HAZARD_X;
        continue;
      }

      var roll = rng();
      if (roll < 0.3) {
        var gapW = 74 + rng() * 54;
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
        addObstacle('low', cursor + lowPre, lowW, LOW_HEIGHT);
        cursor += lowPre + lowW + lowPost;
      } else {
        var highPre = 28;
        var highW = 26 + rng() * 10;
        var highPost = 240 + rng() * 90;
        addGround(cursor, highPre + highW + highPost);
        addObstacle('high', cursor + highPre, highW, HIGH_HEIGHT);
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

  generateUntil(FIRST_HAZARD_X + 400);

  return {
    ensureCoverage: function (maxX) {
      generateUntil(maxX + LOOKAHEAD);
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
      var feetL = x + w * 0.28;
      var feetR = x + w * 0.72;
      for (var i = 0; i < grounds.length; i++) {
        var g = grounds[i];
        if (g.x < feetR && g.x + g.w > feetL) {
          return 0;
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
  createTerrain,
  FIRST_HAZARD_X,
  LOW_HEIGHT,
  HIGH_HEIGHT
};
