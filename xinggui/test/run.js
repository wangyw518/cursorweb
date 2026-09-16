'use strict';

const path = require('path');
const fs = require('fs');

const files = fs.readdirSync(__dirname).filter(function (f) {
  return f.endsWith('.test.js');
}).sort();

let passed = 0;
let failed = 0;

files.forEach(function (file) {
  const fn = require(path.join(__dirname, file));
  const names = Object.keys(fn);
  names.forEach(function (name) {
    try {
      fn[name]();
      passed++;
      console.log('  ok  ' + file + ' · ' + name);
    } catch (err) {
      failed++;
      console.error('  FAIL  ' + file + ' · ' + name);
      console.error('       ' + (err && err.stack ? err.stack : err));
    }
  });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
