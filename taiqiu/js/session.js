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
    typeof require === 'function' ? require('./net') : root.TaiqiuNet
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
  net
) {
  'use strict';

  function persist(session) {
    storage.save({
      best: session.best,
      skinProgress: session.skinProgress
    });
  }

  function worldOf(session) {
    return {
      balls: session.balls,
      walls: session.table.walls,
      pockets: session.table.pockets
    };
  }

  function findCue(session) {
    return balls.cueBall(session.balls);
  }

  function refreshTarget(session) {
    session.target = balls.lowestNumbered(session.balls);
    return session.target;
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
      session.config
    );
    return session.preview;
  }

  function roomPatch(session) {
    return {
      balls: net.snapshotBalls(session.balls),
      turn: session.turn,
      scores: session.scores.slice(),
      phase: session.phase,
      targetN: session.target ? session.target.n : 0,
      winner: session.winner,
      matchOver: !!session.matchOver,
      guestJoined: !!(session.room && session.room.guestJoined)
    };
  }

  function pushRoom(session) {
    if (!session.room || !session.room.roomId) return null;
    return net.pushState(session.room.roomId, roomPatch(session));
  }

  function applyRoomState(session, state) {
    if (!state) return session;
    if (state.balls) net.applyBalls(session.balls, state.balls);
    if (state.scores) session.scores = state.scores.slice();
    if (state.turn != null) session.turn = state.turn;
    session.winner = state.winner;
    session.matchOver = !!state.matchOver;
    if (state.guestJoined && session.room) {
      session.room.guestJoined = true;
      session.hotseat = false;
    }
    if (state.phase === fsm.PHASE.Aim || state.phase === fsm.PHASE.Settle) {
      session.phase = state.phase;
    }
    if (state.matchOver && state.phase === fsm.PHASE.Settle) {
      session.phase = fsm.PHASE.Settle;
    }
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    return session;
  }

  function pullRoom(session) {
    if (!session.room || !session.room.roomId) return null;
    var state = net.pullState(session.room.roomId);
    if (!state) return null;
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
    applyRoomState(session, state);
    return state;
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
    return session;
  }

  function resetRound(session) {
    return rack(session);
  }

  function newGame(session) {
    session.scores = [0, 0];
    session.turn = 0;
    session.matchOver = false;
    session.winner = null;
    rack(session);
    pushRoom(session);
    return { kind: 'new-game' };
  }

  function create(viewport, config, opts) {
    opts = opts || {};
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
      room: null,
      scores: [0, 0],
      matchOver: false,
      winner: null,
      syncAcc: 0,
      roomPanel: null
    };
    resetRound(session);
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
  }

  function canAim(session) {
    if (session.phase !== fsm.PHASE.Aim) return false;
    if (session.matchOver) return false;
    if (!session.versus) return true;
    if (session.hotseat && !(session.room && session.room.guestJoined)) return true;
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
    refreshTarget(session);
    if (session.target) session.shot.targetId = session.target.id;
    session.phase = fsm.PHASE.Aim;
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
    if (award && award.legal) {
      return { text: '+' + award.coins + ' 星币', life: 1.2 };
    }
    if (award && award.foul) {
      return { text: session.versus ? '犯规 · 换人' : '犯规', life: 1.4 };
    }
    return { text: session.versus ? '未进 · 换人' : '未进', life: 1.2 };
  }

  function concludeShot(session, applyStar) {
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
    session.scores[session.turn] = (session.scores[session.turn] || 0) + award.coins;

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
    }

    session.landFlash = null;
    if (applyStar && award.legal && !award.foul && landed) {
      session.landFlash = { tileId: landed.id, frames: 1 };
    }

    var win = !!(session.resolution && session.resolution.win);
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
        best: session.best
      };
      session.phase = fsm.PHASE.Settle;
      session.toast = toastFor(session, award);
      pushRoom(session);
      return session.settle;
    }

    // Miss / foul / legal 1–8: continueShot, never rack.
    session.toast = toastFor(session, award);
    if (shouldSwitchTurn(session)) switchTurn(session);
    continueShot(session);
    pushRoom(session);
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
      session.shot.pocketed.push(events.pockets[i].ball.id);
      if (sfx && sfx.pocket) sfx.pocket();
    }
    session.shot.scratch = !!(cueBall && cueBall.pocketed);
    session.shot.pocketedLowest = session.shot.targetId
      ? session.shot.pocketed.indexOf(session.shot.targetId) !== -1
      : false;
    session.shot.pocketedNine = session.shot.pocketed.indexOf('b9') !== -1;
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
    if (session.room && session.phase === fsm.PHASE.Aim) {
      session.syncAcc += dt;
      if (session.syncAcc > 0.45) {
        session.syncAcc = 0;
        pullRoom(session);
      }
    }
    if (session.phase === fsm.PHASE.Shot) {
      var shotEv = physics.step(worldOf(session), dt, session.config);
      noteContacts(session, shotEv);
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

  function createRoom(session) {
    if (session.room && session.room.roomId) {
      session.toast = { text: '房间 ' + session.room.roomId, life: 1.4 };
      return { kind: 'room', roomId: session.room.roomId, existing: true };
    }
    var made = net.createRoom();
    session.versus = true;
    session.hotseat = true;
    session.mySeat = 0;
    session.turn = 0;
    session.scores = [0, 0];
    session.room = { roomId: made.roomId, guestJoined: false };
    session.roomPanel = {
      roomId: made.roomId,
      hint: '分享房间码给好友（占位，完整同步待房间 API）'
    };
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    session.toast = { text: '房间 ' + made.roomId + ' · 分享占位', life: 2.0 };
    pushRoom(session);
    return { kind: 'room', roomId: made.roomId, seat: 0, stub: true };
  }

  function joinRoom(session, roomId) {
    var joined = net.joinRoom(roomId);
    if (!joined.ok) {
      session.toast = { text: '房间无效', life: 1.4 };
      return { kind: 'join-fail', roomId: roomId };
    }
    session.versus = true;
    session.hotseat = false;
    session.mySeat = joined.seat;
    session.room = { roomId: joined.roomId, guestJoined: true };
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    applyRoomState(session, joined.state);
    session.toast = { text: '已加入 ' + roomId, life: 1.4 };
    pushRoom(session);
    return { kind: 'join', roomId: joined.roomId, seat: joined.seat };
  }

  function inviteRoom(session) {
    if (!session.room || !session.room.roomId) return createRoom(session);
    session.roomPanel = {
      roomId: session.room.roomId,
      hint: '分享房间码给好友（占位，完整同步待房间 API）'
    };
    session.lastShare = share.shareRoom(session.room.roomId);
    session.toast = { text: '房间 ' + session.room.roomId + ' · 分享占位', life: 1.8 };
    return { kind: 'invite', payload: session.lastShare, roomId: session.room.roomId, stub: true };
  }

  function handleRoomTap(session) {
    if (session.room && session.room.roomId) return inviteRoom(session);
    return createRoom(session);
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
    if (session.roomPanel && hit !== 'room-close' && hit !== 'room') {
      return { kind: 'room-block' };
    }
    if (hit === 'room') return handleRoomTap(session);
    if (session.phase === fsm.PHASE.Splash) {
      session.phase = fsm.PHASE.Aim;
      return { kind: 'start' };
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
      if (hit === 'share') {
        session.lastShare = share.share(session.settle, session.best);
        session.toast = { text: '已生成成绩分享', life: 1.4 };
        return { kind: 'share', payload: session.lastShare };
      }
      return { kind: 'blocked' };
    }
    if (session.phase === fsm.PHASE.Aim) {
      if (!canAim(session)) {
        session.toast = { text: '对方击球', life: 1.1 };
        return { kind: 'wait-turn' };
      }
      var cueBall = findCue(session);
      if (cue.inGrab(cueBall, x, y, session.config.grabSlopPx) ||
          table.contains(session.table.felt, x, y)) {
        cue.beginDrag(session.cue, x, y, cueBall);
        refreshPreview(session);
        return { kind: 'aim' };
      }
    }
    return { kind: 'none' };
  }

  function handlePointerMove(session, x, y) {
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    cue.moveDrag(session.cue, x, y, findCue(session));
    refreshPreview(session);
    return { kind: 'aim' };
  }

  function handlePointerUp(session, x, y) {
    session.pressed = null;
    if (session.phase !== fsm.PHASE.Aim || !session.cue.dragging) return { kind: 'none' };
    var shot = cue.endDrag(session.cue, session.config);
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (!shot.fired) return { kind: 'cancel' };
    if (!canAim(session)) return { kind: 'wait-turn' };
    var cueBall = findCue(session);
    cueBall.vx = shot.vx;
    cueBall.vy = shot.vy;
    session.phase = fsm.PHASE.Shot;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    if (sfx && sfx.cue) sfx.cue();
    return { kind: 'fire', power: shot.power, phase: session.phase };
  }

  function fireAi(session) {
    if (session.phase !== fsm.PHASE.Aim) return { kind: 'none' };
    if (!canAim(session)) {
      session.toast = { text: '对方击球', life: 1.1 };
      return { kind: 'wait-turn' };
    }
    var cueBall = findCue(session);
    var target = session.target;
    var plan = ai.plan(cueBall, target, session.config);
    if (!plan.ok) {
      session.toast = { text: '弱AI无目标', life: 1.2 };
      return { kind: 'ai-skip' };
    }
    cueBall.vx = plan.vx;
    cueBall.vy = plan.vy;
    session.phase = fsm.PHASE.Shot;
    stopDetect.reset(session.stop);
    session.settleIn = 0;
    session.preview = { points: [], ghost: null, bounces: 0 };
    if (sfx && sfx.cue) sfx.cue();
    session.toast = { text: '弱AI试杆', life: 1.0 };
    return { kind: 'ai', power: plan.power, phase: session.phase };
  }

  function toggleAim3d(session) {
    session.aim3d = !session.aim3d;
    session.viewMode = 'top';
    session.toast = {
      text: session.aim3d ? '瞄准3D 占位' : '俯视瞄准',
      life: 1.2
    };
    return session.aim3d;
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
      roomId: session.room ? session.room.roomId : null,
      winner: session.winner,
      scores: session.scores.slice(),
      landFlash: session.landFlash
        ? { tileId: session.landFlash.tileId, frames: session.landFlash.frames }
        : null
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
    pullRoom: pullRoom,
    pushRoom: pushRoom,
    canAim: canAim,
    toggleAim3d: toggleAim3d,
    fireAi: fireAi,
    resolvePocket: resolvePocket,
    enterStarZone: enterStarZone,
    finishSettle: finishSettle,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound,
    PHASE: fsm.PHASE
  };
});
