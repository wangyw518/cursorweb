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

## Loop

Drag the cue (pull back to aim + power) → dashed aim line → fire the cue ball → custom 2D physics (circles, cushions, friction, six pockets).

Simplified **9-ball**: pocket the lowest numbered object ball. After that ball is pocketed the cue ball keeps rolling. When everything stops:

- Legal pocket → award **virtual points / 练习卡 skin progress / 目标格 task bonus**.
- Award is **shot quality first** (pocket success, cushion count, first contact with the target) then the geometric tile under the cue-ball center.
- Miss or scratch (cue pocketed) → **0** that shot. A high tile does not pay if the shot failed.

Settle panel: 本杆得分, 距最佳 / 新纪录, 再来一杆. Best score is stored locally.

Stub **2D / 3D** toggle: 3D is a placeholder camera angle (slight perspective), not a full 3D engine.

## Table art (compliance)

The felt is covered with **geometric tiles** — diamonds, star marks, billiard sights — named:

- 得分区 (一星 / 二星 / 三星)
- 练习卡
- 目标格

Not banknotes. No ¥, no Mao portrait, no China banknote patterns, no 钞 / 红包 / 现金 / 面额 / 提现 / 赌 / 赔率.

## Controls

- Drag from the cue ball or felt. Pull back to aim; fire direction is opposite the pull.
- Release to shoot. A short pull cancels.
- Tap **视角 2D / 3D** to stub-switch camera.
- After settle, tap **再来一杆**.

## Layout

```
taiqiu/
  game.js
  game.json
  project.config.json
  js/
    config.json
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
  dev/preview.html
  test/
  README.md
```

## Local logic check

```bash
node taiqiu/test/physics.test.js
node taiqiu/test/score.test.js
node taiqiu/test/tiles.test.js
node taiqiu/test/session.test.js
node taiqiu/test/compliance.test.js
```

## Browser smoke

```bash
python3 -m http.server 8767 --directory taiqiu
# http://127.0.0.1:8767/dev/preview.html
```
