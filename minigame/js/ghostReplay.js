function stepsFromMs(ms, fixedDt) {
  return Math.round(ms / (fixedDt * 1000));
}

function createGhostSystem(config, deps) {
  var ghosts = [];
  var nextId = 1;
  var delaySteps = stepsFromMs(config.ghostDelayMs, config.fixedDt);
  var ttlSteps = stepsFromMs(config.ghostTtlMs, config.fixedDt);
  var quietSteps = stepsFromMs(config.quietMs, config.fixedDt);
  var graceSteps = Math.round(0.18 / config.fixedDt);

  function replayBefore(step, timeline, terrain) {
    var body = deps.createBody(config);
    for (var s = 0; s < step; s++) {
      deps.stepBody(body, timeline.commandAt(s), terrain, config, config.fixedDt);
    }
    return body;
  }

  function spawn(event, timeline, terrain) {
    var body = replayBefore(event.step, timeline, terrain);
    ghosts.push({
      id: nextId++,
      bornStep: event.step,
      simStep: event.step,
      collideAfterStep: event.step + delaySteps + graceSteps,
      body: body
    });
    while (ghosts.length > config.ghostCap) ghosts.shift();
  }

  function sync(completedPlayerStep, timeline, terrain) {
    var events = timeline.events;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.spawned) continue;
      if (ev.step < quietSteps) {
        ev.spawned = true;
        continue;
      }
      if (completedPlayerStep >= ev.step + delaySteps + 1) {
        ev.spawned = true;
        spawn(ev, timeline, terrain);
      }
    }

    for (var g = 0; g < ghosts.length; g++) {
      var ghost = ghosts[g];
      var cmd = timeline.commandAt(ghost.simStep);
      deps.stepBody(ghost.body, cmd, terrain, config, config.fixedDt);
      ghost.simStep += 1;
    }

    var keep = [];
    for (var k = 0; k < ghosts.length; k++) {
      var age = completedPlayerStep - ghosts[k].bornStep;
      if (age < delaySteps + ttlSteps) keep.push(ghosts[k]);
    }
    ghosts = keep;
  }

  function list() {
    return ghosts;
  }

  function reset() {
    ghosts = [];
    nextId = 1;
  }

  return {
    delaySteps: delaySteps,
    ttlSteps: ttlSteps,
    quietSteps: quietSteps,
    sync: sync,
    list: list,
    reset: reset,
    replayBefore: replayBefore
  };
}

module.exports = {
  createGhostSystem: createGhostSystem,
  stepsFromMs: stepsFromMs
};
