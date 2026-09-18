# 星尘弹射 Xingchen（奇境弹球）

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

## Loop

Drag aim + power → fire one ball → collide on statics → stop when `|v| < stopSpeed` for `stopHoldMs` (120ms) → score **grid treasure + ring band** → next rod, or settle when the K-shot target is met / missed.

- **Level:** score-in-K-shots. L1 `80 / 3` rods, L2 `160 / 3`, L3 `240 / 4`.
- **Stamina:** 30. Starting a level costs 1. Share stub +1, 星尘补给 ad stub +5. Regen 1 / 10 min locally.
- **Grid:** 5×6 treasure cells (星尘 / 晶核 / 星云屑 / 古星遗物). Landing collects the cell. Not filled-disk rings.
- **Skills (once per level):** 炎核 burns 3×3, 霜核 doubles the cell and raises friction, 裂核 splits into 3 balls.
- **Rings:** annular bands still add 10 / 30 / 80 / 200, edge `×1.2`.
- **Out of table:** ball center past bounds scores 0 for that rod (beats stop-detect).
- **Trajectory preview:** reflection polyline vs statics. Not a full sim.

No timer. No cash / coin / gambling copy.

## Controls

- Tap 炎核 / 霜核 / 裂核 to arm (once per level).
- Drag from the cue ball / table. Pull back to aim; fire direction is opposite the pull.
- Release to launch. A short pull cancels.
- Corner rifts: 偏离星表 → that rod is 0.
- Settle: 再试一次 / 下一关, 分享, 星尘补给 (stubs).

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
    grid.js
    skills.js
    level.js
    stamina.js
    share.js
    ads.js
    session.js
    hud.js
    fx.js
    storage.js
  dev/preview.html
  test/
  README.md
```

## Visual freeze

Deep space table `#070B18` → `#141B3A`. Neon rings + treasure glyphs. Cue ball white + `#7DD3FC`. Aim `#67E8F9`. Launcher capsule. No green felt, no cash / coin / gambling imagery.

## Local logic check

```bash
node xingchen/test/m0.test.js
node xingchen/test/m1.test.js
node xingchen/test/m2.test.js
node xingchen/test/m3.test.js
```

## Browser smoke

```bash
python3 -m http.server 8766 --directory xingchen
# http://127.0.0.1:8766/dev/preview.html
```
