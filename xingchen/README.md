# 奇境弹球 Xingchen（Wonderland Pinball）

WeChat native Canvas 2D mini-game. Pure client, custom lightweight 2D physics only (no Matter.js / Cocos / Unity).
Main package is code-only. Sibling packages `xinggui/` and `minigame/` are not imported or modified.

Display name: **奇境弹球**. Folder stays `xingchen/`.

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

Select a pre-shot skill (optional) → drag aim + power → fire → collide on statics / collect 辉球 → stop when `|v| < stopSpeed` for `stopHoldMs` (120ms) → award the **treasure cell under the ball center** → next shot or settle.

- **Level:** reach `scoreTarget` (150) within `K` shots (3).
- **Stamina / 星力:** 30, −1 per shot. At 0, 分享助力 (+1) and 观看星辉 (+3) stubs. No cash, withdraw, or gambling.
- **Out of table:** that ball scores **0** (beats stop-detect). Corner rifts stay open.
- **Cells:** 5×6 glowing sigils — 铜印 20 / 银辉 50 / 金焰 100 / 星谕 180.
- **Target balls:** cyan / rose / amber orbs add 15 / 25 / 40 on hit.
- **Skills:** 炎破 (break one obstacle), 霜凝 (higher friction), 双生 (two balls).
- Local best is the highest **level** score. 再来一局 starts a new board.

No timer. No real-money loop.

## Controls

- Tap **炎破 / 霜凝 / 双生** before the shot (tap again to cancel).
- Drag from the cue ball / table. Pull back to aim; fire direction is opposite the pull.
- Release to launch. A short pull cancels.
- Corner rifts are open: the ball can leave the table (偏离奇境 → 0).

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
    cells.js
    targets.js
    skills.js
    stamina.js
    level.js
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

## Visual

| Surface | Value |
| --- | --- |
| Table | `#070B18` → `#141B3A` deep-space + aurora (no green felt) |
| Cells | bronze / silver / gold / epic sigils |
| Cue ball | white core + `#7DD3FC` glow (skill-tinted) |
| Aim / preview | `#67E8F9` |
| Launcher | neon capsule |

No cash / coin / gambling imagery or copy. Virtual 星力 only.

## Config (`js/config.json`)

| Key | Value | Notes |
| --- | --- | --- |
| `fixedDt` | `1/60` | Accumulator in `game.js` |
| `stopSpeed` / `stopHoldMs` | `12` / `120` | Rest detection |
| `friction` / `restitution` | `2.05` / `0.74` | Custom integrator |
| `iceFrictionMul` | `1.75` | 霜凝 |
| `cellTiers` | `[20, 50, 100, 180]` | 铜印 / 银辉 / 金焰 / 星谕 |
| `shotsPerLevel` / `scoreTarget` | `3` / `150` | Level K |
| `staminaMax` | `30` | −1 / shot |
| `shareStamina` / `adStamina` | `1` / `3` | Stubs |

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
node xingchen/test/m3.test.js
```
