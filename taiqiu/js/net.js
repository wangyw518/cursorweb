/**
 * Compatibility facade over js/roomApi.js.
 * New code should call TaiqiuRoomApi directly.
 * roomApiBase empty → LocalMockRoom; if set → POST/GET /room/*.
 */
(function (root, factory) {
  var roomApi = typeof require === 'function' ? require('./roomApi') : root.TaiqiuRoomApi;
  var api = factory(roomApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (roomApi) {
  'use strict';

  function configure(opts) {
    return roomApi.configure(opts || {});
  }

  function createRoom(payload, cb) {
    return roomApi.create(payload, cb);
  }

  function joinRoom(roomId, cb) {
    return roomApi.join(roomId, cb);
  }

  function shot(roomId, payload, cb) {
    return roomApi.shot(roomId, payload, cb);
  }

  function aim(roomId, payload, cb) {
    return roomApi.aim(roomId, payload, cb);
  }

  function state(roomId, cb) {
    return roomApi.state(roomId, cb);
  }

  function pushState(roomId, patch) {
    patch = patch || {};
    return shot(roomId, {
      fromSeat: patch.fromSeat != null ? patch.fromSeat : 0,
      role: patch.role,
      token: patch.token,
      reason: patch.reason || 'sync',
      ballsSnapshot: patch.ballsSnapshot || patch.balls,
      balls: patch.balls,
      scores: patch.scores,
      turn: patch.turn,
      phase: patch.phase,
      targetN: patch.targetN,
      matchOver: patch.matchOver,
      winner: patch.winner,
      guestJoined: patch.guestJoined
    });
  }

  function pullState(roomId) {
    var res = state(roomId);
    return res && res.state ? res.state : null;
  }

  function resetMemory() {
    roomApi.resetMemory();
  }

  function initCloud(env) {
    if (!env) return false;
    roomApi.configure({ cloudEnv: env });
    try {
      if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.init) {
        wx.cloud.init({ env: env, traceUser: true });
        return true;
      }
    } catch (err) {}
    return false;
  }

  return {
    PREFIX: roomApi.PREFIX,
    configure: configure,
    initCloud: initCloud,
    createRoom: createRoom,
    joinRoom: joinRoom,
    shot: shot,
    aim: aim,
    state: state,
    pushState: pushState,
    pullState: pullState,
    snapshotBalls: roomApi.snapshotBalls,
    applyBalls: roomApi.applyBalls,
    resetMemory: resetMemory,
    store: roomApi.mock && roomApi.mock.store,
    configOf: function () { return roomApi.configOf(); }
  };
});
