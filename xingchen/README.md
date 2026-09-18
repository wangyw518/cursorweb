# 奇境弹球 Xingchen（Wonder Realm Pinball）

WeChat native Canvas 2D mini-game. Pure client, custom lightweight 2D physics only (no Matter.js / Cocos / Unity).
Package folder stays `xingchen/`. Sibling packages `xinggui/` and `minigame/` are not imported or modified.

AppID: `wxc8683bd9c1599d7d`

## Import in WeChat DevTools

1. Open **微信开发者工具**.
2. **导入项目** → select this `xingchen/` folder (the directory that contains `game.js` and `project.config.json`).
3. AppID: `wxc8683bd9c1599d7d`.
4. Compile type must be **小游戏** (`compileType: game`).
5. Run in the simulator (portrait).

Do not import the repository root. The playable project root is `xingchen/`.

`dev/` and `test/` are pack-ignored browser smoke / node tests. They are not part of the WeChat package.

## Loop (DeepSeek PRD)

Select a pre-shot skill → drag aim + power → fire → collide → stop when `|v| < stopSpeed` for `stopHoldMs` (120ms) → score the **treasure cell under the ball center** + any colored-orb bonuses → next shot or settle.

Reach the level **score target within K shots**. Each shot costs **1 星力**. Local best + replay. No timer.

- **Treasure grid:** bronze / silver / gold / epic glowing chests + sigils. Reward is the cell under the ball center.
- **Target orbs:** colored 玫辉 / 翠辉 / 曦辉 give bonus on first hit.
- **Skills:** 炎破 (break one obstacle), 霜止 (higher friction), 分影 (two balls).
- **Out of table:** ball center past the table rectangle scores 0 for that ball (target bonuses still count).
- **Stamina:** 30 星力, −1 / shot. At 0, share-assist + rewarded-ad UI hooks (stubs restore virtual 星力 only).
- **Economy:** virtual 星晶 and cosmetic skins only. Magic / neon table — not a felt cash table.

## Controls

- Tap 炎破 / 霜止 / 分影 to arm a skill (limited uses per level).
- Drag from the cue ball / table. Pull back to aim; fire direction is opposite the pull.
- Release to launch. A short pull cancels.
- Corner rifts are open: the ball can leave the table (偏离星表).

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
    economy.js
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

Deep space table `#070B18` → `#141B3A` / `#1A2450`. Neon sigils bronze / silver / gold / epic. Cue ball white + `#7DD3FC` glow. No green felt and no pile-of-coins table art.

## Config (`js/config.json`)

| Key | Value | Notes |
| --- | --- | --- |
| `fixedDt` | `1/60` | Accumulator in `game.js` |
| `stopSpeed` / `stopHoldMs` | `12` / `120` | Rest detection |
| `friction` / `iceFriction` | `2.05` / `3.55` | Ice skill uses the higher value |
| `staminaMax` | `30` | −1 per shot |
| `levels[0]` | 5 shots / 160 | 初入奇境 |
| `rarities` | 20 / 50 / 100 / 180 | 铜印 / 银印 / 金印 / 星谕 |

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
