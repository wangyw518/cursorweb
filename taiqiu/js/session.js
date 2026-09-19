(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./physics') : root.TaiqiuPhysics,
    typeof require === 'function' ? require('./table') : root.TaiqiuTable,
    typeof require === 'function' ? require('./fsm') : root.TaiqiuFsm,
    typeof require === 'function' ? require('./tiles') : root.TaiqiuTiles,
    typeof require === 'function' ? require('./balls') : root.TaiqiuBalls,
    typeof require === 'function' ? require('./cue') : root.TaiqiuCue,
    typeof require === 'function' ? require('./stopDetect') : root.TaiqiuStopDetect,
    typeof require === 'function' ? require('./score') : root.TaiqiuScore,
    typeof require === 'function' ? require('./hud') : root.TaiqiuHud,
    typeof require === 'function' ? require('./fx') : root.TaiqiuFx,
    typeof require === 'function' ? require('./storage') : root.TaiqiuStorage,
    typeof require === 'function' ? require('./share') : root.TaiqiuShare,
    typeof require === 'function' ? require('./sfx') : root.TaiqiuSfx,
    typeof require === 'function' ? require('./ai') : root.TaiqiuAi,
    typeof require === 'function' ? require('./render') : root.TaiqiuRender,
    typeof require === 'function' ? require('./roomApi') : (root.TaiqiuRoomApi || root.TaiqiuNet)
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaiqiuSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  physics,
  table,
  fsm,
  tiles,
  balls,
  cue,
  stopDetect,
  score,
  hud,
  fx,
  storage,
  share,
  sfx,
  ai,
  render,
  roomApi
) {
  'use strict';

  function persist(session) {
    storage.save({
      best: session.best,
      skinProgress: session.skinProgress,
      bgm: session.bgm !== false,
      displayName: session.displayName || ''
    });
  }

  var AIM_SYNC_MAX_MS = 100;
  var AIM_SYNC_DEFAULT_MS = 80;
  var REMOTE_REPLAY_MAX_MS = 4500;

  function seatFallback(seat) {
    return seat === 1 ? '好友' : '房主';
  }

  function isGenericRoleName(raw) {
    if (hud && hud.isGenericRoleName) return hud.isGenericRoleName(raw);
    var s = String(raw || '').trim();
    return !s || s === '房主' || s === '好友' || s === 'P1' || s === 'P2';
  }

  function aiLabel(session) {
    var extra = session && session.config && session.config.ai;
    return (extra && extra.label) || (ai && ai.LABEL) || '简单AI';
  }

  function isLocalAi(session) {
    return !!(session && (session.localAi || session.mode === 'ai'));
  }

  function needsShotClock(session) {
    if (!session || !session.versus) return false;
    if (isLocalAi(session)) return true;
    return !!(session.room && session.room.guestJoined);
  }

  function applyLocalName(session, raw) {
    var name = String(raw || '').trim();
    if (!name || isGenericRoleName(name)) return session;
    session.displayName = name;
    session.names = session.names || [seatFallback(0), seatFallback(1)];
    session.names[session.mySeat || 0] = name;
    session.nicknames = session.nicknames || { host: session.names[0], guest: session.names[1] };
    if ((session.mySeat || 0) === 1) session.nicknames.guest = name;
    else session.nicknames.host = name;
    persist(session);
    if (session.room && session.room.roomId) pushNames(session);
    return session;
  }

  function fetchNick(session) {
    var room = (session.config && session.config.room) || {};
    var hint = session.displayName ||
      (session.mySeat === 1 ? (room.guestDisplayName || room.displayName) : room.displayName) ||
      '';
    if (hint && !isGenericRoleName(hint)) applyLocalName(session, hint);
    function fromInfo(info) {
      var nick = info && (info.nickName || (info.userInfo && info.userInfo.nickName));
      if (nick) applyLocalName(session, nick);
      var openId = info && (info.openId || info.openid);
      if (openId) session.myOpenId = openId;
    }
    try {
      if (typeof wx === 'undefined') return session;
      if (wx.getStorageSync) {
        try {
          var cached = wx.getStorageSync('taiqiu.userInfo') || wx.getStorageSync('userInfo');
          if (cached) {
            if (typeof cached === 'string') cached = JSON.parse(cached);
            fromInfo(cached);
          }
        } catch (errCache) {}
      }
      if (wx.getUserProfile) {
        wx.getUserProfile({
          desc: '用于对局显示昵称',
          success: function (res) {
            fromInfo(res.userInfo || res);
            try {
              if (wx.setStorageSync) wx.setStorageSync('taiqiu.userInfo', res.userInfo || res);
            } catch (errStore) {}
          },
          fail: function () {
            if (wx.getUserInfo) wx.getUserInfo({ success: function (res) { fromInfo(res.userInfo || res); } });
          }
        });
        return session;
      }
      if (wx.getUserInfo) {
        wx.getUserInfo({
          success: function (res) { fromInfo(res.userInfo || res); }
        });
      }
    } catch (err) {}
    return session;
  }

  function compactPreview(preview) {
    if (!preview || !preview.points || !preview.points.length) {
      return preview && preview.ghost ? { points: [], ghost: preview.ghost, bounces: 0 } : null;
    }
    var pts = preview.points;
    var step = pts.length > 14 ? 2 : 1;
    var out = [];
    var i;
    for (i = 0; i < pts.length; i += step) {
      out.push({
        x: Math.round(pts[i].x * 10) / 10,
        y: Math.round(pts[i].y * 10) / 10
      });
    }
    return {
      points: out,
      ghost: preview.ghost || null,
      bounces: preview.bounces || 0
    };
  }

  function aimTimeoutMs(session) {
    var cfg = session.config || {};
    var sec = cfg.shotClockSec || cfg.aimTimeoutSec;
    if (!(sec > 0)) sec = 20;
    return Math.round(sec * 1000);
  }

  function aimSyncMs(session) {
    var cfg = (roomApi.configOf && roomApi.configOf()) || {};
    var room = (session && session.config && session.config.room) || {};
    var ms = cfg.aimPollMs || room.aimPollMs || AIM_SYNC_DEFAULT_MS;
    if (!(ms > 0)) ms = AIM_SYNC_DEFAULT_MS;
    if (ms > AIM_SYNC_MAX_MS) ms = AIM_SYNC_MAX_MS;
    return ms;
  }

  function aimPollSec(session) {
    return aimSyncMs(session) / 1000;
  }

  function lerpNum(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function lerpPoints(a, b, t) {
    if (!b || !b.length) return a ? a.slice() : [];
    if (!a || !a.length) return b.slice();
    var n = Math.max(a.length, b.length);
    var out = [];
    var i;
    for (i = 0; i < n; i++) {
      var pa = a[Math.min(i, a.length - 1)];
      var pb = b[Math.min(i, b.length - 1)];
      out.push({
        x: lerpNum(pa.x, pb.x, t),
        y: lerpNum(pa.y, pb.y, t)
      });
    }
    return out;
  }

  function aimPoseOf(aim) {
    if (!aim) return null;
    var ang = aim.aimAngle != null ? aim.aimAngle : (aim.angle != null ? aim.angle : Math.atan2(aim.ay || -1, aim.ax || 0));
    var ax = aim.ax != null ? aim.ax : Math.cos(ang);
    var ay = aim.ay != null ? aim.ay : Math.sin(ang);
    var pts = [];
    if (aim.preview && aim.preview.points) pts = aim.preview.points;
    else if (aim.aimLine && aim.aimLine.length) pts = aim.aimLine;
    return {
      angle: ang,
      ax: ax,
      ay: ay,
      power: aim.power || 0,
      points: pts,
      ghost: (aim.preview && aim.preview.ghost) || aim.ghost || null,
      kind: aim.kind || 'aim',
      fromSeat: aim.fromSeat
    };
  }

  function applyAimVisual(session, pose) {
    if (!pose) {
      session.remoteAimVisual = null;
      return null;
    }
    session.remoteAimVisual = {
      aimAngle: pose.angle,
      angle: pose.angle,
      ax: pose.ax,
      ay: pose.ay,
      power: pose.power,
      kind: pose.kind,
      fromSeat: pose.fromSeat,
      preview: { points: pose.points || [], ghost: pose.ghost || null },
      aimLine: pose.points || []
    };
    return session.remoteAimVisual;
  }

  function queueRemoteAim(session, aim) {
    if (!aim) return null;
    var to = aimPoseOf(aim);
    var now = Date.now();
    var from = session.remoteAimVisual
      ? aimPoseOf(session.remoteAimVisual)
      : ((session.remoteAimInterp && session.remoteAimInterp.to) || to);
    var dur = aimSyncMs(session);
    if (session.remoteAimInterp && session.remoteAimInterp.at) {
      var gap = now - session.remoteAimInterp.at;
      if (gap > 30 && gap < 180) dur = gap;
    }
    session.remoteAim = aim;
    session.remoteAimInterp = { from: from, to: to, at: now, dur: dur };
    if (aim.kind === 'firing') applyAimVisual(session, to);
    return session.remoteAimInterp;
  }

  function stepRemoteAim(session) {
    var interp = session.remoteAimInterp;
    if (!interp || !interp.to) {
      if (session.remoteAim) applyAimVisual(session, aimPoseOf(session.remoteAim));
      return session.remoteAimVisual;
    }
    if (interp.to.kind === 'firing') {
      applyAimVisual(session, interp.to);
      return session.remoteAimVisual;
    }
    var u = interp.dur > 0 ? (Date.now() - interp.at) / interp.dur : 1;
    if (u < 0) u = 0;
    if (u > 1) u = 1;
    var from = interp.from || interp.to;
    var to = interp.to;
    var pose = {
      angle: lerpAngle(from.angle, to.angle, u),
      power: lerpNum(from.power || 0, to.power || 0, u),
      points: lerpPoints(from.points, to.points, u),
      ghost: to.ghost || from.ghost,
      kind: to.kind,
      fromSeat: to.fromSeat
    };
    pose.ax = Math.cos(pose.angle);
    pose.ay = Math.sin(pose.angle);
    applyAimVisual(session, pose);
    return session.remoteAimVisual;
  }

  function firingImpulse(src) {
    if (!src) return null;
    var aim = src.aim && (src.aim.kind === 'firing' || (src.aim.power > 0.03 && src.phase === fsm.PHASE.Shot))
      ? src.aim
      : null;
    var raw = aim || src.impulse || null;
    if (!raw && src.lastShot && (src.lastShot.kind === 'firing' || src.lastShot.power > 0.03) &&
        (src.phase === 'rolling' || src.phase === 'Shot') &&
        src.lastReason !== 'timeout' && src.lastReason !== 'new-game') {
      raw = src.lastShot;
    }
    if (!raw && src.kind === 'firing') raw = src;
    if (!raw) return null;
    var ang = raw.aimAngle != null ? raw.aimAngle : raw.angle;
    var ax = raw.ax;
    var ay = raw.ay;
    if ((ax == null || ay == null) && ang != null) {
      ax = Math.cos(ang);
      ay = Math.sin(ang);
    }
    var power = raw.power;
    if (!(power > 0.03) || ax == null || ay == null) {
      if ((src.phase === 'rolling' || src.phase === 'Shot') && src.power > 0.03) {
        raw = src;
        ang = src.angle != null ? src.angle : src.aimAngle;
        power = src.power;
        ax = src.ax != null ? src.ax : (ang != null ? Math.cos(ang) : null);
        ay = src.ay != null ? src.ay : (ang != null ? Math.sin(ang) : null);
      }
      if (!(power > 0.03) || ax == null || ay == null) return null;
    }
    return {
      angle: ang != null ? ang : Math.atan2(ay, ax),
      ax: ax,
      ay: ay,
      power: power,
      spin: raw.spin || src.spin || 0,
      fromSeat: raw.fromSeat != null ? raw.fromSeat : src.fromSeat,
      shotSeq: raw.shotSeq != null ? raw.shotSeq : src.shotSeq
    };
  }

  function ballWorldPos(row, felt) {
    if (felt && felt.w && row && row.nx != null && row.ny != null) {
      return { x: felt.x + row.nx * felt.w, y: felt.y + row.ny * felt.h };
    }
    return { x: row && row.x, y: row && row.y };
  }

  function maxBallDrift(list, snap, felt) {
    if (!list || !snap) return 0;
    var map = {};
    var i;
    for (i = 0; i < snap.length; i++) map[snap[i].id] = snap[i];
    var max = 0;
    for (i = 0; i < list.length; i++) {
      var s = map[list[i].id];
      if (!s) continue;
      var p = ballWorldPos(s, felt);
      if (p.x == null || p.y == null) continue;
      var d = Math.hypot(list[i].x - p.x, list[i].y - p.y);
      if (d > max) max = d;
    }
    return max;
  }

  function softCorrectBalls(session, snap, felt) {
    if (!snap || !session.balls) return 0;
    var drift = maxBallDrift(session.balls, snap, felt);
    if (drift > 18) {
      roomApi.applyBalls(session.balls, snap, felt);
    } else {
      var map = {};
      var i;
      for (i = 0; i < snap.length; i++) map[snap[i].id] = snap[i];
      for (i = 0; i < session.balls.length; i++) {
        var s = map[session.balls[i].id];
        if (!s) continue;
        var p = ballWorldPos(s, felt);
        if (p.x == null || p.y == null) continue;
        session.balls[i].x += (p.x - session.balls[i].x) * 0.45;
        session.balls[i].y += (p.y - session.balls[i].y) * 0.45;
        session.balls[i].vx = 0;
        session.balls[i].vy = 0;
        session.balls[i].pocketed = !!s.pocketed;
      }
    }
    lockObjectBalls(session);
    return drift;
  }

  function isFullBallSnap(snap) {
    if (!snap || !snap.length) return false;
    var n = 0;
    var i;
    for (i = 0; i < snap.length; i++) {
      if (snap[i] && snap[i].id !== 'cue' && snap[i].n !== 0) n += 1;
    }
    return n >= 1;
  }

  function mergeIncomingNames(session, state) {
    var incoming = null;
    if (state && state.nicknames) {
      incoming = [
        state.nicknames.host || state.nicknames[0],
        state.nicknames.guest || state.nicknames[1]
      ];
    } else if (state && state.names) incoming = state.names.slice();
    if (!incoming) return session;
    session.names = session.names || [seatFallback(0), seatFallback(1)];
    var mine = session.mySeat || 0;
    var opp = mine === 1 ? 0 : 1;
    if (session.displayName && !isGenericRoleName(session.displayName)) {
      session.names[mine] = session.displayName;
    } else if (!isGenericRoleName(incoming[mine])) {
      session.names[mine] = incoming[mine];
    }
    if (!isGenericRoleName(incoming[opp])) {
      session.names[opp] = incoming[opp];
    } else if (isGenericRoleName(session.names[opp])) {
      session.names[opp] = incoming[opp] || session.names[opp];
    }
    session.nicknames = { host: session.names[0], guest: session.names[1] };
    return session;
  }

  function mergeRoomMeta(session, state) {
    if (!state) return session;
    if (state.stars) {
      session.roomStars = {
        host: state.stars.host != null ? state.stars.host : (state.stars[0] || 0),
        guest: state.stars.guest != null ? state.stars.guest : (state.stars[1] || 0)
      };
      session.scores = [session.roomStars.host, session.roomStars.guest];
    }
    mergeIncomingNames(session, state);
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    if (state.hostOpenId && session.room) session.room.hostOpenId = state.hostOpenId;
    if (state.guestOpenId && session.room) session.room.guestOpenId = state.guestOpenId;
    return session;
  }

  function beginRemoteReplay(session, src) {
    if (!session || session.remoteReplay) return null;
    if (session.phase !== fsm.PHASE.Aim && session.phase !== 'Pull') return null;
    var impulse = firingImpulse(src) || firingImpulse(session.remoteAim);
    if (!impulse) return null;
    if (impulse.fromSeat != null && impulse.fromSeat === session.mySeat) return null;
    var cueBall = findCue(session);
    if (!cueBall || cueBall.pocketed) return null;
    guardObjectBalls(session);
    var struck = cue.strike(cueBall, {
      ax: impulse.ax,
      ay: impulse.ay,
      angle: impulse.angle,
      power: impulse.power,
      fired: true
    }, session.config);
    if (!struck || !struck.fired) return null;
    session.remoteReplay = {
      fromSeat: impulse.fromSeat,
      startedAt: Date.now(),
      angle: struck.angle,
      power: struck.power,
      stopped: false
    };
    session.phase = fsm.PHASE.Shot;
    session.remoteBusy = 'firing';
    session.shot = emptyShot();
    if (session.target) session.shot.targetId = session.target.id;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (session.cue) {
      session.cue.dragging = false;
      session.cue.power = 0;
    }
    if (sfx && sfx.cue) sfx.cue();
    return session.remoteReplay;
  }

  function finishRemoteReplay(session) {
    var pending = session.pendingRoomState;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.remoteBusy = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    balls.haltBalls(session.balls);
    if (pending) {
      applyRoomState(session, pending, {
        forceBalls: isFullBallSnap(pending.ballsSnapshot || pending.balls),
        softCorrect: isFullBallSnap(pending.ballsSnapshot || pending.balls)
      });
    } else if (session.phase === fsm.PHASE.Shot) {
      session.phase = fsm.PHASE.Aim;
      guardObjectBalls(session);
    }
    return session;
  }

  function maybeFinishRemoteReplay(session) {
    if (!session.remoteReplay) return session;
    var pending = session.pendingRoomState;
    var age = Date.now() - (session.remoteReplay.startedAt || 0);
    var settled = !!(pending && (
      isAuthoritativeBalls(session, pending) ||
      pending.matchOver ||
      pending.phase === fsm.PHASE.Settle
    ));
    if (!settled) return session;
    if (session.remoteReplay.stopped || pending.matchOver || pending.phase === fsm.PHASE.Settle ||
        age > REMOTE_REPLAY_MAX_MS) {
      finishRemoteReplay(session);
    }
    return session;
  }

  function shouldStartRemoteReplay(session, state) {
    if (!session || !state || session.remoteReplay) return false;
    if (session.phase !== fsm.PHASE.Aim && session.phase !== 'Pull') return false;
    if (!session.versus || session.turn === session.mySeat) return false;
    if (state.lastReason === 'timeout' || state.lastReason === 'new-game') return false;
    var incoming = incomingShotSeq(state);
    var last = session.room && session.room.lastSeq != null ? session.room.lastSeq : -1;
    var live = state.phase === 'rolling' || state.phase === fsm.PHASE.Shot;
    if (!live && incoming != null && incoming <= last) return false;
    var impulse = firingImpulse(state);
    if (!impulse || impulse.fromSeat === session.mySeat) return false;
    if (live) return true;
    if (state.impulse && state.impulse.kind === 'firing') return true;
    if (state.aim && state.aim.kind === 'firing') return true;
    return false;
  }

  function queuePendingSettle(session, state) {
    if (!state) return session;
    var incoming = incomingShotSeq(state);
    var last = session.room && session.room.lastSeq != null ? session.room.lastSeq : -1;
    if (state.matchOver || state.phase === fsm.PHASE.Settle ||
        (incoming != null && incoming > last && isFullBallSnap(state.ballsSnapshot || state.balls))) {
      session.pendingRoomState = state;
    }
    return session;
  }

  function tickRoomSync(session, dt) {
    if (!session.room) return;
    session.syncAcc += dt;
    var watching = session.versus && (!canAim(session) || session.remoteReplay);
    var pollSec = watching
      ? aimPollSec(session)
      : ((roomApi.configOf && roomApi.configOf().pollMs) || 450) / 1000;
    if (watching) pollSec = Math.min(pollSec, AIM_SYNC_MAX_MS / 1000);
    if (session.syncAcc > pollSec) {
      session.syncAcc = 0;
      pullRoom(session);
      if (session.phase === fsm.PHASE.Aim) guardObjectBalls(session);
    }
    if (canAim(session) && session.cue && session.cue.dragging) {
      var gap = aimSyncMs(session);
      if (Date.now() - (session.lastAimPush || 0) >= gap) {
        pushAim(session, { kind: 'charging' });
      }
    }
  }

  function pushNames(session) {
    if (!session.room || !session.room.roomId) return null;
    if (!session.displayName || isGenericRoleName(session.displayName)) return null;
    return roomApi.aim(session.room.roomId, {
      roomId: session.room.roomId,
      fromSeat: session.mySeat,
      role: session.mySeat === 1 ? 'guest' : 'host',
      token: session.room.token,
      openId: session.myOpenId || '',
      kind: 'name',
      nick: session.displayName,
      displayName: session.displayName,
      name: session.displayName,
      names: session.names,
      nicknames: session.nicknames
    });
  }

  function ensureBgm(session) {
    if (!sfx) return session;
    if (session.bgm === false) {
      if (sfx.stopBgm) sfx.stopBgm();
      return session;
    }
    if (sfx.startBgm) sfx.startBgm();
    return session;
  }

  function worldOf(session) {
    return {
      balls: session.balls,
      walls: session.table.walls,
      pockets: session.table.pockets,
      felt: session.table && session.table.felt,
      frozen: session.phase === fsm.PHASE.Aim,
      lockObjects: session.phase === fsm.PHASE.Shot && !session.shot.firstContactId
    };
  }

  function dragBounds(session) {
    var v = session.viewport || {};
    return {
      x: 0,
      y: 0,
      w: v.width || 375,
      h: v.height || 667,
      pad: 12,
      safeTop: v.safeTop || 0,
      safeBottom: v.safeBottom || 0,
      safePad: Math.max(28, v.safeTop || 0, v.safeBottom || 0)
    };
  }

  function previewConfigOf(session) {
    var cfg = session.config || {};
    var felt = session.table && session.table.felt;
    var length = cfg.previewLength == null ? 720 : cfg.previewLength;
    var span = cfg.previewTableSpan == null ? 1.25 : cfg.previewTableSpan;
    var frac = cfg.aimLineMinFrac != null ? cfg.aimLineMinFrac : 0.55;
    if (felt && felt.w && felt.h) {
      length = Math.max(length, Math.min(felt.w, felt.h) * frac);
      length = Math.max(length, Math.hypot(felt.w, felt.h) * span);
    }
    var cueBall = session.balls ? balls.cueBall(session.balls) : null;
    if (cueBall && session.target) {
      length = Math.max(length, Math.hypot(session.target.x - cueBall.x, session.target.y - cueBall.y));
    }
    return {
      previewLength: length,
      previewBounces: cfg.previewBounces == null ? 3 : cfg.previewBounces,
      ballRadius: cfg.ballRadius
    };
  }

  function lockObjectBalls(session) {
    session.aimLock = balls.snapshotObjectBalls(session.balls);
    return session.aimLock;
  }

  function guardObjectBalls(session) {
    if (session.phase !== fsm.PHASE.Aim) return session;
    balls.haltBalls(session.balls);
    if (session.aimLock) balls.restoreObjectBalls(session.balls, session.aimLock);
    return session;
  }

  function incomingShotSeq(state) {
    if (!state) return null;
    if (state.shotSeq != null) return state.shotSeq;
    if (state.seq != null) return state.seq;
    return null;
  }

  function isAuthoritativeBalls(session, state, opts) {
    opts = opts || {};
    if (opts.forceBalls || opts.join) return true;
    var incoming = incomingShotSeq(state);
    var last = session.room && session.room.lastSeq != null ? session.room.lastSeq : -1;
    return incoming != null && incoming > last;
  }

  function findCue(session) {
    return balls.cueBall(session.balls);
  }

  function refreshTarget(session) {
    session.target = balls.lowestNumbered(session.balls);
    return session.target;
  }

  function toastOutOfBounds(session, ball) {
    if (!ball || ball.id === 'cue') return;
    var n = ball.n != null ? ball.n : '';
    session.toast = { text: n + '号球出界', life: 1.8 };
  }

  function handleOutOfBounds(session, events) {
    var list = (events && events.outOfBounds) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      var row = list[i];
      var ball = row && row.ball ? row.ball : row;
      if (!ball) continue;
      if (ball.id === 'cue') {
        session.shot.scratch = true;
        if (session.shot.pocketed.indexOf('cue') === -1) session.shot.pocketed.push('cue');
      } else {
        toastOutOfBounds(session, ball);
      }
    }
    if (list.length) refreshTarget(session);
    return session.target;
  }

  function creditSeat(session) {
    if (session.room && session.turnOpenId) {
      if (session.myOpenId && session.turnOpenId === session.myOpenId) {
        return session.mySeat || 0;
      }
      if (session.room.hostOpenId && session.turnOpenId === session.room.hostOpenId) return 0;
      if (session.room.guestOpenId && session.turnOpenId === session.room.guestOpenId) return 1;
    }
    return session.turn;
  }

  function syncRoomStars(session, host, guest) {
    if (host != null || guest != null) {
      session.scores = [host || 0, guest || 0];
    }
    session.roomStars = {
      host: (session.scores && session.scores[0]) || 0,
      guest: (session.scores && session.scores[1]) || 0
    };
    return session.roomStars;
  }

  function resetMatchScores(session) {
    session.scores = [0, 0];
    session.roomStars = { host: 0, guest: 0 };
    session.pocketScore = 0;
    session.zoneBonus = 0;
    return session;
  }

  function emptyShot() {
    return {
      cushions: 0,
      pocketed: [],
      firstContactId: null,
      targetId: null,
      scratch: false,
      pocketedLowest: false,
      pocketedNine: false
    };
  }

  function noteFullPower(session) {
    var full = !!(session.cue && (session.cue.full || session.cue.power >= 0.98));
    if (full && !session.powerWasFull) session.powerFlash = 0.35;
    session.powerWasFull = full;
    return session;
  }

  function refreshPreview(session) {
    var cueBall = findCue(session);
    if (!session.cue.dragging || session.cue.power < 0.04 || !cueBall) {
      session.preview = { points: [], ghost: null, bounces: 0 };
      return session.preview;
    }
    session.preview = physics.preview(
      cueBall,
      session.cue.ax,
      session.cue.ay,
      worldOf(session),
      previewConfigOf(session)
    );
    guardObjectBalls(session);
    return session.preview;
  }

  function eventsFromResolution(session, reason) {
    var events = [];
    var res = session.resolution || {};
    var shot = session.shot || {};
    var i;
    if (shot.pocketed && shot.pocketed.length) {
      for (i = 0; i < shot.pocketed.length; i++) {
        var id = shot.pocketed[i];
        var n = id === 'cue' ? 0 : parseInt(String(id).replace('b', ''), 10);
        events.push({
          type: 'pocket',
          n: n,
          legal: !!(res.legal) && n !== 0
        });
      }
    }
    if (reason === 'nine' || res.win) events.push({ type: 'nine', legal: true });
    else if (reason === 'legal') events.push({ type: 'legal' });
    else if (reason === 'scratch' || shot.scratch) events.push({ type: 'scratch' });
    else if (res.foul) events.push({ type: 'foul', reason: res.reason || reason });
    else if (reason === 'new-game') events.push({ type: 'new-game' });
    else events.push({ type: 'miss' });
    return events;
  }

  function shotPayload(session, reason, fromSeat) {
    var felt = session.table && session.table.felt;
    var snap = roomApi.snapshotBalls(session.balls, felt);
    var seat = fromSeat != null ? fromSeat : session.mySeat;
    var last = session.lastShotInput || {};
    var shotSeq = session.pendingShotSeq != null
      ? session.pendingShotSeq
      : (((session.room && (session.room.lastSeq || 0)) || 0) + 1);
    return {
      roomId: session.room ? session.room.roomId : null,
      shotSeq: shotSeq,
      angle: last.aimAngle,
      aimAngle: last.aimAngle,
      power: last.power,
      ax: last.ax,
      ay: last.ay,
      spin: last.spin,
      events: session.lastShotEvents || eventsFromResolution(session, reason),
      ballsSnapshot: snap,
      fromSeat: seat,
      role: seat === 1 ? 'guest' : 'host',
      token: session.room ? session.room.token : null,
      reason: reason || 'miss',
      balls: snap,
      scores: session.scores.slice(),
      stars: session.roomStars || {
        host: (session.scores && session.scores[0]) || 0,
        guest: (session.scores && session.scores[1]) || 0
      },
      phase: session.phase,
      targetN: session.target ? session.target.n : 0,
      matchOver: !!session.matchOver,
      winner: session.winner,
      guestJoined: !!(session.room && session.room.guestJoined),
      names: session.names ? session.names.slice() : null,
      nicknames: session.names ? { host: session.names[0], guest: session.names[1] } : null,
      openId: session.myOpenId || '',
      winnerOpenId: session.myOpenId || null,
      pocketScore: session.award ? session.award.pocketBonus : 0,
      zoneBonus: session.award ? session.award.landingBonus : 0
    };
  }

  function buildRemoteSettle(session, state) {
    var winner = state && state.winner != null ? state.winner : session.winner;
    var scores = ((state && state.scores) || session.scores || [0, 0]).slice();
    var names = ((state && state.names) || session.names || [seatFallback(0), seatFallback(1)]).slice();
    return {
      coins: 0,
      points: 0,
      unit: '星币',
      reason: 'nine',
      legal: true,
      foul: false,
      win: true,
      versus: true,
      winner: winner,
      winnerOpenId: (state && state.winnerOpenId) || session.winnerOpenId || null,
      stars: (state && state.stars) || session.roomStars || {
        host: scores[0] || 0,
        guest: scores[1] || 0,
        me: scores[session.mySeat || 0] || 0,
        opp: scores[session.mySeat === 1 ? 0 : 1] || 0
      },
      outcome: ((state && state.winnerOpenId && session.myOpenId)
        ? (state.winnerOpenId === session.myOpenId ? 'win' : 'lose')
        : (winner === (session.mySeat || 0) ? 'win' : 'lose')),
      scores: scores,
      names: names,
      starApplied: false,
      pocketBonus: 0,
      landingBonus: 0,
      zoneLabel: '',
      quality: {},
      props: [],
      skinProgress: 0,
      disclaimer: (session.config && session.config.disclaimer) || '',
      gap: 0,
      isNew: false,
      best: session.best
    };
  }

  function applyRoomState(session, state, opts) {
    if (!state) return session;
    opts = opts || {};
    var felt = session.table && session.table.felt;
    var snap = state.ballsSnapshot || state.balls;
    var applyBallsNow = !!snap && (
      session.phase !== fsm.PHASE.Aim || isAuthoritativeBalls(session, state, opts)
    );
    if (state.foulCode === 'shotClock') applyBallsNow = false;
    if (applyBallsNow) {
      if (opts.softCorrect) softCorrectBalls(session, snap, felt);
      else roomApi.applyBalls(session.balls, snap, felt);
      lockObjectBalls(session);
      if (!opts.join && state.lastSeat != null && state.lastSeat !== session.mySeat &&
          (state.pocketScore || state.zoneBonus)) {
        var cueAt = findCue(session);
        spawnScorePops(session, {
          legal: true,
          starApplied: !!(state.zoneBonus),
          pocketScore: state.pocketScore,
          pocketBonus: state.pocketScore,
          zoneBonus: state.zoneBonus,
          landingBonus: state.zoneBonus,
          zoneLabel: '落点'
        }, cueAt ? cueAt.x : 0, cueAt ? cueAt.y : 0);
      }
    }
    if (state.stars) {
      session.roomStars = {
        host: state.stars.host != null ? state.stars.host : (state.stars[0] || 0),
        guest: state.stars.guest != null ? state.stars.guest : (state.stars[1] || 0)
      };
      session.scores = [session.roomStars.host, session.roomStars.guest];
    } else if (state.scores) {
      session.scores = state.scores.slice();
      syncRoomStars(session);
    } else {
      syncRoomStars(session);
    }
    if (state.hostOpenId && session.room) session.room.hostOpenId = state.hostOpenId;
    if (state.guestOpenId && session.room) session.room.guestOpenId = state.guestOpenId;
    if (state.openIds && session.room) {
      if (state.openIds[0]) session.room.hostOpenId = session.room.hostOpenId || state.openIds[0];
      if (state.openIds[1]) session.room.guestOpenId = session.room.guestOpenId || state.openIds[1];
    }
    if (state.turnRole === 'guest') session.turn = 1;
    else if (state.turnRole === 'host') session.turn = 0;
    else if (state.turn != null) session.turn = state.turn;
    if (state.turnOpenId != null) session.turnOpenId = state.turnOpenId;
    session.winner = state.winner;
    session.matchOver = !!state.matchOver;
    mergeIncomingNames(session, state);
    if (state.deadlineAt != null) session.aimDeadlineAt = state.deadlineAt;
    else if (state.aimDeadlineAt != null) session.aimDeadlineAt = state.aimDeadlineAt;
    if (state.winnerOpenId) session.winnerOpenId = state.winnerOpenId;
    if (state.pocketScore != null) session.pocketScore = state.pocketScore;
    if (state.zoneBonus != null) session.zoneBonus = state.zoneBonus;
    if (state.foulCode || state.foulHint) {
      var foulKey = String(state.shotSeq != null ? state.shotSeq : '') + ':' + (state.foulCode || state.foulHint);
      if (session._lastFoulKey !== foulKey) {
        session._lastFoulKey = foulKey;
        session.banner = {
          text: state.foulHint || (state.foulCode === 'shotClock' ? '犯规 · 超时' : '犯规'),
          kind: 'foul',
          code: state.foulCode || '',
          detail: foulPenalty(state.foulCode),
          life: 2.2
        };
        if (sfx && sfx.foul) sfx.foul();
        if (state.foulCode === 'shotClock' && session.cue && session.cue.dragging) {
          cue.cancelDrag(session.cue);
          session.preview = { points: [], ghost: null, bounces: 0 };
        }
      }
    }
    if (session.room) {
      if (state.shotSeq != null) session.room.lastSeq = state.shotSeq;
      else if (state.seq != null) session.room.lastSeq = state.seq;
      if (state.aimSeq != null) session.room.aimSeq = state.aimSeq;
    }
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    if (state.aim && state.aim.fromSeat !== session.mySeat) {
      queueRemoteAim(session, state.aim);
      session.remoteBusy = state.aim.kind === 'firing' ? 'firing' : null;
    } else if (state.impulse && state.impulse.fromSeat !== session.mySeat) {
      queueRemoteAim(session, state.impulse);
      session.remoteBusy = 'firing';
    } else if ((state.phase === fsm.PHASE.Shot || state.phase === 'rolling') && session.turn !== session.mySeat) {
      session.remoteBusy = 'firing';
    } else if (state.aim == null && session.turn === session.mySeat) {
      session.remoteAim = null;
      session.remoteAimVisual = null;
      session.remoteAimInterp = null;
      session.remoteBusy = null;
    }
    if (state.matchOver) {
      session.phase = fsm.PHASE.Settle;
      session.matchOver = true;
      if (!session.settle || !session.settle.win) {
        session.settle = buildRemoteSettle(session, state);
      } else {
        session.settle.scores = (state.scores || session.settle.scores || session.scores).slice();
        if (state.names) session.settle.names = state.names.slice();
        session.settle.winner = state.winner != null ? state.winner : session.settle.winner;
        session.settle.versus = true;
      }
    } else if (state.phase === fsm.PHASE.Aim || state.phase === 'Pull' || state.phase === fsm.PHASE.Settle) {
      session.phase = state.phase === 'Pull' ? fsm.PHASE.Aim : state.phase;
    }
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    if (session.phase === fsm.PHASE.Aim) guardObjectBalls(session);
    return session;
  }

  function ingestState(session, res, opts) {
    var state = res && res.state ? res.state : res;
    if (!state || !state.roomId) return null;
    if (session.remoteReplay) {
      mergeRoomMeta(session, state);
      queuePendingSettle(session, state);
      maybeFinishRemoteReplay(session);
      return state;
    }
    if (session.phase === fsm.PHASE.Shot ||
        session.phase === fsm.PHASE.ResolvePocket ||
        session.phase === fsm.PHASE.WaitCueStop ||
        session.phase === fsm.PHASE.StarZone) {
      if (state.guestJoined && session.room) {
        session.room.guestJoined = true;
        session.hotseat = false;
      }
      return state;
    }
    if (shouldStartRemoteReplay(session, state)) {
      mergeRoomMeta(session, state);
      queuePendingSettle(session, state);
      if (state.aim && state.aim.fromSeat !== session.mySeat) queueRemoteAim(session, state.aim);
      else if (state.impulse) queueRemoteAim(session, state.impulse);
      beginRemoteReplay(session, state);
      return state;
    }
    applyRoomState(session, state, opts);
    return state;
  }

  function shouldSubmitShot(session, fromSeat) {
    if (!session.room || !session.room.roomId) return false;
    if (!session.versus) return false;
    var seat = fromSeat != null ? fromSeat : session.mySeat;
    if (session.hotseat && !(session.room.guestJoined)) return session.mySeat === 0;
    return seat === session.mySeat;
  }

  function pushRoom(session, reason, fromSeat) {
    if (!shouldSubmitShot(session, fromSeat)) return null;
    return roomApi.shot(session.room.roomId, shotPayload(session, reason, fromSeat), function (res) {
      session.pendingShotSeq = null;
      if (res && res.ok && res.state) ingestState(session, res);
    });
  }

  function pullRoom(session, opts) {
    if (!session.room || !session.room.roomId) return null;
    opts = opts || {};
    var sinceSeq = session.room.lastSeq != null ? session.room.lastSeq : 0;
    if (opts.full || (session.remoteReplay && session.remoteReplay.stopped)) sinceSeq = 0;
    return roomApi.state({ roomId: session.room.roomId, sinceSeq: sinceSeq }, function (res) {
      ingestState(session, res);
    });
  }

  function foulPenalty(code) {
    if (code === 'shotClock') return '交换击球权 · 台面保持';
    if (code === 'scratch') return '白球回置 · 交换击球权';
    if (code === 'order' || code === 'whiff') return '交换击球权 · 台面保持';
    if (code) return '交换击球权';
    return '';
  }

  /**
   * Full re-rack. GATED: only 「新开一局 / 再来一局」 / newGame.
   * Miss, foul, and legal 1–8 must never call this.
   */
  function rack(session) {
    session.table = table.layout(session.viewport, session.config, session.ui.playRect);
    session.tiles = tiles.create(session.table, session.config);
    session.balls = balls.create(session.table, session.config);
    session.cue = cue.create(session.config);
    session.stop = stopDetect.create();
    session.phase = fsm.PHASE.Aim;
    session.award = null;
    session.settle = null;
    session.settleIn = 0;
    session.resolution = null;
    session.shot = emptyShot();
    session.particles = [];
    session.landFlash = null;
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.matchOver = false;
    session.winner = null;
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    balls.haltBalls(session.balls);
    lockObjectBalls(session);
    return session;
  }

  function resetRound(session) {
    return rack(session);
  }

  function newGame(session) {
    var mode = session.mode;
    var localAi = isLocalAi(session);
    resetMatchScores(session);
    session.turn = 0;
    session.matchOver = false;
    session.winner = null;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.remoteBusy = null;
    rack(session);
    if (localAi || mode === 'ai') {
      session.mode = 'ai';
      session.versus = true;
      session.localAi = true;
      session.hotseat = false;
      session.room = null;
      session.names = session.names || [session.displayName || '玩家', aiLabel(session)];
      session.names[1] = aiLabel(session);
      armAimClock(session);
      return { kind: 'new-game', mode: 'ai' };
    }
    if (mode === 'practice') {
      session.versus = false;
      session.localAi = false;
      session.aimDeadlineAt = 0;
      return { kind: 'new-game', mode: 'practice' };
    }
    pushRoom(session, 'new-game', session.mySeat || 0);
    return { kind: 'new-game' };
  }

  function create(viewport, config, opts) {
    opts = opts || {};
    if (config && config.room) roomApi.configure(config.room);
    var saved = storage.load();
    var session = {
      viewport: viewport,
      config: config,
      ui: hud.layout(viewport),
      viewMode: 'top',
      aim3d: false,
      toast: null,
      lastShare: null,
      phase: fsm.PHASE.Aim,
      best: saved.best || 0,
      skinProgress: saved.skinProgress || 0,
      award: null,
      settle: null,
      settleIn: 0,
      resolution: null,
      particles: [],
      landFlash: null,
      pressed: null,
      preview: { points: [], ghost: null, bounces: 0 },
      shot: emptyShot(),
      turn: 0,
      versus: false,
      hotseat: true,
      mySeat: 0,
      mode: '',
      localAi: false,
      aiThink: 0,
      aiPlan: null,
      room: null,
      scores: [0, 0],
      roomStars: { host: 0, guest: 0 },
      matchOver: false,
      winner: null,
      syncAcc: 0,
      roomPanel: null,
      names: [
        saved.displayName || (config.room && config.room.displayName) || seatFallback(0),
        (config.room && config.room.guestDisplayName) || seatFallback(1)
      ],
      displayName: saved.displayName || (config.room && config.room.displayName) || '',
      nicknames: {
        host: saved.displayName || (config.room && config.room.displayName) || seatFallback(0),
        guest: (config.room && config.room.guestDisplayName) || seatFallback(1)
      },
      myOpenId: opts.openId || '',
      bgm: saved.bgm !== false && (config.bgm !== false),
      aimDeadlineAt: 0,
      aimSeq: 0,
      remoteAim: null,
      remoteAimVisual: null,
      remoteAimInterp: null,
      remoteReplay: null,
      pendingRoomState: null,
      remoteBusy: null,
      banner: null,
      lastAimPush: 0,
      powerFlash: 0,
      powerWasFull: false,
      turnOpenId: '',
      pocketScore: 0,
      zoneBonus: 0,
      pendingRoomId: '',
      joinError: null,
      inviteAfterCreate: false
    };
    resetRound(session);
    if (opts.openId) session.myOpenId = opts.openId;
    if (opts.nick) applyLocalName(session, opts.nick);
    fetchNick(session);
    if (!opts.skipSplash) session.phase = fsm.PHASE.Splash;
    session.update = function (dt) { update(session, dt); };
    session.render = function (ctx) { render.draw(session, ctx); };
    session.handlePointerDown = function (x, y) { return handlePointerDown(session, x, y); };
    session.handlePointerMove = function (x, y) { return handlePointerMove(session, x, y); };
    session.handlePointerUp = function (x, y) { return handlePointerUp(session, x, y); };
    session.resize = function (next) { resize(session, next); };
    session.restart = function () { return newGame(session); };
    return session;
  }

  function resize(session, viewport) {
    var old = session.table && session.table.felt;
    session.viewport = viewport;
    session.ui = hud.layout(viewport);
    var nextTable = table.layout(session.viewport, session.config, session.ui.playRect);
    if (old && session.balls) {
      var sx = nextTable.felt.w / old.w;
      var sy = nextTable.felt.h / old.h;
      var i;
      for (i = 0; i < session.balls.length; i++) {
        session.balls[i].x = nextTable.felt.x + (session.balls[i].x - old.x) * sx;
        session.balls[i].y = nextTable.felt.y + (session.balls[i].y - old.y) * sy;
      }
    }
    session.table = nextTable;
    session.tiles = tiles.create(session.table, session.config);
    if (session.phase === fsm.PHASE.Aim) lockObjectBalls(session);
  }

  function canAim(session) {
    if (session.phase !== fsm.PHASE.Aim) return false;
    if (session.matchOver) return false;
    if (!session.versus) return true;
    if (isLocalAi(session)) return session.turn === session.mySeat;
    if (session.hotseat && !(session.room && session.room.guestJoined)) return true;
    if (session.turnOpenId && session.myOpenId) return session.turnOpenId === session.myOpenId;
    return session.turn === session.mySeat;
  }

  function beginNextAim(session) {
    session.cue = cue.create(session.config);
    session.stop = stopDetect.create();
    session.settleIn = 0;
    session.shot = emptyShot();
    session.pressed = null;
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.settle = null;
    session.matchOver = false;
    session.remoteAim = null;
    session.remoteBusy = null;
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    session.phase = fsm.PHASE.Aim;
    balls.haltBalls(session.balls);
    lockObjectBalls(session);
    session.aiThink = 0;
    session.aiPlan = null;
    if (needsShotClock(session)) armAimClock(session);
    else session.aimDeadlineAt = 0;
    if (isLocalAi(session) && session.turn !== session.mySeat) scheduleAi(session);
  }

  function armAimClock(session, deadlineAt) {
    if (!needsShotClock(session)) {
      session.aimDeadlineAt = 0;
      return session;
    }
    if (deadlineAt) session.aimDeadlineAt = deadlineAt;
    else if (isLocalAi(session) || !(session.room && session.room.guestJoined)) {
      session.aimDeadlineAt = Date.now() + aimTimeoutMs(session);
    }
    return session;
  }

  function scheduleAi(session) {
    if (!isLocalAi(session) || session.phase !== fsm.PHASE.Aim || session.matchOver) return session;
    if (session.turn === session.mySeat) return session;
    var plan = ai.plan(findCue(session), session.target, session.config);
    session.aiPlan = plan;
    session.aiThink = ai.thinkDelay(null, session.config);
    session.remoteBusy = 'thinking';
    if (plan && plan.ok) {
      session.cue.ax = plan.ax;
      session.cue.ay = plan.ay;
      session.cue.angle = plan.angle;
      session.cue.power = 0;
      session.remoteAim = {
        kind: 'aim',
        aimAngle: plan.angle,
        ax: plan.ax,
        ay: plan.ay,
        power: 0,
        fromSeat: 1
      };
    }
    return session;
  }

  function pushAim(session, extra) {
    extra = extra || {};
    if (!session.room || !session.room.roomId) return null;
    if (!session.versus) return null;
    if (!canAim(session) && extra.kind !== 'firing') return null;
    session.aimSeq = (session.aimSeq || 0) + 1;
    session.lastAimPush = Date.now();
    var ang = extra.aimAngle != null ? extra.aimAngle : (extra.angle != null ? extra.angle : (session.cue ? session.cue.angle : 0));
    var payload = {
      roomId: session.room.roomId,
      shotSeq: session.room.lastSeq || 0,
      angle: extra.angle != null ? extra.angle : ang,
      power: extra.power != null ? extra.power : (session.cue ? session.cue.power : 0),
      aimLine: extra.aimLine || (session.preview && session.preview.points) || [],
      fromSeat: session.mySeat,
      role: session.mySeat === 1 ? 'guest' : 'host',
      token: session.room.token,
      openId: session.myOpenId || '',
      aimSeq: session.aimSeq,
      kind: extra.kind || (session.cue && session.cue.dragging ? 'Pull' : 'aim'),
      aimAngle: extra.aimAngle != null ? extra.aimAngle : ang,
      ax: extra.ax != null ? extra.ax : (session.cue ? session.cue.ax : 0),
      ay: extra.ay != null ? extra.ay : (session.cue ? session.cue.ay : -1),
      preview: extra.preview !== undefined ? extra.preview : compactPreview(session.preview),
      names: session.names
    };
    return roomApi.aim(session.room.roomId, payload, function (res) {
      if (res && res.ok && res.state && res.state.aimSeq != null) {
        session.aimSeq = res.state.aimSeq;
      }
    });
  }

  function pushTimeout(session, opts) {
    opts = opts || {};
    if (!session.room || !session.room.roomId) return null;
    var felt = session.table && session.table.felt;
    var snap = roomApi.snapshotBalls(session.balls, felt);
    return roomApi.shot(session.room.roomId, {
      roomId: session.room.roomId,
      fromSeat: session.mySeat,
      role: session.mySeat === 1 ? 'guest' : 'host',
      token: session.room.token,
      reason: 'timeout',
      events: [{ type: 'timeout' }],
      ballsSnapshot: snap,
      balls: snap,
      scores: session.scores.slice(),
      stars: session.roomStars || {
        host: (session.scores && session.scores[0]) || 0,
        guest: (session.scores && session.scores[1]) || 0
      },
      phase: fsm.PHASE.Aim,
      targetN: session.target ? session.target.n : 0,
      matchOver: false,
      names: session.names,
      nextDeadlineAt: Date.now() + aimTimeoutMs(session)
    }, function (res) {
      if (!res || !res.ok || !res.state) return;
      if (opts.ingest) {
        ingestState(session, res);
        return;
      }
      if (session.room && res.state.shotSeq != null) session.room.lastSeq = res.state.shotSeq;
      if (res.state.names) session.names = res.state.names.slice();
    });
  }

  function timeoutAim(session) {
    if (session.phase !== fsm.PHASE.Aim || session.matchOver) return null;
    if (!session.versus) return null;
    if (!session.aimDeadlineAt || Date.now() < session.aimDeadlineAt) return null;
    if (!needsShotClock(session)) return null;
    if (session.cue && session.cue.dragging) cue.cancelDrag(session.cue);
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.aiThink = 0;
    session.aiPlan = null;
    if (isLocalAi(session)) {
      session.remoteAim = null;
      session.resolution = { legal: false, foul: true, reason: 'timeout', enterStarZone: false, win: false };
      session.lastShotEvents = [{ type: 'timeout' }];
      session.award = score.emptyAward('timeout');
      session.banner = {
        text: '犯规 · 超时',
        kind: 'foul',
        code: 'shotClock',
        detail: foulPenalty('shotClock'),
        life: 2.2
      };
      if (sfx && sfx.foul) sfx.foul();
      if (shouldSwitchTurn(session)) switchTurn(session);
      continueShot(session);
      return { kind: 'timeout', turn: session.turn };
    }
    pullRoom(session);
    return { kind: 'timeout-wait' };
  }

  /**
   * 「再来一杆」 / post-miss continue. Keeps every object-ball position.
   * Only respots the cue on a scratch (kitchen / head spot).
   */
  function continueShot(session) {
    applySpotRules(session);
    beginNextAim(session);
    return session;
  }

  function applySpotRules(session) {
    var resolution = session.resolution || {};
    var nine = balls.findByN(session.balls, 9);
    var cueBall = findCue(session);
    if (nine && nine.pocketed && !resolution.win) {
      balls.spotNine(session.balls, session.table);
    }
    if (cueBall && cueBall.pocketed) {
      balls.respotCue(session.balls, session.table);
    }
  }

  function shouldSwitchTurn(session) {
    if (!session.versus) return false;
    if (session.resolution && session.resolution.legal && !session.resolution.win) return false;
    return true;
  }

  function switchTurn(session) {
    session.turn = session.turn === 0 ? 1 : 0;
    return session.turn;
  }

  function toastFor(session, award) {
    if (award && award.legal && award.reason === 'nine') {
      return { text: '打进9号 · 胜', life: 1.6 };
    }
    if (award && award.legal && award.starApplied && award.zoneLabel) {
      return { text: '落点加成 · ' + award.zoneLabel + ' +' + award.landingBonus + ' 星币', life: 1.6 };
    }
    if (award && award.legal) {
      return { text: '+' + award.coins + ' 星币', life: 1.2 };
    }
    if (award && award.reason === 'scratch') {
      return { text: session.versus ? '犯规 · 白球入袋 · 换人' : '犯规 · 白球入袋', life: 1.8 };
    }
    if (award && award.reason === 'order') {
      return { text: session.versus ? '犯规 · 打错目标球 · 换人' : '犯规 · 打错目标球', life: 1.8 };
    }
    if (award && award.reason === 'whiff') {
      return { text: session.versus ? '犯规 · 未碰目标球 · 换人' : '犯规 · 未碰目标球', life: 1.8 };
    }
    if (award && award.reason === 'timeout') {
      return { text: '超时未击球 · 换人', life: 1.8 };
    }
    if (award && award.foul) {
      return { text: session.versus ? '犯规 · 换人' : '犯规', life: 1.4 };
    }
    return { text: session.versus ? '未进 · 换人' : '未进', life: 1.2 };
  }

  function bannerFor(session, award) {
    if (award && award.foul && sfx && sfx.foul) sfx.foul();
    if (!award) return null;
    if (award.reason === 'scratch') {
      return { text: session.versus ? '犯规 · 白球入袋（刮库）· 换人' : '犯规 · 白球入袋（刮库）', kind: 'foul', code: 'scratch', detail: foulPenalty('scratch'), life: 2.4 };
    }
    if (award.reason === 'order') {
      return { text: session.versus ? '犯规 · 打错目标球 · 换人' : '犯规 · 打错目标球', kind: 'foul', code: 'order', detail: foulPenalty('order'), life: 2.4 };
    }
    if (award.reason === 'whiff') {
      return { text: session.versus ? '犯规 · 未碰目标球 · 换人' : '犯规 · 未碰目标球', kind: 'foul', code: 'whiff', detail: foulPenalty('whiff'), life: 2.4 };
    }
    if (award.reason === 'timeout') {
      return { text: '犯规 · 超时', kind: 'foul', code: 'shotClock', detail: foulPenalty('shotClock'), life: 2.2 };
    }
    if (award.foul) {
      if (sfx && sfx.foul) sfx.foul();
      return { text: session.versus ? '犯规 · 换人' : '犯规', kind: 'foul', life: 2.0 };
    }
    return null;
  }

  function spawnScorePops(session, award, x, y) {
    if (!award || !fx.spawnPop) return;
    var pocket = award.pocketScore != null && award.pocketScore > 0 ? award.pocketScore : award.pocketBonus;
    var zone = award.zoneBonus != null && award.zoneBonus > 0 ? award.zoneBonus : award.landingBonus;
    if (award.legal && pocket) {
      fx.spawnPop(session.particles, x, y - 12, '目标球 +' + pocket, session.config.colors.scorePop);
    }
    if (award.starApplied && zone) {
      fx.spawnPop(
        session.particles,
        x,
        y + 10,
        '落点·' + (award.zoneLabel || '新星') + ' +' + zone,
        session.config.colors.scorePop
      );
    }
  }

  function concludeShot(session, applyStar) {
    var shooter = session.turn;
    var cueBall = findCue(session);
    var landed = null;
    if (applyStar && cueBall && !cueBall.pocketed) {
      landed = tiles.pickAt(session.tiles, cueBall.x, cueBall.y);
    }
    var zone = applyStar && cueBall && !cueBall.pocketed
      ? (landed || tiles.defaultZone())
      : null;
    var award = score.settle({
      pocketedLowest: session.shot.pocketedLowest,
      scratch: session.shot.scratch,
      foul: session.resolution ? session.resolution.foul : session.shot.scratch,
      resolution: session.resolution,
      cushions: session.shot.cushions,
      zone: zone,
      applyStar: !!applyStar,
      firstContactIsTarget: session.shot.firstContactId === session.shot.targetId
    }, session.config);

    session.award = award;
    var gap = score.gapToBest(award.coins, session.best);
    if (gap.isNew) session.best = award.coins;
    persist(session);
    var seat = creditSeat(session);
    if (seat !== 0 && seat !== 1) seat = shooter;
    session.scores[seat] = (session.scores[seat] || 0) + award.coins;
    syncRoomStars(session);
    shooter = seat;

    var burstX = cueBall ? cueBall.x : session.table.felt.cx;
    var burstY = cueBall ? cueBall.y : session.table.felt.cy;
    if (award.legal) {
      fx.spawnBurst(
        session.particles,
        burstX,
        burstY,
        session.config.colors.scorePop,
        8
      );
      spawnScorePops(session, award, burstX, burstY);
    }

    session.landFlash = null;
    if (applyStar && award.legal && !award.foul && landed) {
      session.landFlash = { tileId: landed.id, frames: 1 };
    }

    var win = !!(session.resolution && session.resolution.win);
    session.lastShotEvents = eventsFromResolution(session, win ? 'nine' : (award.reason || (session.resolution && session.resolution.reason) || 'miss'));
    if (win) {
      applySpotRules(session);
      session.matchOver = true;
      session.winner = session.turn;
      session.settle = {
        coins: award.coins,
        points: award.coins,
        unit: award.unit,
        reason: award.reason,
        legal: award.legal,
        foul: award.foul,
        win: true,
        versus: !!session.versus,
        winner: session.winner,
        outcome: session.versus
          ? (session.winner === (session.mySeat || 0) ? 'win' : 'lose')
          : null,
        starApplied: award.starApplied,
        pocketBonus: award.pocketBonus,
        landingBonus: award.landingBonus,
        zoneLabel: award.zoneLabel,
        quality: award.quality,
        props: award.props,
        skinProgress: 0,
        disclaimer: award.disclaimer,
        gap: gap.gap,
        isNew: gap.isNew,
        best: session.best,
        scores: session.scores.slice(),
        stars: session.roomStars || {
          host: (session.scores && session.scores[0]) || 0,
          guest: (session.scores && session.scores[1]) || 0
        },
        names: session.names
          ? session.names.slice()
          : [
            session.displayName || (isLocalAi(session) ? '玩家' : seatFallback(0)),
            isLocalAi(session) ? aiLabel(session) : seatFallback(1)
          ],
        practice: session.mode === 'practice' && !session.versus
      };
      session.phase = fsm.PHASE.Settle;
      session.toast = toastFor(session, award);
      session.banner = bannerFor(session, award);
      pushRoom(session, 'nine', shooter);
      return session.settle;
    }

    // Miss / foul / legal 1–8: continueShot, never rack.
    session.toast = toastFor(session, award);
    session.banner = bannerFor(session, award);
    if (shouldSwitchTurn(session)) switchTurn(session);
    continueShot(session);
    pushRoom(session, award.reason || (session.resolution && session.resolution.reason) || 'miss', shooter);
    return award;
  }

  function finishSettle(session, applyStar) {
    return concludeShot(session, applyStar);
  }

  function noteContacts(session, events) {
    var cueBall = findCue(session);
    var i;
    for (i = 0; i < events.contacts.length; i++) {
      var c = events.contacts[i];
      if (c.kind === 'cushion') {
        if (c.ball && c.ball.id === 'cue') session.shot.cushions += 1;
        if (sfx && sfx.cushion) sfx.cushion();
      }
      if (c.kind === 'ball') {
        if (sfx && sfx.ball) sfx.ball();
      }
      if (c.kind === 'ball' && !session.shot.firstContactId) {
        var other = null;
        if (c.a === cueBall) other = c.b;
        if (c.b === cueBall) other = c.a;
        if (other && other.id !== 'cue') session.shot.firstContactId = other.id;
      }
    }
    for (i = 0; i < events.pockets.length; i++) {
      var pocketed = events.pockets[i].ball;
      session.shot.pocketed.push(pocketed.id);
      if (sfx && sfx.pocket) sfx.pocket();
      if (fx.spawnPop) {
        fx.spawnPop(
          session.particles,
          pocketed.x,
          pocketed.y,
          pocketed.id === 'cue' ? '刮库' : ('目标球 +' + ((session.config && session.config.pocketBonus) || 24)),
          session.config.colors.scorePop
        );
      }
    }
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
    session.shot.pocketedNine = session.shot.pocketed.indexOf('b9') !== -1;
    refreshTarget(session);
  }

  function resolvePocket(session) {
    session.phase = fsm.PHASE.ResolvePocket;
    session.resolution = fsm.classify(session.shot);
    if (fsm.skipsStarMultiplier(session.resolution)) {
      return concludeShot(session, false);
    }
    session.phase = fsm.PHASE.WaitCueStop;
    stopDetect.reset(session.stop);
    return session.resolution;
  }

  function enterStarZone(session) {
    session.phase = fsm.PHASE.StarZone;
    return concludeShot(session, true);
  }

  function shotReadyToResolve(session) {
    if (session.shot.scratch) return true;
    if (session.shot.pocketedLowest) return true;
    if (session.shot.pocketedNine) return true;
    return !!session.stop.stopped;
  }

  function update(session, dt) {
    fx.step(session.particles, dt);
    if (session.toast) {
      session.toast.life -= dt;
      if (session.toast.life <= 0) session.toast = null;
    }
    if (session.banner) {
      session.banner.life -= dt;
      if (session.banner.life <= 0) session.banner = null;
    }
    if (session.powerFlash) {
      session.powerFlash -= dt;
      if (session.powerFlash <= 0) session.powerFlash = 0;
    }
    if (session.phase === fsm.PHASE.Aim) {
      // P0-A: freeze the table while aiming / charging. Never step physics.
      balls.haltBalls(session.balls);
      guardObjectBalls(session);
      if (session.versus && session.aimDeadlineAt && Date.now() >= session.aimDeadlineAt) {
        timeoutAim(session);
      }
      if (isLocalAi(session) && session.turn !== session.mySeat && !session.matchOver) {
        if (!(session.aiThink > 0) && !session.aiPlan) scheduleAi(session);
        if (session.aiThink > 0) {
          session.aiThink -= dt;
          if (session.aiThink <= 0) {
            session.aiThink = 0;
            fireAi(session);
          }
        }
      }
      if (session.versus && !canAim(session)) stepRemoteAim(session);
      tickRoomSync(session, dt);
      return;
    }
    if (session.phase === fsm.PHASE.Shot && session.remoteReplay) {
      var replayEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, replayEv);
      handleOutOfBounds(session, replayEv);
      stopDetect.tick(
        session.stop,
        physics.anyMoving(session.balls, session.config.stopSpeed),
        dt,
        session.config.stopHoldMs
      );
      if (session.stop.stopped || !physics.anyMoving(session.balls, session.config.stopSpeed)) {
        session.remoteReplay.stopped = true;
        balls.haltBalls(session.balls);
        if (!session.pendingRoomState) pullRoom(session, { full: true });
      }
      tickRoomSync(session, dt);
      maybeFinishRemoteReplay(session);
      return;
    }
    if (session.phase === fsm.PHASE.Shot) {
      var shotEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, shotEv);
      handleOutOfBounds(session, shotEv);
      stopDetect.tick(
        session.stop,
        physics.anyMoving(session.balls, session.config.stopSpeed),
        dt,
        session.config.stopHoldMs
      );
      if (shotReadyToResolve(session)) resolvePocket(session);
      return;
    }
    if (session.phase === fsm.PHASE.WaitCueStop) {
      var waitEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, waitEv);
      handleOutOfBounds(session, waitEv);
      if (session.shot.scratch) {
        session.resolution = fsm.classify(session.shot);
        concludeShot(session, false);
        return;
      }
      var cueBall = findCue(session);
      var cueMoving = cueBall && physics.hypot(cueBall.vx, cueBall.vy) >= (session.config.stopSpeed || 10);
      stopDetect.tick(session.stop, !!cueMoving, dt, session.config.stopHoldMs);
      if (session.stop.stopped) {
        if (session.settleIn <= 0) session.settleIn = session.config.settleDelayMs || 240;
      }
      if (session.settleIn > 0) {
        session.settleIn -= dt * 1000;
        if (session.settleIn <= 0) enterStarZone(session);
      }
    }
  }

  function attachHostRoom(session, made) {
    session.versus = true;
    session.hotseat = true;
    session.localAi = false;
    session.mode = 'room';
    session.aiThink = 0;
    session.aiPlan = null;
    session.mySeat = 0;
    session.turn = 0;
    resetMatchScores(session);
    session.role = 'host';
    session.roomStars = { host: 0, guest: 0 };
    session.room = {
      roomId: made.roomId,
      guestJoined: !!(made.state && made.state.guestJoined),
      token: made.token,
      role: 'host',
      share: made.share || null,
      hostOpenId: (made.state && (made.state.hostOpenId || (made.state.openIds && made.state.openIds[0]))) || session.myOpenId || '',
      guestOpenId: (made.state && (made.state.guestOpenId || (made.state.openIds && made.state.openIds[1]))) || '',
      lastSeq: made.state ? (made.state.shotSeq != null ? made.state.shotSeq : made.state.seq) : 0,
      aimSeq: made.state && made.state.aimSeq != null ? made.state.aimSeq : 0
    };
    fetchNick(session);
    if (made.state) {
      if (made.state.names) session.names = made.state.names.slice();
      if (made.state.deadlineAt != null) session.aimDeadlineAt = made.state.deadlineAt;
      else if (made.state.aimDeadlineAt != null) session.aimDeadlineAt = made.state.aimDeadlineAt;
      if (made.state.turnOpenId) session.turnOpenId = made.state.turnOpenId;
      if (made.state.nicknames) {
        session.names = [
          made.state.nicknames.host || session.names[0],
          made.state.nicknames.guest || session.names[1]
        ];
        session.nicknames = {
          host: session.names[0],
          guest: session.names[1]
        };
      }
    }
    session.nicknames = session.nicknames || { host: session.names[0], guest: session.names[1] };
    if (session.names && session.names[1] === aiLabel(session)) {
      session.names[1] = seatFallback(1);
      session.nicknames.guest = seatFallback(1);
    }
    applyLocalName(session, session.displayName || session.names[0]);
    session.roomPanel = {
      roomId: made.roomId,
      hint: '分享给好友，加入后同步台面。第二页打开 ?roomId=' + made.roomId
    };
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    session.toast = { text: '房间 ' + made.roomId, life: 1.8 };
    return { kind: 'room', roomId: made.roomId, seat: 0, token: made.token };
  }

  function createRoom(session) {
    if (isLocalAi(session) || session.mode === 'practice' || session.mode === 'ai') {
      session.toast = { text: '请回大厅选好友对局', life: 1.6 };
      return { kind: 'room-skip', mode: session.mode || 'ai' };
    }
    if (session.room && session.room.roomId) {
      session.roomPanel = {
        roomId: session.room.roomId,
        hint: session.room.guestJoined
          ? '好友已加入 · 轮流击球'
          : '分享给好友，加入后同步台面。第二页打开 ?roomId=' + session.room.roomId
      };
      session.toast = { text: '房间 ' + session.room.roomId, life: 1.4 };
      return { kind: 'room', roomId: session.room.roomId, existing: true };
    }
    var felt = session.table && session.table.felt;
    if (session.names && session.names[1] === aiLabel(session)) {
      session.names[1] = seatFallback(1);
      session.nicknames = session.nicknames || {};
      session.nicknames.guest = seatFallback(1);
    }
    fetchNick(session);
    var made = roomApi.create({
      balls: roomApi.snapshotBalls(session.balls, felt),
      scores: [0, 0],
      targetN: session.target ? session.target.n : 1,
      names: session.names,
      hostName: session.displayName || (session.names && session.names[0]) || seatFallback(0),
      name: session.displayName || (session.names && session.names[0]) || seatFallback(0),
      nick: session.displayName || (session.names && session.names[0]) || seatFallback(0),
      displayName: session.displayName || (session.names && session.names[0]) || seatFallback(0),
      openId: session.myOpenId || ''
    }, function (res) {
      if (res && res.ok && res.roomId) {
        if (!(session.room && session.room.roomId)) attachHostRoom(session, res);
        if (session.inviteAfterCreate) {
          session.inviteAfterCreate = false;
          shareInvite(session);
        }
      } else if (!res || !res.ok) {
        session.inviteAfterCreate = false;
        session.toast = { text: createFailHint(res && res.reason), life: 2.2 };
      }
    });
    if (made && made.ok && made.roomId) return attachHostRoom(session, made);
    if (made && made.pending) {
      session.toast = { text: '正在开房间…', life: 1.4 };
      return { kind: 'room-pending' };
    }
    session.inviteAfterCreate = false;
    session.toast = { text: createFailHint(made && made.reason), life: 2.2 };
    return { kind: 'room-fail', reason: made && made.reason };
  }

  function attachGuestRoom(session, joined, roomId) {
    session.versus = true;
    session.hotseat = false;
    session.localAi = false;
    session.mode = 'room';
    session.aiThink = 0;
    session.aiPlan = null;
    session.mySeat = joined.seat != null ? joined.seat : 1;
    session.role = joined.role || 'guest';
    session.room = {
      roomId: joined.roomId,
      guestJoined: true,
      token: joined.token,
      role: session.role,
      hostOpenId: (joined.state && (joined.state.hostOpenId || (joined.state.openIds && joined.state.openIds[0]))) || '',
      guestOpenId: (joined.state && (joined.state.guestOpenId || (joined.state.openIds && joined.state.openIds[1]))) || session.myOpenId || '',
      lastSeq: joined.state
        ? (joined.state.shotSeq != null ? joined.state.shotSeq : joined.state.seq)
        : 0,
      aimSeq: joined.state && joined.state.aimSeq != null ? joined.state.aimSeq : 0
    };
    session.pendingRoomId = '';
    session.joinError = null;
    session._joinInFlight = '';
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    fetchNick(session);
    if (joined.state) {
      applyRoomState(session, joined.state, { join: true, forceBalls: true });
      if (shouldStartRemoteReplay(session, joined.state)) beginRemoteReplay(session, joined.state);
    }
    session.nicknames = session.nicknames || {
      host: (session.names && session.names[0]) || seatFallback(0),
      guest: (session.names && session.names[1]) || seatFallback(1)
    };
    applyLocalName(session, session.displayName);
    session.toast = { text: '已加入 ' + roomId, life: 1.4 };
    return { kind: 'join', roomId: joined.roomId, seat: joined.seat };
  }

  function joinFailHint(reason) {
    if (reason === 'missing' || reason === 'not_found' || reason === 'expired' || reason === 'bad-json') {
      return '房间无效';
    }
    if (reason === 'full') return '房间已满';
    if (reason === 'ended') return '房间已结束';
    if (
      reason === 'unreachable' ||
      reason === 'http-fail' ||
      reason === 'network' ||
      reason === 'cloud-fail' ||
      reason === 'no-room-api-base'
    ) {
      return '服务器连不上';
    }
    return '加入失败';
  }

  function createFailHint(reason) {
    if (reason === 'http-fail' || reason === 'network') return '开房间失败：网络或域名不可达';
    if (reason === 'cloud-fail') return '开房间失败：云函数不可用';
    if (reason === 'no-room-api-base') return '开房间失败：未配置房间服';
    return '开房间失败';
  }

  function markJoinFail(session, roomId, reason) {
    session.pendingRoomId = roomId || session.pendingRoomId || '';
    session.joinError = reason || 'join-fail';
    session.mode = 'room';
    session.localAi = false;
    session.toast = { text: joinFailHint(reason), life: 2.6 };
    session.banner = {
      text: joinFailHint(reason),
      kind: 'foul',
      detail: session.pendingRoomId ? '点重新加入再试' : '',
      life: 3.4
    };
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[taiqiu] join fail', roomId, reason || '');
      }
    } catch (err) {}
    return { kind: 'join-fail', roomId: roomId, reason: reason || 'join-fail' };
  }

  function joinRoom(session, roomId) {
    roomId = String(roomId || '').trim();
    if (!roomId) return markJoinFail(session, '', 'missing');
    if (session._joinInFlight === roomId && !session.joinError) {
      return { kind: 'join-pending', roomId: roomId };
    }
    session.pendingRoomId = roomId;
    session.joinError = null;
    session.mode = 'room';
    session.localAi = false;
    session._joinInFlight = roomId;
    session.toast = { text: '正在进入房间…', life: 1.6 };
    fetchNick(session);
    var payload = {
      roomId: roomId,
      name: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      nick: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      displayName: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      openId: session.myOpenId || ''
    };
    var joined = roomApi.join(payload, function (res) {
      if (session._joinInFlight === roomId) session._joinInFlight = '';
      if (res && res.ok) {
        session.joinError = null;
        if (res.role === 'host' || res.seat === 0) {
          attachHostRoom(session, res);
          session.pendingRoomId = '';
          return;
        }
        attachGuestRoom(session, res, roomId);
        return;
      }
      if (session.room && session.room.roomId === roomId) return;
      markJoinFail(session, roomId, res && res.reason);
    });
    if (joined && joined.ok && !joined.pending) {
      session._joinInFlight = '';
      session.joinError = null;
      if (joined.role === 'host' || joined.seat === 0) {
        attachHostRoom(session, joined);
        session.pendingRoomId = '';
        return { kind: 'join', roomId: joined.roomId, seat: 0 };
      }
      return attachGuestRoom(session, joined, payload.roomId);
    }
    if (joined && joined.pending) {
      session.toast = { text: '正在进入房间…', life: 1.6 };
      return { kind: 'join-pending', roomId: roomId };
    }
    return markJoinFail(session, roomId, joined && joined.reason);
  }

  function enterInvite(session, opts) {
    var invite = share.parseInvite ? share.parseInvite(opts) : { roomId: '' };
    var roomId = invite.roomId;
    if (!roomId) return { kind: 'none' };
    if (session.room && session.room.roomId === roomId) {
      session.pendingRoomId = '';
      session.joinError = null;
      pullRoom(session);
      return { kind: 'join-existing', roomId: roomId, seat: session.mySeat };
    }
    session.mode = 'room';
    session.localAi = false;
    session.pendingRoomId = roomId;
    return joinRoom(session, roomId);
  }

  function shareInvite(session) {
    if (!session.room || !session.room.roomId) {
      session.toast = { text: '还没有房间，无法邀请', life: 1.8 };
      return { kind: 'invite-fail', reason: 'no-room-id' };
    }
    var payload = share.shareRoom(session.room.roomId);
    if (!payload || !payload.ok || !payload.roomId || !payload.query) {
      session.toast = { text: '邀请缺少房间码', life: 1.8 };
      return { kind: 'invite-fail', reason: 'no-room-id' };
    }
    session.lastShare = payload;
    session.roomPanel = {
      roomId: session.room.roomId,
      hint: session.room.guestJoined
        ? '好友已加入 · 轮流击球'
        : '分享给好友，加入后同步台面。房间码 ' + session.room.roomId
    };
    session.toast = { text: '邀请房间 ' + session.room.roomId, life: 1.6 };
    return { kind: 'invite', payload: payload, roomId: session.room.roomId };
  }

  function inviteRoom(session) {
    if (isLocalAi(session) || session.mode === 'practice' || session.mode === 'ai') {
      session.toast = { text: '请回大厅选好友对局', life: 1.6 };
      return { kind: 'room-skip', mode: session.mode || 'ai' };
    }
    if (!session.room || !session.room.roomId) {
      session.inviteAfterCreate = true;
      var made = createRoom(session);
      if (session.room && session.room.roomId) {
        session.inviteAfterCreate = false;
        return shareInvite(session);
      }
      if (made && (made.kind === 'room-pending' || made.kind === 'invite-pending')) {
        return { kind: 'invite-pending' };
      }
      session.inviteAfterCreate = false;
      session.toast = { text: createFailHint(made && made.reason), life: 2.0 };
      return { kind: 'invite-fail', reason: (made && made.reason) || 'room-fail' };
    }
    return shareInvite(session);
  }

  function handleRoomTap(session) {
    if (isLocalAi(session) || session.mode === 'practice' || session.mode === 'ai') {
      session.toast = { text: '请回大厅选好友对局', life: 1.6 };
      return { kind: 'room-skip', mode: session.mode || 'ai' };
    }
    if (session.room && session.room.roomId) return inviteRoom(session);
    return createRoom(session);
  }

  function backToLobby(session, kind) {
    session.mode = '';
    session.versus = false;
    session.localAi = false;
    session.hotseat = true;
    session.mySeat = 0;
    session.turn = 0;
    session.room = null;
    session.roomPanel = null;
    session.pendingRoomId = '';
    session.joinError = null;
    session.inviteAfterCreate = false;
    session.matchOver = false;
    session.winner = null;
    session.settle = null;
    session.award = null;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.remoteBusy = null;
    session.aimDeadlineAt = 0;
    session.turnOpenId = '';
    session._joinInFlight = '';
    session.banner = null;
    session.pressed = null;
    session.names = [
      session.displayName || seatFallback(0),
      seatFallback(1)
    ];
    session.nicknames = { host: session.names[0], guest: session.names[1] };
    resetMatchScores(session);
    session.phase = fsm.PHASE.Splash;
    session.toast = { text: '已回大厅', life: 1.2 };
    return { kind: kind || 'lobby' };
  }

  function handlePointerDown(session, x, y) {
    var hit = hud.hitTest(session.ui, x, y, session.phase, session);
    session.pressed = hit;
    if (hit === 'room-close') {
      session.roomPanel = null;
      return { kind: 'room-close' };
    }
    if (hit === 'rerack') {
      newGame(session);
      return { kind: 'rerack' };
    }
    if (session.roomPanel && hit !== 'room-close' && hit !== 'room' && hit !== 'lobby') {
      return { kind: 'room-block' };
    }
    if (hit === 'bgm') {
      session.bgm = session.bgm === false;
      if (sfx && sfx.setBgm) sfx.setBgm(session.bgm);
      persist(session);
      return { kind: 'bgm', bgm: session.bgm };
    }
    if (hit === 'lobby' || hit === 'back') return backToLobby(session, hit);
    if (hit === 'room' || hit === 'room-blocked') return handleRoomTap(session);
    if (hit === 'join-retry' && session.pendingRoomId) {
      return joinRoom(session, session.pendingRoomId);
    }
    if (session.phase === fsm.PHASE.Splash) {
      if (session.pendingRoomId) return joinRoom(session, session.pendingRoomId);
      if (hit === 'practice') return startPractice(session);
      if (hit === 'start-ai' || hit === 'start') return startAi(session);
      return { kind: 'splash-idle' };
    }
    if (hit === 'aim3d') {
      toggleAim3d(session);
      return { kind: 'aim3d', aim3d: session.aim3d, viewMode: session.viewMode };
    }
    if (hit === 'ai' && session.phase === fsm.PHASE.Aim) {
      return fireAi(session);
    }
    if (session.phase === fsm.PHASE.Settle) {
      if (hit === 'replay') {
        newGame(session);
        return { kind: 'replay' };
      }
      if (hit === 'back') {
        session.settle = null;
        session.roomPanel = null;
        session.phase = fsm.PHASE.Splash;
        return { kind: 'back' };
      }
      if (hit === 'share') {
        session.lastShare = share.share(session.settle, session.best);
        session.toast = { text: '已生成成绩分享', life: 1.4 };
        return { kind: 'share', payload: session.lastShare };
      }
      return { kind: 'blocked' };
    }
    if (session.phase === fsm.PHASE.Aim) {
      if (!canAim(session)) {
        session.toast = {
          text: hud.turnLabel ? hud.turnLabel(session) : '对方出杆',
          life: 1.1
        };
        return { kind: 'wait-turn' };
      }
      var cueBall = findCue(session);
      if (cue.inGrab(cueBall, x, y, session.config.grabSlopPx) ||
          table.contains(session.table.felt, x, y)) {
        cue.beginDrag(session.cue, x, y, cueBall, dragBounds(session));
        refreshPreview(session);
        noteFullPower(session);
        guardObjectBalls(session);
        pushAim(session, { kind: 'charging' });
        return { kind: 'aim' };
      }
    }
    return { kind: 'none' };
  }

  function handlePointerMove(session, x, y) {
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    cue.moveDrag(session.cue, x, y, findCue(session), dragBounds(session));
    refreshPreview(session);
    noteFullPower(session);
    guardObjectBalls(session);
    var gap = aimSyncMs(session);
    if (Date.now() - (session.lastAimPush || 0) >= gap) {
      pushAim(session, { kind: 'charging' });
    }
    return { kind: 'aim' };
  }

  function handlePointerUp(session, x, y) {
    session.pressed = null;
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    var shot = cue.endDrag(session.cue, session.config);
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (!shot.fired) return { kind: 'cancel' };
    if (!canAim(session)) return { kind: 'wait-turn' };
    return applyStrike(session, shot, { kind: 'fire' });
  }

  function applyStrike(session, shot, opts) {
    opts = opts || {};
    var cueBall = findCue(session);
    if (!cueBall || !shot) return { kind: 'cancel' };
    guardObjectBalls(session);
    var struck = cue.strike(cueBall, shot, session.config);
    if (!struck || !struck.fired) return { kind: 'cancel' };
    session.lastShotInput = {
      aimAngle: struck.angle,
      power: struck.power,
      ax: struck.ax,
      ay: struck.ay,
      spin: shot.spin || 0
    };
    session.phase = fsm.PHASE.Shot;
    session.remoteBusy = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.aiThink = 0;
    session.aiPlan = null;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    session.preview = { points: [], ghost: null, bounces: 0 };
    session.powerFlash = 0;
    session.powerWasFull = false;
    if (session.cue) {
      session.cue.dragging = false;
      session.cue.power = 0;
      session.cue.full = false;
    }
    pushAim(session, {
      kind: 'firing',
      aimAngle: struck.angle,
      angle: struck.angle,
      power: struck.power,
      spin: shot.spin || 0,
      ax: struck.ax,
      ay: struck.ay,
      preview: null
    });
    if (!opts.skipPush && opts.kind !== 'spectate' && session.room && session.room.roomId && !isLocalAi(session)) {
      var rollSeq = ((session.room.lastSeq || 0) + 1);
      session.pendingShotSeq = rollSeq;
      roomApi.shot(session.room.roomId, {
        roomId: session.room.roomId,
        shotSeq: rollSeq,
        angle: struck.angle,
        aimAngle: struck.angle,
        power: struck.power,
        spin: shot.spin || 0,
        ax: struck.ax,
        ay: struck.ay,
        phase: 'rolling',
        reason: 'rolling',
        fromSeat: session.mySeat,
        role: session.mySeat === 1 ? 'guest' : 'host',
        token: session.room.token,
        openId: session.myOpenId || '',
        events: []
      }, function (res) {
        if (res && res.ok && res.state && res.state.shotSeq != null && session.room) {
          session.room.lastSeq = res.state.shotSeq;
          session.pendingShotSeq = res.state.shotSeq;
        }
      });
    }
    if (sfx && sfx.cue) sfx.cue();
    if (opts.kind === 'ai' && !isLocalAi(session)) {
      session.toast = { text: '弱AI试杆', life: 1.0 };
    }
    return { kind: opts.kind || 'fire', power: struck.power, phase: session.phase };
  }

  function startAi(session) {
    if (session.pendingRoomId && !session.joinError) {
      session.toast = { text: '正在进入房间…', life: 1.4 };
      return { kind: 'join-pending', roomId: session.pendingRoomId };
    }
    session.mode = 'ai';
    session.versus = true;
    session.localAi = true;
    session.hotseat = false;
    session.mySeat = 0;
    session.turn = 0;
    session.room = null;
    session.roomPanel = null;
    session.pendingRoomId = '';
    session.joinError = null;
    session.inviteAfterCreate = false;
    resetMatchScores(session);
    session.matchOver = false;
    session.winner = null;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.remoteBusy = null;
    fetchNick(session);
    var me = session.displayName || '玩家';
    session.names = [me, aiLabel(session)];
    if (session.displayName) applyLocalName(session, me);
    session.names[0] = me;
    session.names[1] = aiLabel(session);
    rack(session);
    session.phase = fsm.PHASE.Aim;
    armAimClock(session);
    ensureBgm(session);
    session.toast = { text: '人机 · 简单AI', life: 1.4 };
    return { kind: 'start-ai', mode: 'ai' };
  }

  function startPractice(session) {
    if (session.pendingRoomId && !session.joinError) {
      session.toast = { text: '正在进入房间…', life: 1.4 };
      return { kind: 'join-pending', roomId: session.pendingRoomId };
    }
    session.mode = 'practice';
    session.versus = false;
    session.localAi = false;
    session.hotseat = true;
    session.mySeat = 0;
    session.turn = 0;
    session.room = null;
    session.roomPanel = null;
    session.pendingRoomId = '';
    session.joinError = null;
    session.inviteAfterCreate = false;
    resetMatchScores(session);
    session.matchOver = false;
    session.winner = null;
    session.aimDeadlineAt = 0;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
    session.remoteAimVisual = null;
    session.remoteAimInterp = null;
    session.remoteReplay = null;
    session.pendingRoomState = null;
    session.remoteBusy = null;
    rack(session);
    session.phase = fsm.PHASE.Aim;
    fetchNick(session);
    ensureBgm(session);
    session.toast = { text: '练习模式', life: 1.2 };
    return { kind: 'start', mode: 'practice' };
  }

  function fireAi(session) {
    if (session.phase !== fsm.PHASE.Aim) return { kind: 'none' };
    var aiTurn = isLocalAi(session) && session.turn !== session.mySeat;
    if (!aiTurn && !canAim(session)) {
      session.toast = { text: '对方思考中', life: 1.1 };
      return { kind: 'wait-turn' };
    }
    if (!aiTurn && session.versus && session.room && session.room.guestJoined) {
      session.toast = { text: hud.turnLabel ? hud.turnLabel(session) : '对方出杆', life: 1.1 };
      return { kind: 'wait-turn' };
    }
    var cueBall = findCue(session);
    var target = session.target;
    var plan = (session.aiPlan && session.aiPlan.ok) ? session.aiPlan : ai.plan(cueBall, target, session.config);
    if (!plan || !plan.ok) {
      session.toast = { text: '弱AI无目标', life: 1.2 };
      return { kind: 'ai-skip' };
    }
    return applyStrike(session, plan, { kind: 'ai' });
  }

  function toggleAim3d(session) {
    session.aim3d = false;
    session.viewMode = 'top';
    session.toast = { text: '瞄准3D 即将上线', life: 1.2 };
    return false;
  }

  function getDebugState(session) {
    var cueBall = findCue(session);
    return {
      phase: session.phase,
      viewMode: session.viewMode,
      aim3d: session.aim3d,
      best: session.best,
      skinProgress: session.skinProgress,
      power: session.cue.power,
      dragging: session.cue.dragging,
      previewPoints: session.preview.points.length,
      previewBounces: session.preview.bounces,
      target: session.target ? session.target.n : 0,
      cue: cueBall ? { x: cueBall.x, y: cueBall.y, vx: cueBall.vx, vy: cueBall.vy, pocketed: cueBall.pocketed } : null,
      cushions: session.shot.cushions,
      pocketed: session.shot.pocketed.slice(),
      resolution: session.resolution,
      award: session.award,
      settle: session.settle,
      turn: session.turn,
      versus: session.versus,
      mode: session.mode || 'practice',
      localAi: !!session.localAi,
      aiThink: session.aiThink || 0,
      roomId: session.room ? session.room.roomId : null,
      remoteReplay: !!session.remoteReplay,
      remoteAimVisual: session.remoteAimVisual,
      winner: session.winner,
      scores: session.scores.slice(),
      stars: session.roomStars || { host: (session.scores[0] || 0), guest: (session.scores[1] || 0) },
      landFlash: session.landFlash
        ? { tileId: session.landFlash.tileId, frames: session.landFlash.frames }
        : null,
      names: session.names ? session.names.slice() : null,
      bgm: session.bgm !== false,
      aimDeadlineAt: session.aimDeadlineAt || 0,
      remoteBusy: session.remoteBusy || null
    };
  }

  function debugForceStop(session, opts) {
    opts = opts || {};
    var cueBall = findCue(session);
    var target = session.target;
    var i;
    for (i = 0; i < session.balls.length; i++) {
      session.balls[i].vx = 0;
      session.balls[i].vy = 0;
    }
    if (opts.scratch) {
      cueBall.pocketed = true;
    }
    if (opts.pocketTarget && target) {
      target.pocketed = true;
      session.shot.pocketed.push(target.id);
      if (!opts.whiff && opts.firstContact !== false) {
        session.shot.firstContactId = target.id;
      }
    }
    if (opts.pocketNine) {
      var nine = balls.findByN(session.balls, 9);
      if (nine) {
        nine.pocketed = true;
        session.shot.pocketed.push(nine.id);
      }
    }
    if (opts.cushions != null) session.shot.cushions = opts.cushions;
    if (opts.firstContact === true && target) session.shot.firstContactId = target.id;
    if (opts.firstContact === false) session.shot.firstContactId = 'b9';
    if (opts.whiff) session.shot.firstContactId = null;
    if (opts.x != null) cueBall.x = opts.x;
    if (opts.y != null) cueBall.y = opts.y;
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
    session.shot.pocketedNine = session.shot.pocketed.indexOf('b9') !== -1;
    session.stop.stopped = true;
    resolvePocket(session);
    if (session.phase === fsm.PHASE.WaitCueStop) enterStarZone(session);
    return session.settle || session.award;
  }

  return {
    create: create,
    update: update,
    render: function (session, ctx) { render.draw(session, ctx); },
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    resize: resize,
    restart: newGame,
    newGame: newGame,
    rack: rack,
    continueShot: continueShot,
    createRoom: createRoom,
    joinRoom: joinRoom,
    inviteRoom: inviteRoom,
    enterInvite: enterInvite,
    shareInvite: shareInvite,
    joinFailHint: joinFailHint,
    pullRoom: pullRoom,
    pushRoom: pushRoom,
    pushAim: pushAim,
    timeoutAim: timeoutAim,
    armAimClock: armAimClock,
    canAim: canAim,
    previewConfigOf: previewConfigOf,
    ingestState: ingestState,
    applyRoomState: applyRoomState,
    refreshTarget: refreshTarget,
    handleOutOfBounds: handleOutOfBounds,
    creditSeat: creditSeat,
    syncRoomStars: syncRoomStars,
    lockObjectBalls: lockObjectBalls,
    toggleAim3d: toggleAim3d,
    fireAi: fireAi,
    startAi: startAi,
    startPractice: startPractice,
    backToLobby: backToLobby,
    applyStrike: applyStrike,
    beginRemoteReplay: beginRemoteReplay,
    finishRemoteReplay: finishRemoteReplay,
    softCorrectBalls: softCorrectBalls,
    maxBallDrift: maxBallDrift,
    ballWorldPos: ballWorldPos,
    firingImpulse: firingImpulse,
    stepRemoteAim: stepRemoteAim,
    queueRemoteAim: queueRemoteAim,
    pushNames: pushNames,
    aimSyncMs: aimSyncMs,
    lerpAngle: lerpAngle,
    scheduleAi: scheduleAi,
    needsShotClock: needsShotClock,
    resolvePocket: resolvePocket,
    enterStarZone: enterStarZone,
    finishSettle: finishSettle,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound,
    worldOf: worldOf,
    resetMatchScores: resetMatchScores,
    PHASE: fsm.PHASE
  };
});
