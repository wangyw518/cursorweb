(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./ringDetect') : root.XingguiRingDetect
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiInputPath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ringDetect) {
  'use strict';

  function create() {
    return {
      starIds: [],
      reject: null,
      hadUndo: false
    };
  }

  function ids(path) {
    return path.starIds.slice();
  }

  function lastId(path) {
    if (!path.starIds.length) return null;
    return path.starIds[path.starIds.length - 1];
  }

  function has(path, starId) {
    return path.starIds.indexOf(starId) !== -1;
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function tryStart(path, starId) {
    if (path.starIds.length !== 0) return { ok: false, reason: 'already-started' };
    path.starIds.push(starId);
    path.reject = null;
    path.hadUndo = false;
    return { ok: true, reason: 'started' };
  }

  function rejectDistance(path, fromStar, toStar, dist) {
    path.reject = {
      fromId: fromStar.id,
      toId: toStar.id,
      dist: dist,
      ttl: 0.32
    };
    return { ok: false, reason: 'too-far', dist: dist };
  }

  /**
   * Already-used stars are rejected by default.
   * Only exception: toId === path[0] && path.length >= 4, then RingDetect (winding).
   */
  function tryLink(path, fromStar, toStar, linkMaxPx, stars, opts) {
    if (!fromStar || !toStar) return { ok: false, reason: 'missing-star' };
    if (path.starIds.length === 0) return tryStart(path, toStar.id);
    if (fromStar.id !== lastId(path)) return { ok: false, reason: 'not-from-tip' };
    if (toStar.id === fromStar.id) return { ok: false, reason: 'same-star' };

    var closing = toStar.id === path.starIds[0] && path.starIds.length >= 4;
    if (has(path, toStar.id) && !closing) {
      return { ok: false, reason: 'already-used' };
    }

    var dist = distance(fromStar, toStar);
    if (dist > linkMaxPx) return rejectDistance(path, fromStar, toStar, dist);

    if (closing) return tryClose(path, fromStar, toStar, linkMaxPx, stars, opts);

    path.starIds.push(toStar.id);
    path.reject = null;
    return { ok: true, reason: 'linked', dist: dist };
  }

  function tryClose(path, fromStar, startStar, linkMaxPx, stars, opts) {
    if (!fromStar || !startStar) return { ok: false, reason: 'missing-star' };
    if (path.starIds.length < 4) return { ok: false, reason: 'too-few-nodes' };
    if (path.starIds[0] !== startStar.id) return { ok: false, reason: 'not-start' };
    if (fromStar.id !== lastId(path)) return { ok: false, reason: 'not-from-tip' };
    if (fromStar.id === startStar.id) return { ok: false, reason: 'same-star' };
    var dist = distance(fromStar, startStar);
    if (dist > linkMaxPx) return rejectDistance(path, fromStar, startStar, dist);

    path.starIds.push(startStar.id);
    path.reject = null;
    var ring = ringDetect.detectClosedRing(path.starIds, stars, opts || {});
    if (!ring.closed) {
      path.starIds.pop();
      return { ok: false, reason: 'not-closed', ring: ring };
    }
    return { ok: true, reason: 'closed', dist: dist, ring: ring };
  }

  function undo(path) {
    if (path.starIds.length === 0) return { ok: false, reason: 'empty' };
    var removed = path.starIds.pop();
    path.reject = null;
    path.hadUndo = true;
    return { ok: true, reason: 'undone', removed: removed };
  }

  function clear(path) {
    var had = path.starIds.length > 0 || !!path.reject;
    path.starIds.length = 0;
    path.reject = null;
    path.hadUndo = false;
    return { ok: had, reason: 'cleared' };
  }

  function tickReject(path, dt) {
    if (!path.reject) return;
    path.reject.ttl -= dt;
    if (path.reject.ttl <= 0) path.reject = null;
  }

  function indexStars(stars) {
    var map = {};
    for (var i = 0; i < stars.length; i++) map[stars[i].id] = stars[i];
    return map;
  }

  function handleStarTap(path, starsOrMap, starId, linkMaxPx, opts) {
    var stars = Array.isArray(starsOrMap) ? starsOrMap : null;
    var byId = stars ? indexStars(stars) : starsOrMap;
    var star = byId[starId];
    if (!star) return { ok: false, reason: 'unknown-star' };
    if (path.starIds.length === 0) return tryStart(path, starId);
    if (starId === lastId(path)) return { ok: false, reason: 'same-star' };
    return tryLink(path, byId[lastId(path)], star, linkMaxPx, stars || Object.keys(byId).map(function (k) {
      return byId[k];
    }), opts);
  }

  return {
    create: create,
    ids: ids,
    lastId: lastId,
    has: has,
    distance: distance,
    tryStart: tryStart,
    tryLink: tryLink,
    tryClose: tryClose,
    undo: undo,
    clear: clear,
    tickReject: tickReject,
    indexStars: indexStars,
    handleStarTap: handleStarTap
  };
});
