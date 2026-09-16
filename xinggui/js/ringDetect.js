(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiRingDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * M1: closed-ring test uses a signed winding number (Dan Sunday).
   * This is not even-odd ray casting — edge direction increments or decrements wn.
   * Area and in-ring stars share the same vertex list from polygonFromPath.
   */

  function indexStars(stars) {
    var map = {};
    for (var i = 0; i < (stars || []).length; i++) map[stars[i].id] = stars[i];
    return map;
  }

  function polygonFromPath(starIds, stars) {
    var ids = (starIds || []).slice();
    if (ids.length >= 2 && ids[0] === ids[ids.length - 1]) ids.pop();
    var byId = indexStars(stars);
    var verts = [];
    for (var i = 0; i < ids.length; i++) {
      var s = byId[ids[i]];
      if (s) verts.push({ x: s.x, y: s.y, id: s.id });
    }
    return verts;
  }

  function isLeft(a, b, p) {
    return (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
  }

  function windingNumber(p, vertices) {
    var wn = 0;
    var n = vertices.length;
    if (n < 3) return 0;
    for (var i = 0; i < n; i++) {
      var a = vertices[i];
      var b = vertices[(i + 1) % n];
      if (a.y <= p.y) {
        if (b.y > p.y && isLeft(a, b, p) > 0) wn += 1;
      } else if (b.y <= p.y && isLeft(a, b, p) < 0) {
        wn -= 1;
      }
    }
    return wn;
  }

  function shoelace(vertices) {
    var n = vertices.length;
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      acc += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return acc / 2;
  }

  function areaFactorFrom(area, playRect, config) {
    if (!playRect) return 0;
    var playArea = playRect.w * playRect.h;
    var ratio = (config && config.areaNormRatio) || 0.12;
    var cap = config && config.areaFactorCap != null ? config.areaFactorCap : 2.5;
    var norm = playArea * ratio;
    if (!(norm > 0) || !(area > 0)) return 0;
    var f = area / norm;
    if (f < 0) f = 0;
    if (f > cap) f = cap;
    return f;
  }

  function detectClosedRing(starIds, stars, opts) {
    opts = opts || {};
    var ids = starIds || [];
    var vertices = polygonFromPath(ids, stars);
    var returnedToStart = ids.length >= 2 && ids[0] === ids[ids.length - 1];
    var closed = returnedToStart && vertices.length >= 4;
    var area = closed ? Math.abs(shoelace(vertices)) : 0;
    var areaFactor = closed ? areaFactorFrom(area, opts.playRect, opts.config) : 0;
    var inRing = [];
    if (closed) {
      var onRing = {};
      var i;
      for (i = 0; i < vertices.length; i++) onRing[vertices[i].id] = true;
      for (i = 0; i < (stars || []).length; i++) {
        var s = stars[i];
        if (onRing[s.id]) continue;
        if (windingNumber(s, vertices) !== 0) inRing.push(s);
      }
    }
    return {
      closed: closed,
      vertices: vertices,
      nodes: vertices.length,
      area: area,
      areaFactor: areaFactor,
      inRing: inRing,
      inRingCount: inRing.length,
      kind: closed ? 'winding' : null,
      perfect: false
    };
  }

  return {
    detectClosedRing: detectClosedRing,
    polygonFromPath: polygonFromPath,
    windingNumber: windingNumber,
    shoelace: shoelace,
    areaFactorFrom: areaFactorFrom,
    isLeft: isLeft
  };
});
