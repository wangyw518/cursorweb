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
- **撤销** undoes the last segment (or the starting star). Tapping the previous star also undoes.
- **清除**, or a double-tap on empty space, cancels the whole path.
- HUD is a stub: timer stays `60`, score stays `0`.

## Layout

```
xinggui/
  game.js
  game.json
  project.config.json
  js/
    starField.js
    inputPath.js
    ringDetect.js      # M0 stub
    attract.js         # M0 stub
    score.js           # M0 stub
    fx.js
    session.js
    hud.js
    storage.js         # M0 stub
    share.js           # M0 stub
    config.json
  README.md
```

`tools/preview.html` is a browser smoke page only. It is ignored by pack options and is not part of the WeChat package.

## Config freeze (`js/config.json`)

| Key | M0 value | Notes |
| --- | --- | --- |
| `linkMaxPxRatio` | `0.22` | `linkMaxPx = width × ratio` |
| `starCountMin` / `starCountMax` | `18` / `28` | Two brightness tiers |
| `comboWindowMs` | `8000` | Reserved |
| `sessionMs` | `60000` | HUD timer stub shows 60 |
| `attractRadius` | `40` | Reserved |
| `hitStopFrames` | `3` | Reserved |
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
| `colors.combo` / `perfect` / `scorePop` | `#F472B6` / `#F472B6` / `#FDE68A` | Reserved |

## Out of scope (later milestones)

Ring-close scoring, perfect ring, settle UI, heavy particles, attract, storage, and share stay stubs.

## Local logic check (optional)

```bash
node xinggui/test/m0.test.js
```
