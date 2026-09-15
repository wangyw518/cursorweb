/**
 * Local high score + last run seed. wx first, then localStorage, then memory.
 */

var HIGH_KEY = 'late-step-high-score';
var SEED_KEY = 'late-step-last-seed';
var memory = {};

function wxApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function webStore() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function readRaw(key) {
  var api = wxApi();
  try {
    if (api && typeof api.getStorageSync === 'function') {
      return api.getStorageSync(key);
    }
  } catch (err) {
    // DevTools / missing key
  }
  var web = webStore();
  try {
    if (web) {
      var raw = web.getItem(key);
      if (raw == null || raw === '') {
        return undefined;
      }
      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        return raw;
      }
    }
  } catch (webErr) {
    // ignore
  }
  return memory[key];
}

function writeRaw(key, value) {
  var api = wxApi();
  try {
    if (api && typeof api.setStorageSync === 'function') {
      api.setStorageSync(key, value);
      return;
    }
  } catch (err) {
    // fall through
  }
  var web = webStore();
  try {
    if (web) {
      web.setItem(key, JSON.stringify(value));
      return;
    }
  } catch (webErr) {
    // fall through
  }
  memory[key] = value;
}

function removeRaw(key) {
  var api = wxApi();
  try {
    if (api && typeof api.removeStorageSync === 'function') {
      api.removeStorageSync(key);
    }
  } catch (err) {
    // ignore
  }
  var web = webStore();
  try {
    if (web) {
      web.removeItem(key);
    }
  } catch (webErr) {
    // ignore
  }
  delete memory[key];
}

function getHighScore() {
  var value = readRaw(HIGH_KEY);
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '' && isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function setHighScore(score) {
  var n = typeof score === 'number' && isFinite(score) ? score : 0;
  writeRaw(HIGH_KEY, n);
}

function getLastSeed() {
  var value = readRaw(SEED_KEY);
  if (typeof value === 'number' && isFinite(value)) {
    return value >>> 0;
  }
  return null;
}

function setLastSeed(seed) {
  writeRaw(SEED_KEY, seed >>> 0);
}

function clearScores() {
  removeRaw(HIGH_KEY);
  removeRaw(SEED_KEY);
}

module.exports = {
  getHighScore,
  setHighScore,
  getLastSeed,
  setLastSeed,
  clearScores
};
