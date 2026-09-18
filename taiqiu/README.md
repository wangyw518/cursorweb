# 星券台球 Taiqiu

WeChat native Canvas 2D mini-game. Pure client, custom lightweight 2D billiard physics only (no Matter.js / Cocos / Unity).

Sibling packages `xingchen/` and `xinggui/` are **not imported or modified**.

AppID: `wxc8683bd9c1599d7d`

虚拟道具，仅限游戏内使用，不可兑换现金。

## Import in WeChat DevTools

1. Open **微信开发者工具**.
2. **导入项目** → select this `taiqiu/` folder (the directory that contains `game.js` and `project.config.json`).
3. AppID: `wxc8683bd9c1599d7d`.
4. Compile type must be **小游戏** (`compileType: game`).
5. Run in the simulator (portrait).

Do **not** import the repository root. The playable project root is `taiqiu/`.

`dev/`, `test/`, and `shots/` are pack-ignored browser smoke / node tests / screenshots. They are not part of the WeChat package.

## Frozen GDD loop (M0–M1)

State machine: **Aim → Shot → ResolvePocket → WaitCueStop → StarZone**

1. **Aim** — top-down only (`viewMode: top`). Drag cue, dashed aim, pull-back power. **瞄准3D** is a stub and does not change the camera.
2. **Shot** — fire the cue ball; custom 2D circles / cushions / friction / pockets.
3. **ResolvePocket** — simplified 9-ball order (lowest numbered object ball first). Scratch, whiff, or wrong first contact is a **foul**. A miss or foul **does not rerack**.
4. **WaitCueStop** — only after a valid pocket; cue keeps rolling.
5. **StarZone** — when the cue ball stops, read the abstract zone under its center. 落点加成 as 星币 counts: 新星 8 / 流星 16 / 彗星 24 / 恒星 36, plus 得分加成 24.
6. **Foul skips StarZone** — no 落点加成; that shot is **0 星币**.
7. **Continue / switch** — legal pocket of 1–8 keeps the table and the same shooter. Miss or foul keeps positions and switches turn in 2P (solo continues). Scratch respots the cue in the kitchen; an illegal 9 is spotted.
8. **Win** — legally pocket the **9** (hit the lowest first). Only then the match settle card appears. **再来一局** is a full rack. Full reset never happens on a miss.

Settle / splash copy is 得分加成 / 落点加成 only — never 倍率开奖 / 中奖 / 翻倍到账 / 押中. Share stub is 分享成绩 (score / rank / 星币). Disclaimer: `虚拟道具，仅限游戏内使用，不可兑换现金`.

## Table art (compliance)

Realistic green felt is OK. StarZones are **abstract patterns** named 新星 / 流星 / 彗星 / 恒星 — not bills, not denominations, not ¥ / 钞 / 红包 / 现金 / 面额.

Rewards are virtual **星币** only.

## Controls

- Drag from the cue ball or felt. Pull back to aim; fire direction is opposite the pull.
- Release to shoot. A short pull cancels.
- Tap **瞄准3D** in the footer (clear of the WeChat capsule) for the stub. 俯视瞄准 stays on.
- Tap **弱AI试杆** for an optional noisy practice shot at the object ball.
- After a win (9 pocketed), tap **再来一局** for a new rack. A miss keeps every ball where it stopped.
- Tap **开房间** then **邀请好友**. WeChat `shareAppMessage` carries `roomId`; the friend joins from the share card. Each shot pushes a minimal table snapshot (memory / storage / optional `wx.cloud` stub).

Max cue power is raised so a kitchen break can reach the rack. Pockets are oversized (`pocketR` ≥ 2× `ballR`) with a wide mouth; centers sit outside the cushion line. Cue / ball / cushion / pocket SFX play when Web Audio is available.

## Layout

```
taiqiu/
  game.js
  game.json
  project.config.json
  js/
    config.json
    fsm.js
    physics.js
    table.js
    tiles.js
    balls.js
    cue.js
    stopDetect.js
    score.js
    session.js
    hud.js
    render.js
    fx.js
    storage.js
    share.js
    sfx.js
    ai.js
    net.js
  dev/preview.html
  test/
  README.md
```

## Local logic check

```bash
node taiqiu/test/m0.test.js
node taiqiu/test/m1.test.js
```

## Browser smoke

```bash
python3 -m http.server 8767 --directory taiqiu
# http://127.0.0.1:8767/dev/preview.html
```
