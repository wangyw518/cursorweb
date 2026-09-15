/**
 * Ghost replay is out of scope for M0.
 * M1 will spawn delayed copies of prior input timelines.
 */
function createGhostReplay() {
  return {
    ghosts: [],
    update: function () {},
    draw: function () {},
    spawn: function () {},
    reset: function () {
      this.ghosts.length = 0;
    },
    list: function () {
      return [];
    }
  };
}

module.exports = {
  createGhostReplay
};
