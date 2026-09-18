'use strict';

var assert = require('assert');

var config = require('../js/config.json');
var cells = require('../js/cells');
var targets = require('../js/targets');
var skills = require('../js/skills');
var stamina = require('../js/stamina');
var level = require('../js/level');
var score = require('../js/score');
var physics = require('../js/physics');
var sessionMod = require('../js/session');
var storage = require('../js/storage');
var hud = require('../js/hud');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures++;
    console.error('FAIL  ' + name);
    console.error('  ' + err.message);
  }
}

function viewport() {
  return {
    width: 375,
    height: 667,
    pixelRatio: 2,
    statusBarHeight: 20,
    safeTop: 20,
    safeBottom: 0
  };
}

function freshSession() {
  storage.resetMemory();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storage.KEY);
  } catch (err) {}
  return sessionMod.create(viewport(), config);
}

function tickUntil(session, pred, maxSteps) {
  var i;
  for (i = 0; i < (maxSteps || 400); i++) {
    sessionMod.update(session, config.fixedDt);
    if (pred(session)) return session;
  }
  return session;
}

check('display name and compliance copy stay cash-free', function () {
  assert.strictEqual(config.displayName, '奇境弹球');
  var blob = JSON.stringify(config);
  assert.ok(!/提现|赌博|筹码|现金|¥/.test(blob));
  assert.ok(config.colors.tableInner !== '#0B5D2A');
});

check('grid pick awards bronze/silver/gold/epic from ball center', function () {
  var session = freshSession();
  assert.ok(session.cells.length >= 20);
  var bronze = cells.findTier(session.cells, 0);
  var silver = cells.findTier(session.cells, 1);
  var gold = cells.findTier(session.cells, 2);
  var epic = cells.findTier(session.cells, 3);
  assert.ok(bronze && silver && gold && epic);
  assert.strictEqual(score.fromCell(cells.pick(session.cells, bronze.x + 2, bronze.y + 2), config).score, 20);
  assert.strictEqual(score.fromCell(cells.pick(session.cells, silver.x + 2, silver.y + 2), config).score, 50);
  assert.strictEqual(score.fromCell(cells.pick(session.cells, gold.x + 2, gold.y + 2), config).score, 100);
  assert.strictEqual(score.fromCell(cells.pick(session.cells, epic.x + 2, epic.y + 2), config).score, 180);
  assert.strictEqual(cells.pick(session.cells, -40, -40).miss, true);
});

check('colored target orbs grant bonus on overlap', function () {
  var session = freshSession();
  var orb = session.targets[0];
  assert.ok(orb);
  assert.strictEqual(orb.collected, false);
  var hits = targets.collect(session.targets, { x: orb.x, y: orb.y, r: 9 });
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].bonus, config.targetBonuses[0]);
  assert.strictEqual(orb.collected, true);
  assert.strictEqual(targets.collect(session.targets, { x: orb.x, y: orb.y, r: 9 }).length, 0);
});

check('fire skill breaks the first obstacle hit', function () {
  var session = freshSession();
  session.skill = 'fire';
  var rock = session.obstacles[0];
  var before = session.obstacles.filter(function (o) { return !o.broken; }).length;
  sessionMod.debugPlace(session, rock.x - rock.r - 18, rock.y, 320, 0);
  tickUntil(session, function (s) {
    return s.obstacles.some(function (o) { return o.broken; }) || s.phase !== 'flight';
  }, 90);
  var after = session.obstacles.filter(function (o) { return !o.broken; }).length;
  assert.ok(after < before, '炎破 should remove one obstacle');
});

check('ice skill uses higher friction than a normal shot', function () {
  var ice = skills.shotConfig(config, config.iceFrictionMul);
  assert.ok(ice.friction > config.friction);
  var normal = { x: 80, y: 200, vx: 240, vy: 0, r: 9 };
  var frosted = { x: 80, y: 200, vx: 240, vy: 0, r: 9 };
  var walls = [];
  var rocks = [];
  var i;
  for (i = 0; i < 40; i++) {
    physics.step({ ball: normal, walls: walls, obstacles: rocks }, config.fixedDt, config);
    physics.step({ ball: frosted, walls: walls, obstacles: rocks }, config.fixedDt, ice);
  }
  assert.ok(
    Math.hypot(frosted.vx, frosted.vy) < Math.hypot(normal.vx, normal.vy) - 4,
    'frosted ball should be slower'
  );
});

