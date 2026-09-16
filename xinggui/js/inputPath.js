(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingguiInputPath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  function tryLink(path, fromStar, toStar, linkMaxPx) {
    if (!fromStar || !toStar) return { ok: false, reason: 'missing-star' };
    if (path.starIds.length === 0) return tryStart(path, toStar.id);
    if (fromStar.id !== lastId(path)) return { ok: false, reason: 'not-from-tip' };
    if (toStar.id === fromStar.id) return { ok: false, reason: 'same-star' };
    if (has(path, toStar.id)) {
      if (toStar.id === path.starIds[0] && path.starIds.length >= 4) {
        return tryClose(path, fromStar, toStar, linkMaxPx);
      }
      return { ok: false, reason: 'already-used' };
    }
    var dist = distance(fromStar, toStar);
    if (dist > linkMaxPx) {
      path.reject = {
        fromId: fromStar.id,
        toId: toStar.id,
        dist: dist,
        ttl: 0.32
      };
      return { ok: false, reason: 'too-far', dist: dist };
    }
    path.starIds.push(toStar.id);
    path.reject = null;
    return { ok: true, reason: 'linked', dist: dist };
  }

  function tryClose(path, fromStar, startStar, linkMaxPx) {
    if (!fromStar || !startStar) return { ok: false, reason: 'missing-star' };
    if (path.starIds.length < 4) return { ok: false, reason: 'too-few-nodes' };
    if (path.starIds[0] !== startStar.id) return { ok: false, reason: 'not-start' };
    if (fromStar.id !== lastId(path)) return { ok: false, reason: 'not-from-tip' };
    if (fromStar.id === startStar.id) return { ok: false, reason: 'same-star' };
    var dist = distance(fromStar, startStar);
    if (dist > linkMaxPx) {
      path.reject = {
        fromId: fromStar.id,
        toId: startStar.id,
        dist: dist,
        ttl: 0.32
      };
      return { ok: false, reason: 'too-far', dist: dist };
    }
    path.starIds.push(startStar.id);
    path.reject = null;
    return { ok: true, reason: 'closed', dist: dist };
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

  function handleStarTap(path, starsOrMap, starId, linkMaxPx) {
    var byId = Array.isArray(starsOrMap) ? indexStars(starsOrMap) : starsOrMap;
    var star = byId[starId];
    if (!star) return { ok: false, reason: 'unknown-star' };
    if (path.starIds.length === 0) return tryStart(path, starId);
    if (starId === lastId(path)) return { ok: false, reason: 'same-star' };
    if (path.starIds.length >= 2 && path.starIds[path.starIds.length - 2] === starId) {
      return undo(path);
    }
    if (starId === path.starIds[0] && path.starIds.length >= 4) {
      return tryClose(path, byId[lastId(path)], star, linkMaxPx);
    }
    return tryLink(path, byId[lastId(path)], star, linkMaxPx);
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
