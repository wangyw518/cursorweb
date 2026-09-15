/**
 * Delayed replay of post-quiet jump/dash through the same fixed-dt physics.
 * A ghost is fast-forwarded by ghostDelayMs so it occupies the present
 * point on that isolated action's path (visible, collidable).
 */

function hexToRgba(hex, alpha) {
  var raw = (hex || '#5CE1E6').replace('#', '');
  var n = parseInt(raw, 16);
  var r = (n >> 16) & 255;
  var g = (n >> 8) & 255;
  var b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function createGhostReplay(options) {
  var opts = options || {};
  var cfg = opts.config || {};
  var delaySec = (cfg.ghostDelayMs == null ? 1500 : cfg.ghostDelayMs) / 1000;
  var ttlSec = (cfg.ghostTtlMs == null ? 4000 : cfg.ghostTtlMs) / 1000;
  var cap = cfg.ghostCap == null ? 8 : cfg.ghostCap;
  var quietSec = (cfg.quietMs == null ? 2000 : cfg.quietMs) / 1000;
  var colors = cfg.colors || {};

  var pending = [];
  var active = [];

  function dropOldestOverCap() {
    while (active.length > cap) {
      active.shift();
    }
  }

  function spawn(ev, world) {
    var body = world.cloneBody(ev.snapshot);
    var applied = ev.type === 'dash' ? world.applyDash(body) : world.applyJump(body);
    if (!applied) {
      return null;
    }
    var steps = Math.round(delaySec / world.fixedDt);
    var s;
    for (s = 0; s < steps; s++) {
      world.stepKinematics(body, world.fixedDt, world.terrain, world.deathY);
    }
    var ghost = {
      body: body,
      type: ev.type,
      sourceT: ev.t,
      age: 0,
      trail: [],
      flash: 0
    };
    active.push(ghost);
    dropOldestOverCap();
    return ghost;
  }

  function pushTrail(ghost) {
    ghost.trail.push({
      x: ghost.body.x,
      y: ghost.body.y,
      w: ghost.body.w,
      h: ghost.body.h
    });
    if (ghost.trail.length > 2) {
      ghost.trail.shift();
    }
  }

  return {
    offer: function (t, type, snapshot) {
      if (t < quietSec) {
        return false;
      }
      pending.push({
        t: t,
        type: type,
        snapshot: snapshot
      });
      return true;
    },
    update: function (simTime, dt, world) {
      var i;
      for (i = 0; i < active.length; i++) {
        var ghost = active[i];
        if (ghost.body.alive) {
          pushTrail(ghost);
          world.stepKinematics(ghost.body, dt, world.terrain, world.deathY);
        }
        ghost.age += dt;
      }

      var aged = [];
      for (i = 0; i < active.length; i++) {
        if (active[i].age < ttlSec) {
          aged.push(active[i]);
        }
      }
      active = aged;

      var kept = [];
      for (i = 0; i < pending.length; i++) {
        var ev = pending[i];
        if (simTime + 1e-9 >= ev.t + delaySec) {
          spawn(ev, world);
        } else {
          kept.push(ev);
        }
      }
      pending = kept;
    },
    draw: function (ctx, view) {
      if (!ctx || !view || typeof view.worldToScreen !== 'function') {
        return;
      }
      var fill = hexToRgba(colors.ghost || colors.player || '#5CE1E6', colors.ghostAlpha == null ? 0.35 : colors.ghostAlpha);
      var trailFill = hexToRgba(colors.ghost || colors.player || '#5CE1E6', (colors.ghostAlpha == null ? 0.35 : colors.ghostAlpha) * 0.4);
      var stroke = colors.nearMiss || '#FFE66D';
      var i;
      var k;
      for (i = 0; i < active.length; i++) {
        var ghost = active[i];
        for (k = 0; k < ghost.trail.length; k++) {
          var tr = ghost.trail[k];
          var tp = view.worldToScreen(tr.x, tr.y + tr.h);
          ctx.fillStyle = trailFill;
          ctx.fillRect(tp.x, tp.y, tr.w, tr.h);
        }
        var p = view.worldToScreen(ghost.body.x, ghost.body.y + ghost.body.h);
        ctx.fillStyle = fill;
        ctx.fillRect(p.x, p.y, ghost.body.w, ghost.body.h);
        if (ghost.flash > 0) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 4;
          ctx.strokeRect(p.x - 1, p.y - 1, ghost.body.w + 2, ghost.body.h + 2);
        }
      }
    },
    markHit: function (ghost) {
      if (ghost) {
        ghost.flash = 1;
      }
    },
    reset: function () {
      pending.length = 0;
      active.length = 0;
    },
    list: function () {
      return active.slice();
    },
    pendingCount: function () {
      return pending.length;
    },
    delaySec: delaySec,
    ttlSec: ttlSec,
    cap: cap,
    quietSec: quietSec
  };
}

module.exports = {
  createGhostReplay
};
