# 星轨 Xinggui（Star Trail）

WeChat native Canvas 2D mini-game. Pure client, no Cocos / Unity.
Main package is code-only (target ≤2MB). Cold start target ≤3s.

AppID: `wxc8683bd9c1599d7d`

## Import in WeChat DevTools

1. Open **微信开发者工具**.
2. **导入项目** → select this `xinggui/` folder (the directory that contains `game.js` and `project.config.json`).
3. AppID: `wxc8683bd9c1599d7d`.
4. Compile type must be **小游戏** (`compileType: game`).
5. Run in the simulator (portrait).

Do not import the repository root. The playable project root is `xinggui/`.

## M0 controls

- Tap a star to start a path.
- Tap a nearby star to add a segment if it is within `linkMaxPx` (default `0.22 × screen width`).
- Illegal long links are rejected (`距离过远`).
- **撤销** undoes the last segment (or the starting star). Already-used stars cannot be relinked, except closing back to the start.
- **清除**, or a double-tap on empty space, cancels the whole path.

## M1

- `InputPath` rejects already-used stars by default. The only exception is `toId === path[0] && path.length >= 4`, which is handed to `RingDetect` (winding). Self-link when `length < 4`, other reused stars, and over-distance links stay rejected.
- Close a ring by returning to the start star when the path has **≥4 nodes**. Detection is a signed **winding number** (not even-odd ray casting). Area and the in-ring set share that same vertex list.
- On close: interior stars are cleared (boundary nodes stay); score is `nodes×20 + floor(areaFactor × inRingCount × 15)`, then the combo multiplier.
- Combo window `8000ms`, multipliers `1 / 1.5 / 2 / 2.5` (cap).
- Perfect ring: ≥6 stars inside and no undo-reconnect on that path → `+200`.
- Weak attract pulls unselected stars toward the path within `attractRadius`.
- 60s countdown (`sessionMs`). HUD shows live score / timer / combo.
- Settle panel: score, **新纪录** or gap to local high score, **再来一局**, mock **分享**. High score is stored locally.
- `fx.spawnBurst` is invoked on close (M2 hook; still a no-op burst).

## Layout

```
xinggui/
  game.js
  game.json
  project.config.json
  js/
    starField.js
    inputPath.js
    ringDetect.js      # winding-number close
    attract.js         # weak path attract
    score.js
    fx.js
    session.js
    hud.js
    storage.js
    share.js           # mock stub
    config.json
  README.md
```

`tools/preview.html` is a browser smoke page only. It is ignored by pack options and is not part of the WeChat package.

## Config freeze (`js/config.json`)

| Key | Value | Notes |
| --- | --- | --- |
| `linkMaxPxRatio` | `0.22` | `linkMaxPx = width × ratio` |
| `starCountMin` / `starCountMax` | `18` / `28` | Two brightness tiers |
| `comboWindowMs` | `8000` | Combo window |
| `comboMultipliers` | `[1, 1.5, 2, 2.5]` | Cap at 2.5 |
| `sessionMs` | `60000` | Countdown |
| `attractRadius` / `attractStrength` | `40` / `14` | Weak path pull |
| `areaNormRatio` / `areaFactorCap` | `0.12` / `2.5` | `areaFactor` from play area |
| `nodeScore` / `inRingScore` | `20` / `15` | Close formula |
| `perfectInRingMin` / `perfectBonus` | `6` / `200` | Perfect ring |
| `hitStopFrames` | `3` | Brief pause on close |
| `particleCap` / `burstParticleCap` | `120` | Trail / future burst cap |
| `burstLifeMs` | `420` | Reserved for M2 burst |
| `glowInnerR` / `glowOuterR` | `6` / `14` | Soft star glow |
| `trailPointsPerNode` / `trailAlpha0` | `2` / `0.55` | Simple path trail |
| `perfectFlashColor` | `#F472B6` | Reserved |
| `fixedDt` | `1/60` | Accumulator in `game.js` |
| `colors.bgOuter` → `bgInner` | `#070B18` → `#12183A` | Radial deep space |
| `colors.starLow` / `starHigh` | `#7EC8FF` / `#E8F3FF` | Dim / bright stars |
| `colors.selectedCore` / `glow` | `#FFFFFF` / `#5B8CFF` | Selection + halo |
| `colors.path` → `pathHead` | `#A78BFA` → `#22D3EE` | Neon path |
| `colors.combo` / `perfect` / `scorePop` | `#F472B6` / `#F472B6` / `#FDE68A` | HUD / settle |

## Out of scope (later milestones)

Heavy burst particles / perfect flash polish stay stubbed (`spawnBurst` hook is already called).

## Local logic check

```bash
node xinggui/test/m0.test.js
node xinggui/test/m1.test.js
```
