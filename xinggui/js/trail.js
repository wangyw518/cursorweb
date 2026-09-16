'use strict';

const math = require('./math.js');

function createTrail() {
  return {
    ids: [],
    live: true
  };
}

function reset(trail) {
  trail.ids.length = 0;
  trail.live = true;
}

function pop(trail, starsById) {
  const id = trail.ids.pop();
  if (id == null) return null;
  const star = starsById[id];
  if (star) {
    star.selected = false;
    star.selIndex = -1;
  }
  return star;
}

function has(trail, id) {
  return trail.ids.indexOf(id) !== -1;
}

function firstId(trail) {
  return trail.ids.length ? trail.ids[0] : null;
}

function lastId(trail) {
  return trail.ids.length ? trail.ids[trail.ids.length - 1] : null;
}

function toPoints(trail, starsById) {
  const pts = [];
  for (let i = 0; i < trail.ids.length; i++) {
    const s = starsById[trail.ids[i]];
    if (s) pts.push({ x: s.x, y: s.y, id: s.id });
  }
  return pts;
}

function canAdd(trail, star, maxLink, starsById) {
  if (!star || !trail.live) return false;
  if (has(trail, star.id)) return false;
  if (!trail.ids.length) return true;
  const last = starsById[lastId(trail)];
  if (!last) return false;
  return math.dist(last.x, last.y, star.x, star.y) <= maxLink;
}

function addStar(trail, star) {
  if (!star || has(trail, star.id)) return false;
  trail.ids.push(star.id);
  star.selected = true;
  star.selIndex = trail.ids.length - 1;
  return true;
}

function canCloseAt(trail, x, y, threshold, minN, starsById) {
  if (trail.ids.length < minN) return false;
  const first = starsById[firstId(trail)];
  if (!first) return false;
  return math.dist(x, y, first.x, first.y) <= threshold;
}

function isFirstStar(trail, star) {
  return !!(star && trail.ids.length && star.id === firstId(trail));
}

function longestLink(trail, starsById) {
  const pts = toPoints(trail, starsById);
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = math.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    if (d > best) best = d;
  }
  return best;
}

function isBroken(trail, starsById, maxLink) {
  if (trail.ids.length < 2) return false;
  return longestLink(trail, starsById) > maxLink;
}

function stretchT(trail, starsById, warnAt, maxLink) {
  const d = longestLink(trail, starsById);
  if (d <= warnAt) return 0;
  return math.clamp((d - warnAt) / (maxLink - warnAt || 1), 0, 1);
}

function closedPoints(trail, starsById) {
  const pts = toPoints(trail, starsById);
  if (pts.length && (pts[0].x !== pts[pts.length - 1].x || pts[0].y !== pts[pts.length - 1].y)) {
    pts.push({ x: pts[0].x, y: pts[0].y, id: pts[0].id });
  }
  return pts;
}

module.exports = {
  createTrail: createTrail,
  reset: reset,
  pop: pop,
  has: has,
  firstId: firstId,
  lastId: lastId,
  toPoints: toPoints,
  canAdd: canAdd,
  addStar: addStar,
  canCloseAt: canCloseAt,
  isFirstStar: isFirstStar,
  longestLink: longestLink,
  isBroken: isBroken,
  stretchT: stretchT,
  closedPoints: closedPoints
};
