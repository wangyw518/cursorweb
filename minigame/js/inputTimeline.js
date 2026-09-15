/**
 * Records local jump/dash timestamps for future ghost recording (M1).
 * quietMs is accepted but ignored until ghost spawn rules land.
 */
function createInputTimeline() {
  const events = [];

  return {
    record: function (t, type) {
      events.push({ t: t, type: type });
    },
    getEvents: function () {
      return events.slice();
    },
    clear: function () {
      events.length = 0;
    },
    // Placeholder for M1: gaps of quietMs will gate ghost emission.
    shouldEmitGhost: function (/* now, quietMs */) {
      return false;
    }
  };
}

module.exports = {
  createInputTimeline
};
