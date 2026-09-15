/**
 * Scoring (near-miss, survive bonus, etc.) arrives in M1.
 * M0 always reports 0.
 */
function createScore() {
  return {
    value: 0,
    add: function () {},
    addNearMiss: function () {},
    reset: function () {
      this.value = 0;
    },
    get: function () {
      return 0;
    }
  };
}

module.exports = {
  createScore
};
