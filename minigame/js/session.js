function makeSeed() {
  var t = Date.now() & 0x7fffffff;
  var r = Math.floor(Math.random() * 0x7fffffff);
  return (t ^ r ^ (t << 7)) >>> 0;
}

function createSession(seed) {
  return {
    seed: typeof seed === 'number' ? seed >>> 0 : makeSeed(),
    simStep: 0,
    simTimeMs: 0,
    alive: true,
    deathReason: null,
    settle: null
  };
}

function kill(session, reason, scoreSnap, highScore) {
  session.alive = false;
  session.deathReason = reason;
  var score = scoreSnap.score;
  var isRecord = score > highScore;
  session.settle = {
    score: score,
    surviveSec: scoreSnap.surviveSec,
    isRecord: isRecord,
    gap: isRecord ? 0 : highScore - score,
    highScore: isRecord ? score : highScore,
    reason: reason
  };
}

module.exports = {
  makeSeed: makeSeed,
  createSession: createSession,
  kill: kill
};
