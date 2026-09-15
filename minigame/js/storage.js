/**
 * Local high-score persistence API. M0 does not surface this in HUD/UI.
 */
var KEY = 'late-step-high-score';

function getHighScore() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      var value = wx.getStorageSync(KEY);
      if (typeof value === 'number' && isFinite(value)) {
        return value;
      }
    }
  } catch (err) {
    // ignore missing storage in DevTools / Node
  }
  return 0;
}

function setHighScore(/* score */) {
  // Persistence wiring is M1+.
}

module.exports = {
  getHighScore,
  setHighScore
};
