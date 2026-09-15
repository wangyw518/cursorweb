/**
 * Survive score (seconds × 10) + near-miss (+30 once per encounter).
 * 3 near-misses in a short window start a 1.5× multiplier for 2s.
 */

var defaultConfig = require('./config.json');
var { aabbDistance, playerAabb } = require('./collision');

function ghostKey(ghost) {
  if (ghost && ghost.id != null) {
    return 'g' + ghost.id;
  }
  var body = ghost && ghost.body ? ghost.body : ghost;
  return String((ghost && ghost.sourceT) || 0) + ':' + ((ghost && ghost.type) || '') + ':' + (body && body.x);
}

function ghostAabb(ghost) {
  var body = ghost && ghost.body ? ghost.body : ghost;
  return playerAabb(body);
}

function createScore(cfg) {
  var c = cfg || defaultConfig;
  var survivePerSec = c.surviveScorePerSec == null ? 10 : c.surviveScorePerSec;
  var nearMissPts = c.nearMissScore == null ? 30 : c.nearMissScore;
  var nearPx = c.nearMissPx == null ? 12 : c.nearMissPx;
  var comboN = c.nearMissComboCount == null ? 3 : c.nearMissComboCount;
  var comboWindow = (c.nearMissComboWindowMs == null ? 3000 : c.nearMissComboWindowMs) / 1000;
  var mult = c.scoreMultiplier == null ? 1.5 : c.scoreMultiplier;
  var multDur = (c.scoreMultiplierMs == null ? 2000 : c.scoreMultiplierMs) / 1000;

  var accrued = 0;
  var inside = {};
  var comboTimes = [];
  var multRemain = 0;
  var nearMissCount = 0;
  var lastAwardKeys = [];

  function currentMult() {
    return multRemain > 0 ? mult : 1;
  }

  function noteCombo(now) {
    comboTimes.push(now);
    var kept = [];
    var i;
    for (i = 0; i < comboTimes.length; i++) {
      if (now - comboTimes[i] <= comboWindow) {
        kept.push(comboTimes[i]);
      }
    }
    comboTimes = kept;
    if (comboTimes.length >= comboN) {
      multRemain = multDur;
      comboTimes = [];
    }
  }

  return {
    update: function (dt) {
      if (multRemain > 0) {
        multRemain = Math.max(0, multRemain - dt);
      }
      accrued += dt * survivePerSec * currentMult();
    },
    probeGhosts: function (player, ghosts, now) {
      lastAwardKeys = [];
      if (!player || !ghosts) {
        return lastAwardKeys;
      }
      var seen = {};
      var i;
      for (i = 0; i < ghosts.length; i++) {
        var ghost = ghosts[i];
        var key = ghostKey(ghost);
        seen[key] = true;
        var dist = aabbDistance(playerAabb(player), ghostAabb(ghost));
        if (dist > 0 && dist < nearPx) {
          if (!inside[key]) {
            inside[key] = true;
            accrued += nearMissPts * currentMult();
            nearMissCount += 1;
            noteCombo(now);
            lastAwardKeys.push(key);
          }
        } else {
          inside[key] = false;
        }
      }
      var stale;
      for (stale in inside) {
        if (inside.hasOwnProperty(stale) && !seen[stale]) {
          delete inside[stale];
        }
      }
      return lastAwardKeys;
    },
    addNearMiss: function (now) {
      accrued += nearMissPts * currentMult();
      nearMissCount += 1;
      noteCombo(now == null ? 0 : now);
    },
    add: function (n) {
      accrued += n || 0;
    },
    reset: function () {
      accrued = 0;
      inside = {};
      comboTimes = [];
      multRemain = 0;
      nearMissCount = 0;
      lastAwardKeys = [];
    },
    get: function () {
      return Math.floor(accrued + 1e-9);
    },
    getNearMissCount: function () {
      return nearMissCount;
    },
    getMultiplierRemain: function () {
      return multRemain;
    },
    getLastAwards: function () {
      return lastAwardKeys.slice();
    }
  };
}

module.exports = {
  createScore,
  ghostKey
};