check('split plans two angled balls; session can select 双生', function () {
  var plan = skills.plan('split', { vx: 0, vy: -400 }, config);
  assert.strictEqual(plan.balls.length, 2);
  assert.ok(plan.balls[0].vx < 0);
  assert.ok(plan.balls[1].vx > 0);
  var session = freshSession();
  var btn = session.ui.skills.filter(function (s) { return s.id === 'split'; })[0];
  var tap = sessionMod.handlePointerDown(session, btn.x + 8, btn.y + 8);
  assert.strictEqual(tap.kind, 'skill');
  assert.strictEqual(session.skill, 'split');
});

check('level reaches target within K shots and otherwise fails', function () {
  var lv = level.create(config);
  assert.strictEqual(lv.shotsMax, 3);
  assert.strictEqual(lv.target, 150);
  level.applyShot(lv, 80);
  assert.strictEqual(lv.over, false);
  level.applyShot(lv, 80);
  assert.strictEqual(lv.won, true);
  assert.strictEqual(lv.over, true);

  var lose = level.create(config);
  level.applyShot(lose, 20);
  level.applyShot(lose, 20);
  level.applyShot(lose, 20);
  assert.strictEqual(lose.won, false);
  assert.strictEqual(lose.over, true);
  assert.strictEqual(lose.score, 60);
});

check('stamina starts at 30, spends 1 per shot, share/ad stubs restore', function () {
  assert.strictEqual(config.staminaMax, 30);
  var spent = stamina.spend(30, config);
  assert.strictEqual(spent.ok, true);
  assert.strictEqual(spent.stamina, 29);
  var empty = stamina.spend(0, config);
  assert.strictEqual(empty.ok, false);
  var share = stamina.shareAssist(0, config);
  assert.strictEqual(share.stub, true);
  assert.strictEqual(share.stamina, 1);
  var ad = stamina.watchAd(0, config);
  assert.strictEqual(ad.stub, true);
  assert.strictEqual(ad.stamina, 3);
  assert.ok(!/提现|现金|赌/.test(JSON.stringify(share) + JSON.stringify(ad)));
});

check('session fire spends stamina; empty stamina opens share/ad stubs', function () {
  var session = freshSession();
  assert.strictEqual(session.stamina, 30);
  var ball = session.ball;
  sessionMod.handlePointerDown(session, ball.x, ball.y + 50);
  sessionMod.handlePointerMove(session, ball.x, ball.y + 100);
  var fire = sessionMod.handlePointerUp(session, ball.x, ball.y + 100);
  assert.strictEqual(fire.kind, 'fire');
  assert.strictEqual(session.stamina, 29);
  assert.strictEqual(session.level.shotsLeft, 2);

  session.stamina = 0;
  session.phase = 'aim';
  launcherCancel(session);
  var blocked = sessionMod.handlePointerDown(session, session.ball.x, session.ball.y + 40);
  assert.strictEqual(blocked.kind, 'empty');
  assert.strictEqual(session.modal, 'empty');
  var shareHit = hud.hitTest(
    session.ui,
    session.ui.share.x + 10,
    session.ui.share.y + 10,
    'aim',
    'empty',
    0
  );
  assert.strictEqual(shareHit, 'share');
  sessionMod.handlePointerDown(session, session.ui.share.x + 10, session.ui.share.y + 10);
  assert.strictEqual(session.stamina, 1);
  session.stamina = 0;
  session.modal = 'empty';
  session.phase = 'aim';
  sessionMod.handlePointerDown(session, session.ui.ad.x + 10, session.ui.ad.y + 10);
  assert.strictEqual(session.stamina, 3);
});

function launcherCancel(session) {
  session.launcher.dragging = false;
  session.launcher.power = 0;
}

check('session stop on a gold cell banks the tier into the level score', function () {
  var session = freshSession();
  var gold = cells.findTier(session.cells, 2);
  session.level.shotsLeft = 1;
  sessionMod.debugPlace(session, gold.x + gold.w * 0.5, gold.y + gold.h * 0.5, 0, 0);
  tickUntil(session, function (s) { return s.phase === 'settle'; }, 40);
  assert.strictEqual(session.award.score, 100);
  assert.strictEqual(session.level.score, 100);
  assert.strictEqual(session.settle.score, 100);
  assert.strictEqual(session.settle.won, false);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m3 ok');
