(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiStarField = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function farEnough(stars, candidate, minDist) {
    for (var i = 0; i < stars.length; i++) {
      if (dist(stars[i], candidate) < minDist) return false;
    }
    return true;
  }

  function neighborCount(stars, star, linkMaxPx) {
    var n = 0;
    for (var i = 0; i < stars.length; i++) {
      if (stars[i].id === star.id) continue;
      if (dist(stars[i], star) <= linkMaxPx) n++;
    }
    return n;
  }

  function wellConnected(stars, linkMaxPx) {
    if (!stars.length) return false;
    var isolated = 0;
    for (var i = 0; i < stars.length; i++) {
      if (neighborCount(stars, stars[i], linkMaxPx) === 0) isolated++;
    }
    return isolated === 0;
  }

  function makeStar(id, x, y, rng, brightBias) {
    var tier = rng() < brightBias ? 1 : 0;
    return {
      id: id,
      x: x,
      y: y,
      vx: (rng() - 0.5) * 7.5,
      vy: (rng() - 0.5) * 7.5,
      tier: tier,
      hue: rng() < 0.5 ? 'cyan' : 'magenta',
      phase: rng() * Math.PI * 2,
      radius: tier ? 6.1 : 4.05
    };
  }

  function placeStars(count, rect, linkMaxPx, rng) {
    var minDist0 = Math.max(38, Math.min(rect.w, rect.h) * 0.072);
    var pad = 10;
    var i;
    var attempt;

    for (attempt = 0; attempt < 60; attempt++) {
      var minDist = minDist0 * (1 - attempt * 0.01);
      var stars = [];
      var guard = 0;
      while (stars.length < count && guard < count * 90) {
        guard++;
        var x = rect.x + pad + rng() * Math.max(1, rect.w - pad * 2);
        var y = rect.y + pad + rng() * Math.max(1, rect.h - pad * 2);
        var candidate = { x: x, y: y };
        if (farEnough(stars, candidate, minDist)) {
          stars.push(makeStar(stars.length, x, y, rng, 0.36));
        }
      }
      if (stars.length === count && wellConnected(stars, linkMaxPx * 0.98)) return stars;
    }

    var fallback = [];
    for (i = 0; i < count; i++) {
      fallback.push(makeStar(
        i,
        rect.x + pad + rng() * Math.max(1, rect.w - pad * 2),
        rect.y + pad + rng() * Math.max(1, rect.h - pad * 2),
        rng,
        0.36
      ));
    }
    pullIsolates(fallback, rect, linkMaxPx, pad);
    return fallback;
  }

  function pullIsolates(stars, rect, linkMaxPx, pad) {
    for (var n = 0; n < 8; n++) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (neighborCount(stars, s, linkMaxPx) > 0) continue;
        var nearest = null;
        var best = Infinity;
        for (var j = 0; j < stars.length; j++) {
          if (i === j) continue;
          var d = dist(s, stars[j]);
          if (d < best) {
            best = d;
            nearest = stars[j];
          }
        }
        if (!nearest || best <= 0) continue;
        var target = linkMaxPx * 0.82;
        var t = 1 - target / best;
        s.x += (nearest.x - s.x) * t;
        s.y += (nearest.y - s.y) * t;
        s.x = Math.max(rect.x + pad, Math.min(rect.x + rect.w - pad, s.x));
        s.y = Math.max(rect.y + pad, Math.min(rect.y + rect.h - pad, s.y));
      }
    }
  }

  function makeDust(rect, rng, count) {
    var dust = [];
    for (var i = 0; i < count; i++) {
      dust.push({
        x: rect.x + rng() * rect.w,
        y: rect.y + rng() * rect.h,
        r: rng() < 0.2 ? 1.15 : 0.7,
        a: 0.08 + rng() * 0.18
      });
    }
    return dust;
  }

  function ensureTiers(stars, rng) {
    var bright = 0;
    var i;
    for (i = 0; i < stars.length; i++) if (stars[i].tier === 1) bright++;
    if (bright === 0) {
      stars[Math.floor(rng() * stars.length)].tier = 1;
      stars[0].radius = 6.1;
    }
    if (bright === stars.length) {
      stars[0].tier = 0;
      stars[0].radius = 4.05;
    }
  }

  function create(viewport, config, playRect, seed) {
    var rng = mulberry32((seed == null ? Date.now() : seed) >>> 0);
    var count = randInt(rng, config.starCountMin, config.starCountMax);
    var linkMaxPx = viewport.width * config.linkMaxPxRatio;
    var stars = placeStars(count, playRect, linkMaxPx, rng);
    ensureTiers(stars, rng);
    return {
      stars: stars,
      dust: makeDust(playRect, rng, 34),
      playRect: {
        x: playRect.x,
        y: playRect.y,
        w: playRect.w,
        h: playRect.h
      },
      time: 0
    };
  }

  function update(field, dt) {
    field.time += dt;
    var rect = field.playRect;
    var pad = 8;
    var minX = rect.x + pad;
    var maxX = rect.x + rect.w - pad;
    var minY = rect.y + pad;
    var maxY = rect.y + rect.h - pad;
    for (var i = 0; i < field.stars.length; i++) {
      var s = field.stars[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < minX) {
        s.x = minX;
        s.vx = Math.abs(s.vx);
      } else if (s.x > maxX) {
        s.x = maxX;
        s.vx = -Math.abs(s.vx);
      }
      if (s.y < minY) {
        s.y = minY;
        s.vy = Math.abs(s.vy);
      } else if (s.y > maxY) {
        s.y = maxY;
        s.vy = -Math.abs(s.vy);
      }
    }
  }

  function hitTest(field, x, y, config) {
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < field.stars.length; i++) {
      var s = field.stars[i];
      var hitR = s.tier === 1
        ? (config && config.starHitRadiusBright) || 22
        : (config && config.starHitRadiusDim) || 18;
      var d = dist(s, { x: x, y: y });
      if (d <= hitR && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  function getStar(field, id) {
    for (var i = 0; i < field.stars.length; i++) {
      if (field.stars[i].id === id) return field.stars[i];
    }
    return null;
  }

  function pointsForIds(field, starIds) {
    var pts = [];
    for (var i = 0; i < starIds.length; i++) {
      var s = getStar(field, starIds[i]);
      if (s) pts.push({ x: s.x, y: s.y, id: s.id });
    }
    return pts;
  }

  return {
    create: create,
    update: update,
    hitTest: hitTest,
    getStar: getStar,
    pointsForIds: pointsForIds,
    dist: dist,
    neighborCount: neighborCount,
    mulberry32: mulberry32
  };
});
