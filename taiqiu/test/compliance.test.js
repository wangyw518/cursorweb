'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var config = require('../js/config.json');
var score = require('../js/score');

var failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failures += 1;
    console.error('FAIL  ' + name);
    console.error('  ' + err.message);
  }
}

var ROOT = path.join(__dirname, '..');
var DISCLAIMER = '虚拟道具，仅限游戏内使用，不可兑换现金';
var FORBIDDEN = [
  '提现', '红包', '赔率', '面额', '钞票', '¥', '￥', '赌博',
  '开奖', '中奖', '翻倍', '押中', '赚钱', '到账', '倍率'
];

function runtimeFiles() {
  var list = [
    path.join(ROOT, 'game.js'),
    path.join(ROOT, 'game.json'),
    path.join(ROOT, 'project.config.json'),
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'dev', 'preview.html')
  ];
  fs.readdirSync(path.join(ROOT, 'js')).forEach(function (name) {
    list.push(path.join(ROOT, 'js', name));
  });
  return list;
}

check('required disclaimer is present in config and score module', function () {
  assert.strictEqual(config.disclaimer, DISCLAIMER);
  assert.strictEqual(score.DISCLAIMER, DISCLAIMER);
});

check('runtime sources do not use cash-gambling copy', function () {
  var hits = [];
  runtimeFiles().forEach(function (file) {
    var text = fs.readFileSync(file, 'utf8');
    var stripped = text.split(DISCLAIMER).join('');
    FORBIDDEN.forEach(function (word) {
      if (stripped.indexOf(word) !== -1) {
        hits.push(path.relative(ROOT, file) + ':' + word);
      }
    });
  });
  assert.deepStrictEqual(hits, []);
});

check('StarZone vocabulary is 新星 / 流星 / 彗星 / 恒星 and virtual 星币', function () {
  var tilesSrc = fs.readFileSync(path.join(ROOT, 'js/tiles.js'), 'utf8');
  var scoreSrc = fs.readFileSync(path.join(ROOT, 'js/score.js'), 'utf8');
  var fsmSrc = fs.readFileSync(path.join(ROOT, 'js/fsm.js'), 'utf8');
  ['新星', '流星', '彗星', '恒星'].forEach(function (name) {
    assert.ok(tilesSrc.indexOf(name) !== -1, name);
  });
  assert.ok(scoreSrc.indexOf('星币') !== -1);
  assert.ok(fsmSrc.indexOf('WaitCueStop') !== -1);
  assert.ok(fsmSrc.indexOf('StarZone') !== -1);
  assert.ok(config.currency === '星币');
  assert.ok(config.viewMode === 'top');
  assert.ok(scoreSrc.indexOf('得分加成') !== -1 || fs.readFileSync(path.join(ROOT, 'js/hud.js'), 'utf8').indexOf('得分加成') !== -1);
  assert.ok(fs.readFileSync(path.join(ROOT, 'js/hud.js'), 'utf8').indexOf('落点加成') !== -1);
});

check('share stub mentions only score / rank / in-game 星币', function () {
  var src = fs.readFileSync(path.join(ROOT, 'js/share.js'), 'utf8');
  assert.ok(src.indexOf('星币') !== -1);
  ['赚钱', '红包', '提现', '到账'].forEach(function (word) {
    assert.strictEqual(src.indexOf(word), -1);
  });
});

check('project is a WeChat game with the assigned AppID', function () {
  var proj = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  var game = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.json'), 'utf8'));
  assert.strictEqual(proj.appid, 'wxc8683bd9c1599d7d');
  assert.strictEqual(proj.compileType, 'game');
  assert.strictEqual(proj.projectname, 'taiqiu');
  assert.strictEqual(game.deviceOrientation, 'portrait');
});

check('README documents import from taiqiu/ not the repo root', function () {
  var md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(md.indexOf('导入项目') !== -1);
  assert.ok(md.indexOf('taiqiu/') !== -1);
  assert.ok(md.indexOf(DISCLAIMER) !== -1);
});

if (failures) {
  console.error(failures + ' failed');
  process.exit(1);
}
console.log('compliance tests passed');
