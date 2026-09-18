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

  function seatFallback(seat) {
    return seat === 1 ? '好友' : '房主';
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
    if (!name) return session;
    session.displayName = name;
    session.names = session.names || [seatFallback(0), seatFallback(1)];
    session.names[session.mySeat || 0] = name;
    persist(session);
    return session;
  }

  function fetchNick(session) {
    var room = (session.config && session.config.room) || {};
    var hint = session.displayName ||
      (session.mySeat === 1 ? (room.guestDisplayName || room.displayName) : room.displayName) ||
      '';
    if (hint) applyLocalName(session, hint);
    function fromInfo(info) {
      var nick = info && (info.nickName || (info.userInfo && info.userInfo.nickName));
      if (nick) applyLocalName(session, nick);
      var openId = info && (info.openId || info.openid);
      if (openId) session.myOpenId = openId;
    }
    try {
      if (typeof wx === 'undefined') return session;
      if (wx.getUserProfile) {
        wx.getUserProfile({
          desc: '用于对局显示昵称',
          success: function (res) { fromInfo(res.userInfo || res); },
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

  function aimPollSec(session) {
    var cfg = (roomApi.configOf && roomApi.configOf()) || {};
    var room = (session.config && session.config.room) || {};
    var ms = cfg.aimPollMs || room.aimPollMs || 140;
    return ms / 1000;
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
    var shotSeq = ((session.room && (session.room.lastSeq || 0)) || 0) + 1;
    return {
      roomId: session.room ? session.room.roomId : null,
      shotSeq: shotSeq,
      aimAngle: last.aimAngle,
      power: last.power,
      spin: last.spin,
      events: session.lastShotEvents || eventsFromResolution(session, reason),
      ballsSnapshot: snap,
      fromSeat: seat,
      role: seat === 1 ? 'guest' : 'host',
      token: session.room ? session.room.token : null,
      reason: reason || 'miss',
      balls: snap,
      scores: session.scores.slice(),
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
      roomApi.applyBalls(session.balls, snap, felt);
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
    if (state.scores) session.scores = state.scores.slice();
    if (state.turnRole === 'guest') session.turn = 1;
    else if (state.turnRole === 'host') session.turn = 0;
    else if (state.turn != null) session.turn = state.turn;
    if (state.turnOpenId != null) session.turnOpenId = state.turnOpenId;
    session.winner = state.winner;
    session.matchOver = !!state.matchOver;
    if (state.nicknames) {
      session.names = [
        state.nicknames.host || state.nicknames[0] || (session.names && session.names[0]) || '房主',
        state.nicknames.guest || state.nicknames[1] || (session.names && session.names[1]) || '好友'
      ];
    } else if (state.names) session.names = state.names.slice();
    if (state.deadlineAt != null) session.aimDeadlineAt = state.deadlineAt;
    else if (state.aimDeadlineAt != null) session.aimDeadlineAt = state.aimDeadlineAt;
    if (state.winnerOpenId) session.winnerOpenId = state.winnerOpenId;
    if (state.stars) session.roomStars = state.stars;
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
      session.remoteAim = state.aim;
      session.remoteBusy = state.aim.kind === 'firing' ? 'firing' : null;
    } else if (state.phase === fsm.PHASE.Shot && session.turn !== session.mySeat) {
      session.remoteBusy = 'firing';
    } else if (state.aim == null && session.turn === session.mySeat) {
      session.remoteAim = null;
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
      if (res && res.ok && res.state) ingestState(session, res);
    });
  }

  function pullRoom(session) {
    if (!session.room || !session.room.roomId) return null;
    var sinceSeq = session.room.lastSeq != null ? session.room.lastSeq : 0;
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
    session.scores = [0, 0];
    session.turn = 0;
    session.matchOver = false;
    session.winner = null;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
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
      matchOver: false,
      winner: null,
      syncAcc: 0,
      roomPanel: null,
      names: [
        saved.displayName || (config.room && config.room.displayName) || seatFallback(0),
        (config.room && config.room.guestDisplayName) || seatFallback(1)
      ],
      displayName: saved.displayName || (config.room && config.room.displayName) || '',
      bgm: saved.bgm !== false && (config.bgm !== false),
      aimDeadlineAt: 0,
      aimSeq: 0,
      remoteAim: null,
      remoteBusy: null,
      banner: null,
      lastAimPush: 0,
      powerFlash: 0,
      powerWasFull: false,
      turnOpenId: '',
      pocketScore: 0,
      zoneBonus: 0
    };
    resetRound(session);
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
      if (session.room) {
        session.syncAcc += dt;
        var watching = session.versus && !canAim(session);
        var pollSec = watching
          ? aimPollSec(session)
          : ((roomApi.configOf && roomApi.configOf().pollMs) || 450) / 1000;
        if (session.syncAcc > pollSec) {
          session.syncAcc = 0;
          pullRoom(session);
          guardObjectBalls(session);
        }
        if (canAim(session) && session.cue && session.cue.dragging) {
          var gap = aimPollSec(session) * 1000;
          if (Date.now() - (session.lastAimPush || 0) >= gap) {
            pushAim(session, { kind: 'charging' });
          }
        }
      }
      return;
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

  function attachHostRoom(session, made) {
    session.versus = true;
    session.hotseat = true;
    session.localAi = false;
    session.mode = 'room';
    session.aiThink = 0;
    session.aiPlan = null;
    session.mySeat = 0;
    session.turn = 0;
    session.scores = [0, 0];
    session.role = 'host';
    session.room = {
      roomId: made.roomId,
      guestJoined: false,
      token: made.token,
      role: 'host',
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
      }
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
      session.toast = { text: '人机/练习不联网开房', life: 1.2 };
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
      if (res && res.ok && res.roomId && !(session.room && session.room.roomId)) {
        attachHostRoom(session, res);
      }
    });
    if (made && made.ok && made.roomId) return attachHostRoom(session, made);
    if (made && made.pending) {
      session.toast = { text: '正在开房间…', life: 1.4 };
      return { kind: 'room-pending' };
    }
    session.toast = { text: '开房间失败', life: 1.4 };
    return { kind: 'room-fail' };
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
      lastSeq: joined.state
        ? (joined.state.shotSeq != null ? joined.state.shotSeq : joined.state.seq)
        : 0,
      aimSeq: joined.state && joined.state.aimSeq != null ? joined.state.aimSeq : 0
    };
    if (session.phase === fsm.PHASE.Splash) session.phase = fsm.PHASE.Aim;
    fetchNick(session);
    if (joined.state) applyRoomState(session, joined.state, { join: true, forceBalls: true });
    applyLocalName(session, session.displayName || seatFallback(1));
    session.toast = { text: '已加入 ' + roomId, life: 1.4 };
    return { kind: 'join', roomId: joined.roomId, seat: joined.seat };
  }

  function joinRoom(session, roomId) {
    fetchNick(session);
    var payload = {
      roomId: roomId,
      name: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      nick: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      displayName: session.displayName || (session.config.room && session.config.room.guestDisplayName) || seatFallback(1),
      openId: session.myOpenId || ''
    };
    var joined = roomApi.join(payload, function (res) {
      if (res && res.ok && !(session.room && session.room.roomId === roomId && session.mySeat === 1)) {
        attachGuestRoom(session, res, roomId);
      }
    });
    if (joined && joined.ok) return attachGuestRoom(session, joined, payload.roomId);
    if (joined && joined.pending) {
      session.toast = { text: '正在加入…', life: 1.4 };
      return { kind: 'join-pending', roomId: roomId };
    }
    session.toast = { text: '房间无效', life: 1.4 };
    return { kind: 'join-fail', roomId: roomId };
  }

  function inviteRoom(session) {
    if (!session.room || !session.room.roomId) return createRoom(session);
    session.roomPanel = {
      roomId: session.room.roomId,
      hint: session.room.guestJoined
        ? '好友已加入 · 轮流击球'
        : '分享给好友，加入后同步台面。第二页打开 ?roomId=' + session.room.roomId
    };
    session.lastShare = share.shareRoom(session.room.roomId);
    session.toast = { text: '邀请房间 ' + session.room.roomId, life: 1.6 };
    return { kind: 'invite', payload: session.lastShare, roomId: session.room.roomId };
  }

  function handleRoomTap(session) {
    if (isLocalAi(session) || session.mode === 'practice' || session.mode === 'ai') {
      session.toast = { text: '人机/练习不联网开房', life: 1.2 };
      return { kind: 'room-skip', mode: session.mode || 'ai' };
    }
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
    if (hit === 'bgm') {
      session.bgm = session.bgm === false;
      if (sfx && sfx.setBgm) sfx.setBgm(session.bgm);
      persist(session);
      return { kind: 'bgm', bgm: session.bgm };
    }
    if (hit === 'room') return handleRoomTap(session);
    if (session.phase === fsm.PHASE.Splash) {
      if (hit === 'practice') return startPractice(session);
      return startAi(session);
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
    var gap = aimPollSec(session) * 1000;
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
      spin: shot.spin || 0
    };
    session.phase = fsm.PHASE.Shot;
    session.remoteBusy = null;
    session.remoteAim = null;
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
      power: struck.power,
      ax: struck.ax,
      ay: struck.ay,
      preview: null
    });
    if (sfx && sfx.cue) sfx.cue();
    if (opts.kind === 'ai' && !isLocalAi(session)) {
      session.toast = { text: '弱AI试杆', life: 1.0 };
    }
    return { kind: opts.kind || 'fire', power: struck.power, phase: session.phase };
  }

  function startAi(session) {
    session.mode = 'ai';
    session.versus = true;
    session.localAi = true;
    session.hotseat = false;
    session.mySeat = 0;
    session.turn = 0;
    session.room = null;
    session.roomPanel = null;
    session.scores = [0, 0];
    session.matchOver = false;
    session.winner = null;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
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
    session.mode = 'practice';
    session.versus = false;
    session.localAi = false;
    session.hotseat = true;
    session.mySeat = 0;
    session.turn = 0;
    session.room = null;
    session.roomPanel = null;
    session.scores = [0, 0];
    session.matchOver = false;
    session.winner = null;
    session.aimDeadlineAt = 0;
    session.aiThink = 0;
    session.aiPlan = null;
    session.remoteAim = null;
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
      mode: session.mode || 'practice',
      localAi: !!session.localAi,
      aiThink: session.aiThink || 0,
      roomId: session.room ? session.room.roomId : null,
      winner: session.winner,
      scores: session.scores.slice(),
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
    pullRoom: pullRoom,
    pushRoom: pushRoom,
    pushAim: pushAim,
    timeoutAim: timeoutAim,
    armAimClock: armAimClock,
    canAim: canAim,
    previewConfigOf: previewConfigOf,
    ingestState: ingestState,
    applyRoomState: applyRoomState,
    lockObjectBalls: lockObjectBalls,
    toggleAim3d: toggleAim3d,
    fireAi: fireAi,
    startAi: startAi,
    startPractice: startPractice,
    applyStrike: applyStrike,
    scheduleAi: scheduleAi,
    needsShotClock: needsShotClock,
    resolvePocket: resolvePocket,
    enterStarZone: enterStarZone,
    finishSettle: finishSettle,
    getDebugState: getDebugState,
    debugForceStop: debugForceStop,
    resetRound: resetRound,
    PHASE: fsm.PHASE
  };
});
