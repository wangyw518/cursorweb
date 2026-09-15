function createTimeline() {
  const events = [];

  function push(step, type) {
    events.push({ step: step, type: type, spawned: false });
    return events[events.length - 1];
  }

  function commandAt(step) {
    const cmd = { jump: false, dash: false };
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.step === step) {
        if (ev.type === 'jump') cmd.jump = true;
        if (ev.type === 'dash') cmd.dash = true;
      }
    }
    return cmd;
  }

  function reset() {
    events.length = 0;
  }

  return {
    events: events,
    push: push,
    commandAt: commandAt,
    reset: reset
  };
}

module.exports = { createTimeline: createTimeline };
