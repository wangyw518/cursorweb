var { spawn } = require('child_process');
var fs = require('fs');
var http = require('http');
var path = require('path');

var PORT = 9231;
var OUT = process.env.TAIQIU_SHOT_DIR || path.join(__dirname, '..', 'shots');
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
    '--user-data-dir=/tmp/chrome-taiqiu',
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
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8767/dev/preview.html' });
  await sleep(1600);

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

  var boot = await evalExpr('!!window.__taiqiu && !!window.__taiqiu.session');
  if (!boot) throw new Error('game did not boot');
  await evalExpr('(function(){var g=window.__taiqiu; g.sessionMod.restart(g.session); g.session.best=0; g.session.skinProgress=0;})()');
  await sleep(80);
  await shot('taiqiu_table_ready');

  await evalExpr('(function(){var s=window.__taiqiu.session; var r=s.ui.mode; window.__taiqiu.sessionMod.handlePointerDown(s,r.x+10,r.y+10);})()');
  await sleep(60);
  await shot('taiqiu_aim3d_stub');
  await evalExpr('window.__taiqiu.sessionMod.toggleAim3d(window.__taiqiu.session)');

  var ball = await evalExpr('(function(){var b=window.__taiqiu.session.balls.filter(function(x){return x.id==="cue";})[0]; return {x:b.x,y:b.y};})()');
  await evalExpr(
    'window.__taiqiu.sessionMod.handlePointerDown(window.__taiqiu.session,' +
    ball.x + ',' + (ball.y + 18) + ')'
  );
  await evalExpr(
    'window.__taiqiu.sessionMod.handlePointerMove(window.__taiqiu.session,' +
    (ball.x - 40) + ',' + (ball.y + 110) + ')'
  );
  await sleep(80);
  await shot('taiqiu_drag_aim');

  await evalExpr(
    'window.__taiqiu.sessionMod.handlePointerUp(window.__taiqiu.session,' +
    (ball.x - 40) + ',' + (ball.y + 110) + ')'
  );
  await sleep(180);
  await shot('taiqiu_ball_in_flight');

  await evalExpr('(function(){var g=window.__taiqiu; var zone=g.session.tiles.filter(function(t){return t.kind==="stellar";})[0]; g.sessionMod.debugForceStop(g.session,{pocketTarget:true,firstContact:true,x:zone.x,y:zone.y});})()');
  await sleep(80);
  await shot('taiqiu_settle_legal');

  await evalExpr('(function(){var s=window.__taiqiu.session; var r=s.ui.replay; window.__taiqiu.sessionMod.handlePointerDown(s,r.x+20,r.y+12);})()');
  await sleep(80);
  await shot('taiqiu_replay_ready');

  await cdp.close();
  chrome.kill();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
