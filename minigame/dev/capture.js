var { spawn } = require('child_process');
var fs = require('fs');
var http = require('http');
var path = require('path');

var PORT = 9223;
var OUT = '/tmp/late-step';
fs.mkdirSync(OUT, { recursive: true });

function getJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var buf = '';
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(buf)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function createCdp(wsUrl) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);
    var id = 0;
    var pending = {};
    ws.addEventListener('open', function () {
      resolve({
        send: function (method, params) {
          var n = ++id;
          return new Promise(function (res, rej) {
            pending[n] = { res: res, rej: rej };
            ws.send(JSON.stringify({ id: n, method: method, params: params || {} }));
          });
        },
        close: function () { ws.close(); }
      });
    });
    ws.addEventListener('message', function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.id && pending[msg.id]) {
        if (msg.error) pending[msg.id].rej(new Error(JSON.stringify(msg.error)));
        else pending[msg.id].res(msg.result || {});
        delete pending[msg.id];
      }
    });
    ws.addEventListener('error', reject);
  });
}

async function main() {
  var chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--user-data-dir=/tmp/chrome-late-step',
    '--remote-debugging-port=' + PORT,
    '--window-size=390,844',
    'about:blank'
  ], { stdio: 'ignore' });

  var page = null;
  for (var i = 0; i < 40; i++) {
    try {
      var tabs = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      if (tabs && tabs.length) { page = tabs[0]; break; }
    } catch (err) {}
    await sleep(150);
  }
  if (!page) throw new Error('chrome did not open');

  var cdp = await createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8765/dev/preview.html' });
  await sleep(1200);

  async function shot(name) {
    var pic = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(pic.data, 'base64'));
    console.log('wrote ' + name);
  }

  async function evalExpr(expr) {
    var res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result ? res.result.value : null;
  }

  async function tap(x, y) {
    await evalExpr('window.__lateStep.game.handleTap({x:' + x + ',y:' + y + '})');
  }

  await shot('01_boot');
  var boot = await evalExpr('!!window.__lateStep && window.__lateStep.game.getDebugState().session.alive');
  if (!boot) throw new Error('game did not boot');

  await tap(80, 780);
  await sleep(400);
  await shot('02_after_jump');

  await evalExpr('(function(){var g=window.__lateStep.game; var s=g.getDebugState(); while(s.session.alive && s.session.simTimeMs<2100){g.stepOnce(); s=g.getDebugState();} g.requestJump(); for(var i=0;i<8;i++) g.stepOnce(); for(var j=0;j<96;j++){ if(j===40) g.requestDash(); g.stepOnce(); } return g.getDebugState().ghosts.length;})()');
  await sleep(80);
  await shot('03_ghost_replay');
  var ghostState = await evalExpr('(function(){var s=window.__lateStep.game.getDebugState(); return {ghosts:s.ghosts.length, t:Math.round(s.session.simTimeMs), alive:s.session.alive};})()');
  console.log('ghost', JSON.stringify(ghostState));

  await evalExpr('(function(){var g=window.__lateStep.game; for(var i=0;i<90;i++){ if(i%20===0) g.requestJump(); if(i%35===0) g.requestDash(); } return g.getDebugState().session.simTimeMs;})()');
  await sleep(2500);
  await tap(80, 780);
  await sleep(400);
  await tap(300, 780);
  await sleep(1600);
  await shot('03_ghost_window');

  var state = await evalExpr('(function(){var s=window.__lateStep.game.getDebugState(); return {alive:s.session.alive, ghosts:s.ghosts.length, t:s.session.simTimeMs, score:s.score};})()');
  console.log('mid', JSON.stringify(state));

  var guard = 0;
  while (guard < 80) {
    var live = await evalExpr('(function(){var s=window.__lateStep.game.getDebugState(); return {alive:s.session.alive, ghosts:s.ghosts.length, reason:s.session.deathReason, settle:s.session.settle, t:Math.round(s.session.simTimeMs)};})()');
    if (!live.alive) {
      console.log('dead', JSON.stringify(live));
      break;
    }
    if (guard % 6 === 0) await tap(80, 780);
    if (guard % 11 === 0) await tap(300, 780);
    await sleep(180);
    guard += 1;
  }

  await sleep(200);
  await shot('04_settle');
  var settle = await evalExpr('(function(){var s=window.__lateStep.game.getDebugState(); return s.session.settle;})()');
  console.log('settle', JSON.stringify(settle));

  var shareBtn = await evalExpr('(function(){var l=window.__lateStep.game.getDebugState().settleLayout; return l && l.share;})()');
  if (shareBtn) {
    await tap(shareBtn.x + shareBtn.w / 2, shareBtn.y + shareBtn.h / 2);
  }
  await sleep(250);
  await shot('05_share_mock');

  await evalExpr('window.__lateStep.game.replay()');
  await sleep(300);
  await shot('06_replay');
  var again = await evalExpr('(function(){var s=window.__lateStep.game.getDebugState(); return {alive:s.session.alive, step:s.session.simStep};})()');
  console.log('replay', JSON.stringify(again));

  await cdp.close();
  chrome.kill();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
