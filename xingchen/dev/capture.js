var { spawn } = require('child_process');
var fs = require('fs');
var http = require('http');
var path = require('path');

var PORT = 9224;
var OUT = process.env.XINGCHEN_SHOT_DIR || '/opt/cursor/artifacts';
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
    '--user-data-dir=/tmp/chrome-xingchen',
    '--remote-debugging-port=' + PORT,
    '--window-size=430,780',
    'about:blank'
  ], { stdio: 'ignore' });

  var page = null;
  var i;
  for (i = 0; i < 40; i++) {
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
    width: 430,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true
  });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8766/dev/preview.html' });
  await sleep(1400);

  async function shot(name) {
    var pic = await cdp.send('Page.captureScreenshot', { format: 'png' });
    var dest = path.join(OUT, name + '.png');
    fs.writeFileSync(dest, Buffer.from(pic.data, 'base64'));
    console.log('wrote ' + dest);
  }

  async function evalExpr(expr) {
    var res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result ? res.result.value : null;
  }

  var boot = await evalExpr('!!window.__xingchen && !!window.__xingchen.session');
  if (!boot) throw new Error('game did not boot');
  await shot('xingchen_table_ready');

  var ball = await evalExpr('(function(){var b=window.__xingchen.session.ball; return {x:b.x,y:b.y};})()');
  await evalExpr(
    'window.__xingchen.sessionMod.handlePointerDown(window.__xingchen.session,' +
    ball.x + ',' + (ball.y + 16) + ')'
  );
  await evalExpr(
    'window.__xingchen.sessionMod.handlePointerMove(window.__xingchen.session,' +
    (ball.x - 96) + ',' + (ball.y + 36) + ')'
  );
  await sleep(80);
  var charging = await evalExpr('window.__xingchen.sessionMod.getDebugState(window.__xingchen.session)');
  console.log('charging', JSON.stringify({
    phase: charging.phase,
    power: charging.power,
    preview: charging.previewPoints,
    bounces: charging.previewBounces
  }));
  await shot('xingchen_drag_aim_bounce');

  await evalExpr(
    'window.__xingchen.sessionMod.handlePointerUp(window.__xingchen.session,' +
    (ball.x - 96) + ',' + (ball.y + 36) + ')'
  );
  await sleep(160);
  await shot('xingchen_ball_in_flight');

  var guard = 0;
  var live = null;
  while (guard < 80) {
    live = await evalExpr('window.__xingchen.sessionMod.getDebugState(window.__xingchen.session)');
    if (live.phase === 'scored' || live.phase === 'settle') break;
    await sleep(80);
    guard += 1;
  }
  console.log('after-flight', JSON.stringify({
    phase: live && live.phase,
    award: live && live.award,
    settle: live && live.settle
  }));
  await shot('xingchen_miss_burst');

  for (i = 0; i < 24; i++) {
    await evalExpr('window.__xingchen.sessionMod.update(window.__xingchen.session, 1/60)');
  }
  live = await evalExpr('window.__xingchen.sessionMod.getDebugState(window.__xingchen.session)');
  console.log('settle-play', JSON.stringify(live.settle));
  await shot('xingchen_settle_miss');

  await evalExpr('(function(){var g=window.__xingchen; g.sessionMod.restart(g.session); var gold=g.session.rings.filter(function(r){return r.tier===3;})[0]; var x=gold.x+(gold.innerR+gold.outerR)*0.5; g.sessionMod.debugPlace(g.session,x,gold.y,0,0); for(var i=0;i<40;i++) g.sessionMod.update(g.session,1/60);})()');
  await sleep(80);
  live = await evalExpr('window.__xingchen.sessionMod.getDebugState(window.__xingchen.session)');
  console.log('settle-record', JSON.stringify(live.settle));
  await shot('xingchen_settle_record');

  await evalExpr('(function(){var s=window.__xingchen.session; var r=s.ui.replay; window.__xingchen.sessionMod.handlePointerDown(s, r.x+20, r.y+12);})()');
  await sleep(200);
  live = await evalExpr('window.__xingchen.sessionMod.getDebugState(window.__xingchen.session)');
  console.log('replay', JSON.stringify({ phase: live.phase, best: live.best }));
  await shot('xingchen_replay_ready');

  await cdp.close();
  chrome.kill();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
