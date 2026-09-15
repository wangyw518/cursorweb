/**
 * Session-time jump/dash log: { t, type }.
 * quietMs gates ghost eligibility only; play is always allowed.
 */
function quietSec(quietMs) {
  return (quietMs == null ? 0 : quietMs) / 1000;
}

function isEligible(t, quietMs) {
  return t >= quietSec(quietMs);
}

function createInputTimeline() {
  var events = [];

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
    isEligible: function (t, quietMs) {
      return isEligible(t, quietMs);
    },
    shouldEmitGhost: function (t, quietMs) {
      return isEligible(t, quietMs);
    }
  };
}

module.exports = {
  createInputTimeline,
  isEligible,
  quietSec
};
