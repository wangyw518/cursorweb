var config = require('./js/config.json');
var platformFactory = require('./js/platform.js');
var { createGame } = require('./js/runner.js');

var platform = platformFactory.create();
var game = createGame(platform, config);

if (typeof wx !== 'undefined' && typeof wx.showShareMenu === 'function') {
  try {
    wx.showShareMenu({ withShareTicket: true });
  } catch (err) {}
}

if (typeof wx !== 'undefined' && typeof wx.onShareAppMessage === 'function') {
  wx.onShareAppMessage(function () {
    var snap = game.getDebugState();
    return {
      title: '晚一步 — 你的动作会晚一步回来',
      query: 'from=menu&score=' + (snap.score && snap.score.score ? snap.score.score : 0)
    };
  });
}

platform.loop(function (dt) {
  game.tick(dt);
  game.draw(platform.ctx);
});
