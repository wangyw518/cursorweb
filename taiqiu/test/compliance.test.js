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
var FORBIDDEN = ['提现', '红包', '赔率', '面额', '钞票', '¥', '￥', '赌博'];

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

check('tile vocabulary stays on 得分区 / 练习卡 / 目标格', function () {
  var tilesSrc = fs.readFileSync(path.join(ROOT, 'js/tiles.js'), 'utf8');
  assert.ok(tilesSrc.indexOf('得分区') !== -1);
  assert.ok(tilesSrc.indexOf('练习卡') !== -1);
  assert.ok(tilesSrc.indexOf('目标格') !== -1);
  assert.ok(tilesSrc.indexOf('faceValue') !== -1);
  assert.ok(tilesSrc.indexOf('FORBIDDEN_FIELDS') !== -1);
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
