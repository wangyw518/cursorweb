var { setLastSeed } = require('./storage');

function generateSeed() {
  const timeBits = Date.now() & 0xffffffff;
  const randBits = Math.floor(Math.random() * 0x100000000);
  return (timeBits ^ randBits) >>> 0;
}

function createSession(seed) {
  const resolved = seed == null ? generateSeed() : (seed >>> 0);
  setLastSeed(resolved);
  return {
    seed: resolved,
    startedAtMs: Date.now()
  };
}

function restartSession() {
  return createSession();
}

module.exports = {
  generateSeed,
  createSession,
  restartSession
};
