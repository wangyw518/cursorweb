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
| `attractRadius` | `36` | Reserved |
| `hitStopFrames` | `3` | Reserved |
| `particleCap` | `120` | Simple link trail cap |
| `fixedDt` | `1/60` | Accumulator in `game.js` |
| `colors.deepSpace` | `#0a0e1a` | Deep-space background |
| `colors.starCyan` / `starMagenta` | neon stars | Radial glow |
| `colors.neonPath` / `neonTrail` | path stroke | |

## Out of scope (later milestones)

Ring-close scoring, perfect ring, settle UI, heavy particles, attract, storage, and share stay stubs.

## Local logic check (optional)

```bash
node xinggui/test/m0.test.js
```
