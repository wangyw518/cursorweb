/**
 * Minimal WeChat 2P room stub.
 * Memory + wx.storage, with optional wx.cloud collection `taiqiu_rooms`.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PREFIX = 'taiqiu.room.';
  var memory = {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function randomId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = '';
    var i;
    for (i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  function writeCloud(roomId, state) {
    try {
      if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.database === 'function') {
        wx.cloud.database().collection('taiqiu_rooms').doc(roomId).set({ data: state });
      }
    } catch (err) {}
  }

  function write(roomId, state) {
    memory[roomId] = clone(state);
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(PREFIX + roomId, memory[roomId]);
      }
    } catch (err) {}
    writeCloud(roomId, memory[roomId]);
    return clone(memory[roomId]);
  }

  function read(roomId) {
    if (!roomId) return null;
    if (memory[roomId]) return clone(memory[roomId]);
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        var stored = wx.getStorageSync(PREFIX + roomId);
        if (stored) {
          memory[roomId] = stored;
          return clone(stored);
        }
      }
    } catch (err) {}
    return null;
  }

  function snapshotBalls(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      out.push({
        id: b.id,
        n: b.n,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        pocketed: !!b.pocketed
      });
    }
    return out;
  }

  function applyBalls(list, snap) {
    if (!snap || !list) return list;
    var map = {};
    var i;
    for (i = 0; i < snap.length; i++) map[snap[i].id] = snap[i];
    for (i = 0; i < list.length; i++) {
      var s = map[list[i].id];
      if (!s) continue;
      list[i].x = s.x;
      list[i].y = s.y;
      list[i].vx = s.vx;
      list[i].vy = s.vy;
      list[i].pocketed = !!s.pocketed;
    }
    return list;
  }

  function createRoom() {
    var roomId = randomId();
    var state = {
      roomId: roomId,
      hostSeat: 0,
      guestJoined: false,
      turn: 0,
      seq: 0,
      balls: null,
      phase: 'Aim',
      scores: [0, 0],
      winner: null,
      targetN: 1,
      matchOver: false
    };
    write(roomId, state);
    return { ok: true, roomId: roomId, seat: 0, state: clone(state) };
  }

  function joinRoom(roomId) {
    var state = read(roomId);
    if (!state) return { ok: false, reason: 'missing', roomId: roomId };
    state.guestJoined = true;
    write(roomId, state);
    return { ok: true, roomId: roomId, seat: 1, state: clone(state) };
  }

  function pushState(roomId, patch) {
    var state = read(roomId) || { roomId: roomId, seq: 0 };
    var key;
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) state[key] = patch[key];
    }
    state.seq = (state.seq || 0) + 1;
    return write(roomId, state);
  }

  function pullState(roomId) {
    return read(roomId);
  }

  function resetMemory() {
    memory = {};
  }

  return {
    PREFIX: PREFIX,
    randomId: randomId,
    createRoom: createRoom,
    joinRoom: joinRoom,
    pushState: pushState,
    pullState: pullState,
    snapshotBalls: snapshotBalls,
    applyBalls: applyBalls,
    resetMemory: resetMemory
  };
});
