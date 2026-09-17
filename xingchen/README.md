# 星尘弹射 Xingchen（Star Dust Launcher）

WeChat native Canvas 2D mini-game. Pure client, custom lightweight 2D physics only (no Matter.js / Cocos / Unity).
Main package is code-only. Sibling packages `xinggui/` and `minigame/` are not imported or modified.

AppID: `wxc8683bd9c1599d7d`

## Import in WeChat DevTools

1. Open **微信开发者工具**.
2. **导入项目** → select this `xingchen/` folder (the directory that contains `game.js` and `project.config.json`).
3. AppID: `wxc8683bd9c1599d7d`.
4. Compile type must be **小游戏** (`compileType: game`).
5. Run in the simulator (portrait).

Do not import the repository root. The playable project root is `xingchen/`.

`dev/` and `test/` are pack-ignored browser smoke / node tests. They are not part of the WeChat package.

## Loop (frozen GDD)

Drag aim + power → fire one ball → collide on statics → stop when `|v| < stopSpeed` for `stopHoldMs` (120ms) → score the ring band → settle (gap to best / 新纪录) → 再来一局.

No timer. One shot per round.

- **Out of table:** ball center past the table rectangle scores **0 immediately** and beats stop-detect.
- **Rings:** annular bands only (between inner / outer radius), not filled disks.
- **Overlap:** highest tier wins; same tier → smaller ring.
- **Tiers:** 10 / 30 / 80 / 200.
- **Edge:** center within `±edgePx` of a rim → `×1.2`.
- **Trajectory preview:** reflection polyline vs static walls / obstacles. Not a full physics sim.

## Controls

- Drag from the cue ball / launcher capsule. Pull back to aim; fire direction is opposite the pull.
- Release to launch. A short pull cancels.
- Corner rifts are open: the ball can leave the table (偏离星表 → 0).

## Layout

```
xingchen/
  game.js
  game.json
  project.config.json
  js/
    config.json
    launcher.js
    physics.js
    table.js
    obstacles.js
    scoreRings.js
    stopDetect.js
    score.js
    session.js
    hud.js
    fx.js
    storage.js
  dev/preview.html      # browser smoke, pack-ignored
  test/                 # node logic checks, pack-ignored
  README.md
```

## Visual freeze

| Surface | Value |
| --- | --- |
| Table | `#070B18` → `#141B3A` deep space (no green felt) |
| Rings | green / blue / purple / gold |
| Cue ball | white core + `#7DD3FC` glow |
| Aim / preview | `#67E8F9` |
| Launcher | neon capsule |

No cash / coin / gambling imagery or copy.

## Config freeze (`js/config.json`)

| Key | Value | Notes |
| --- | --- | --- |
| `fixedDt` | `1/60` | Accumulator in `game.js` |
| `stopSpeed` / `stopHoldMs` | `12` / `120` | Rest detection |
| `friction` / `restitution` | `2.05` / `0.74` | Custom integrator |
| `maxSpeed` | `980` | Velocity clamp |
| `tiers` | `[10, 30, 80, 200]` | 新星 / 彗星 / 星云 / 恒星 |
| `edgePx` / `edgeMultiplier` | `3` / `1.2` | Rim bonus |
| `previewBounces` / `previewLength` | `5` / `320` | Reflection polyline |

## Milestones

- **M0** — aim → fire → collide → stop feel, reflection preview.
- **M1** — annular rings, edge bonus, OOB 0, settle, local best.
- **M2** — scored ring flashes white 1 frame, then burst particles.

## Browser smoke

```bash
python3 -m http.server 8766 --directory xingchen
# open http://127.0.0.1:8766/dev/preview.html
```

## Local logic check

```bash
node xingchen/test/m0.test.js
node xingchen/test/m1.test.js
node xingchen/test/m2.test.js
```
