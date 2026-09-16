'use strict';

const assert = require('assert');
const trailLib = require('../js/trail.js');

function star(id, x, y) {
  return { id: id, x: x, y: y, selected: false, selIndex: -1 };
}

exports.addAndRejectDuplicate = function () {
  const trail = trailLib.createTrail();
  const byId = {};
  const a = star(1, 0, 0);
  const b = star(2, 40, 0);
  byId[1] = a;
  byId[2] = b;
  assert.ok(trailLib.canAdd(trail, a, 100, byId));
  trailLib.addStar(trail, a);
  assert.strictEqual(trailLib.canAdd(trail, a, 100, byId), false);
  assert.ok(trailLib.canAdd(trail, b, 100, byId));
  trailLib.addStar(trail, b);
  assert.strictEqual(trail.ids.length, 2);
};

exports.rejectFarLink = function () {
  const trail = trailLib.createTrail();
  const a = star(1, 0, 0);
  const far = star(2, 400, 0);
  const byId = { 1: a, 2: far };
  trailLib.addStar(trail, a);
  assert.strictEqual(trailLib.canAdd(trail, far, 100, byId), false);
};

exports.closeWhenNearFirst = function () {
  const trail = trailLib.createTrail();
  const stars = [star(1, 0, 0), star(2, 20, 0), star(3, 20, 20), star(4, 0, 20)];
  const byId = {};
  stars.forEach(function (s) {
    byId[s.id] = s;
    trailLib.addStar(trail, s);
  });
  assert.ok(trailLib.canCloseAt(trail, 2, 2, 8, 4, byId));
  assert.strictEqual(trailLib.canCloseAt(trail, 80, 80, 8, 4, byId), false);
};

exports.breaksWhenStretched = function () {
  const trail = trailLib.createTrail();
  const a = star(1, 0, 0);
  const b = star(2, 10, 0);
  const byId = { 1: a, 2: b };
  trailLib.addStar(trail, a);
  trailLib.addStar(trail, b);
  b.x = 300;
  assert.ok(trailLib.isBroken(trail, byId, 80));
};
