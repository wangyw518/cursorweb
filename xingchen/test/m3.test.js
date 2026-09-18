'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var config = require('../js/config.json');
var physics = require('../js/physics');
var skills = require('../js/skills');
var economy = require('../js/economy');
var targets = require('../js/targets');
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
  return sessionMod.create(viewport(), config);
}

check('ice skill uses higher friction and stops sooner', function () {
  var ice = skills.shotConfig(config, 'ice');
  assert.ok(ice.friction > config.friction);

  function travel(friction) {
    var body = physics.createBody(80, 200, 9);
    body.vx = 420;
    body.vy = 0;
    var world = { ball: body, walls: [], obstacles: [] };
    var cfg = { maxSpeed: 980, restitution: 0.74, friction: friction };
    var i;
    for (i = 0; i < 90; i++) physics.step(world, config.fixedDt, cfg);
    return Math.hypot(body.x - 80, body.y - 200);
  }

  assert.ok(travel(ice.friction) < travel(config.friction) - 8);
});

check('fire skill breaks the first obstacle hit', function () {
  var session = freshSession();
  sessionMod.selectSkill(session, 'fire');
  assert.strictEqual(session.selectedSkill, 'fire');
  var rock = session.obstacles[0];
  session.armedSkill = 'fire';
  session.shotConfig = skills.shotConfig(config, 'fire');
  sessionMod.debugPlace(session, rock.x - 40, rock.y, 280, 0);
  var i;
  var broken = false;
  for (i = 0; i < 80; i++) {
    sessionMod.update(session, config.fixedDt);
    if (rock.broken) {
      broken = true;
      break;
    }
  }
  assert.strictEqual(broken, true);
});

check('split skill creates a second ball', function () {
  var session = freshSession();
  sessionMod.selectSkill(session, 'split');
  var ball = session.ball;
  sessionMod.handlePointerDown(session, ball.x, ball.y + 20);
  sessionMod.handlePointerMove(session, ball.x, ball.y + 100);
  var fire = sessionMod.handlePointerUp(session, ball.x, ball.y + 100);
  assert.strictEqual(fire.kind, 'fire');
  assert.strictEqual(fire.skill, 'split');
  assert.strictEqual(session.balls.length, 2);
  assert.strictEqual(session.balls[1].twin, true);
});

check('colored target orbs add bonus on first hit', function () {
  var session = freshSession();
  var orb = session.targets[0];
  assert.strictEqual(orb.collected, false);
  sessionMod.debugPlace(session, orb.x - 28, orb.y, 240, 0);
  var i;
  for (i = 0; i < 60; i++) {
    sessionMod.update(session, config.fixedDt);
    if (orb.collected) break;
  }
  assert.strictEqual(orb.collected, true);
  assert.ok(session.shotBonus >= orb.bonus);
  assert.strictEqual(targets.collect(orb), 0);
});

check('stamina starts at 30, decrements on fire, empty shows share+ad hooks', function () {
  var session = freshSession();
  assert.strictEqual(session.wallet.stamina, 30);
  var ball = session.ball;
  sessionMod.handlePointerDown(session, ball.x, ball.y + 24);
  sessionMod.handlePointerMove(session, ball.x, ball.y + 90);
  sessionMod.handlePointerUp(session, ball.x, ball.y + 90);
  assert.strictEqual(session.wallet.stamina, 29);
  assert.strictEqual(session.shotsLeft, 4);

  session.wallet.stamina = 0;
  session.phase = 'aim';
  var blocked = sessionMod.handlePointerDown(session, ball.x, ball.y + 10);
  assert.strictEqual(blocked.kind, 'stamina');
  assert.strictEqual(session.phase, 'stamina');

  var shareHit = hud.hitTest(
    session.ui,
    session.ui.share.x + 20,
    session.ui.share.y + 10,
    'stamina'
  );
  var adHit = hud.hitTest(session.ui, session.ui.ad.x + 20, session.ui.ad.y + 10, 'stamina');
  assert.strictEqual(shareHit, 'share');
  assert.strictEqual(adHit, 'ad');

  sessionMod.handlePointerDown(session, session.ui.share.x + 20, session.ui.share.y + 10);
  assert.strictEqual(session.wallet.stamina, 1);
  assert.strictEqual(session.phase, 'aim');

  var ad = economy.rewardedAd({ stamina: 1, crystals: 0 }, config);
  assert.strictEqual(ad.kind, 'ad');
  assert.strictEqual(ad.stub, true);
  assert.strictEqual(ad.stamina, 4);
});

check('share/ad restore only virtual stamina, never cash', function () {
  var wallet = { stamina: 0, crystals: 2 };
  var share = economy.shareAssist(wallet, config);
  assert.strictEqual(share.kind, 'share');
  assert.strictEqual(share.amount, 1);
  assert.ok(wallet.stamina >= 1);
});

check('compliance: playable package copy stays virtual-only', function () {
  var root = path.join(__dirname, '..');
  var banned = [
    '提现', '赌博', '筹码', '奖池', '下注', '押注', '现金', '红包', '彩票',
    '充值', '金币', 'withdraw', 'gambling', 'cashout', 'jackpot'
  ];
  var files = [];
  function walk(dir) {
    fs.readdirSync(dir).forEach(function (name) {
      var full = path.join(dir, name);
      var st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'test' || name === 'dev') return;
        walk(full);
      } else if (/\.(js|json|html)$/.test(name)) {
        files.push(full);
      }
    });
  }
  walk(root);
  var hits = [];
  files.forEach(function (file) {
    var text = fs.readFileSync(file, 'utf8');
    banned.forEach(function (word) {
      if (text.toLowerCase().indexOf(word.toLowerCase()) !== -1) {
        hits.push(path.relative(root, file) + ':' + word);
      }
    });
  });
  assert.deepStrictEqual(hits, []);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('m3 ok');
