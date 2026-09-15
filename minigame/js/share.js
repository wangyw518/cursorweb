/**
 * Mock share card. Builds night-card fields + copy; does not require real wx share.
 */

var defaultConfig = require('./config.json');

var lastPayload = null;

function buildShareText(score, gap) {
  return '我刚打了 ' + score + '，就差 ' + gap + ' 分破纪录，你来试试';
}

function buildPayload(model, cfg) {
  var colors = (cfg && cfg.colors) || defaultConfig.colors || {};
  var score = model && model.score != null ? model.score : 0;
  var gap = model && model.gap != null ? model.gap : 0;
  var seed = model && model.seed != null ? model.seed : 0;
  return {
    title: '晚一步',
    text: buildShareText(score, gap),
    score: score,
    gap: gap,
    surviveSec: model && model.surviveSec != null ? model.surviveSec : 0,
    seed: seed,
    isNewRecord: !!(model && model.isNewRecord),
    deathReason: model && model.deathReason,
    colors: {
      bg: colors.bg,
      player: colors.player,
      ghost: colors.ghost,
      ghostAlpha: colors.ghostAlpha,
      ghostStroke: colors.ghostStroke,
      terrain: colors.terrain,
      nearMiss: colors.nearMiss
    },
    mocked: true
  };
}

function toastMocked(api) {
  var wxApi = api || (typeof wx !== 'undefined' ? wx : null);
  try {
    if (wxApi && typeof wxApi.showToast === 'function') {
      wxApi.showToast({
        title: '分享已模拟',
        icon: 'none',
        duration: 2000
      });
    }
  } catch (err) {
    // Node / tests
  }
}

function share(modelOrPayload, cfg) {
  var payload = modelOrPayload && modelOrPayload.text
    ? modelOrPayload
    : buildPayload(modelOrPayload || {}, cfg);
  lastPayload = payload;
  toastMocked();
  return payload;
}

function getLastPayload() {
  return lastPayload;
}

function installShareHandlers() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.onShareAppMessage === 'function') {
      wx.onShareAppMessage(function () {
        var p = lastPayload || buildPayload({ score: 0, gap: 0, seed: 0 });
        return {
          title: p.text,
          query: 'seed=' + p.seed + '&score=' + p.score
        };
      });
    }
  } catch (err) {
    // no-op
  }
}

module.exports = {
  buildShareText,
  buildPayload,
  share,
  getLastPayload,
  installShareHandlers
};
