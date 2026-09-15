function createScore(config) {
  var points = 0;
  var streak = 0;
  var lastNearMs = -1;
  var multiUntilMs = 0;
  var seen = {};
  var streakWindowMs = 2500;

  function multiplierAt(simTimeMs) {
    return simTimeMs <= multiUntilMs ? 1.5 : 1;
  }

  function tick(simTimeMs, dt) {
    points += 10 * dt * multiplierAt(simTimeMs);
    if (lastNearMs >= 0 && simTimeMs - lastNearMs > streakWindowMs) {
      streak = 0;
    }
  }

  function nearMiss(ghostId, simTimeMs) {
    if (seen[ghostId]) return false;
    seen[ghostId] = true;
    streak += 1;
    lastNearMs = simTimeMs;
    points += 30 * multiplierAt(simTimeMs);
    if (streak >= 3) {
      multiUntilMs = simTimeMs + 2000;
      streak = 0;
    }
    return true;
  }

  function snapshot(simTimeMs) {
    return {
      score: Math.floor(points + 1e-6),
      surviveSec: simTimeMs / 1000,
      multiplier: multiplierAt(simTimeMs),
      streak: streak
    };
  }

  return {
    tick: tick,
    nearMiss: nearMiss,
    snapshot: snapshot,
    multiplierAt: multiplierAt
  };
}

module.exports = { createScore: createScore };
