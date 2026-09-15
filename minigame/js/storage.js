var KEY = 'late_step_high_score';

function readRaw() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
      return wx.getStorageSync(KEY);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(KEY);
    }
  } catch (err) {}
  return '';
}

function writeRaw(value) {
  try {
    if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
      wx.setStorageSync(KEY, value);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, value);
    }
  } catch (err) {}
}

function getHighScore() {
  var n = Number(readRaw());
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function setHighScore(score) {
  var next = Math.floor(Number(score) || 0);
  if (next > getHighScore()) writeRaw(String(next));
  return getHighScore();
}

module.exports = {
  KEY: KEY,
  getHighScore: getHighScore,
  setHighScore: setHighScore
};
