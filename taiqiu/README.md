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
7. **Continue / switch** — legal pocket of 1–8 keeps the table and the same shooter. Miss or foul keeps positions and returns to Aim (solo) or switches turn (2P). Scratch only respots the cue in the kitchen; an illegal 9 is spotted.
8. **Win** — legally pocket the **9** (hit the lowest first). Only then the match settle card appears. Full `rack()` is gated to **新开一局 / 再来一局**. 「再来一杆」 / miss continue never racks.

Settle / splash copy is 得分加成 / 落点加成 only — never 倍率开奖 / 中奖 / 翻倍到账 / 押中. Share stub is 分享成绩 (score / rank / 星币). Disclaimer: `虚拟道具，仅限游戏内使用，不可兑换现金`.

## Table art (compliance)

Realistic green felt is OK. StarZones are **abstract patterns** named 新星 / 流星 / 彗星 / 恒星 — not bills, not denominations, not ¥ / 钞 / 红包 / 现金 / 面额.

Rewards are virtual **星币** only.

## Controls

- Splash: **人机对战** (default highlight) and **练习模式** sit side by side. **好友对局** stays below. Neither solo mode starts a room server.
- **人机 · 简单** (`mode=ai`, local): same 9-ball / 20s clock / continue / miss-foul switch / legal-9-wins rules as a friend room. HUD is `昵称 vs 简单AI` and `轮到你 / AI出杆中` — never a fake 好友. The simple AI aims at the current target center with light noise, looks up power by distance, fouls rarely, thinks 0.6–1.2s, then fires through `Cue.strike` (never writes `balls[]` itself). Settle is 你赢了/你输了 plus both 星币; **再来一局 / 返回**. Footer **好友对局** is hidden; no room server.
- **练习** (`mode=practice`): one player keeps the table. A miss does not switch or rerack. No shot clock and no opponent chip. Top bar is `练习` plus this session’s 星币 only. End card is session 星币 + **再来一局** — no 你赢了/你输了 headline, no 返回. Footer **好友对局** is hidden; no room server.
- Drag from the cue ball or felt. Pull back to aim; fire direction is opposite the pull. The dashed preview is long enough to reach a far object ball (`previewLength` 720 / 3 bounces, or 1.25× table diagonal). Power uses on-screen drag length (bezel dead-zone), so a cue on any rail can still hit **满** / 100% without pulling the stick off-screen.
- Release to shoot. A short pull cancels.
- Tap **瞄准3D** in the footer (clear of the WeChat capsule) for the stub. 俯视瞄准 stays on.
- In practice only, tap **弱AI试杆** for an optional noisy shot at the object ball (same `Cue.strike` path).
- After a win (9 pocketed), tap **再来一局** for a new rack. Mid-game **新开一局** is the same full rack. A miss keeps every ball where it stopped and returns to Aim.
- Tap **好友对局** to create a room, then **邀请好友**. WeChat `shareAppMessage` / `onShareAppMessage` carries `query=roomId=XXXXXX&from=invite`. The friend joins from the share card (`onLaunch` + `onShow` + `getEnterOptionsSync`). While aiming, the shooter posts `POST /room/aim` `{roomId, shotSeq, angle, power, aimLine?}` (~140ms, Aim|Pull only, never mutates `balls[]`) so the waiting seat draws a live semi-transparent cue + dashed line + 「对方瞄准中」. After the balls stop, `shot` still carries the full table. Legal 1–8 keeps the shooter; miss / foul / server `foulCode=shotClock` (20s `deadlineAt`) switches without rerack. The client **displays** remaining seconds only — it does not locally force a handoff. HUD **音乐** toggles the original procedural lounge loop (default on; not 羊了个羊; does not cover cue / pocket SFX).

Max cue power is raised so a kitchen break can reach the rack. Pockets are oversized (`pocketR` ≥ 1.85× `ballR`, corners ~2.1×) with a wide mouth; centers sit on/outside the cushion nose (not inset onto the cloth). Cue / ball / cushion / pocket SFX play when Web Audio is available.

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
    roomApi.js
    net.js
    roomStore.js
  cloudfunctions/taiqiuRoom/
  dev/preview.html
  dev/room-server.js
  test/
  README.md
```

## Friend 2P (turn-based)

Client: `js/roomApi.js`. `js/config.json` → `room.roomApiBase`:

- **empty** → `LocalMockRoom` (in-memory + `wx` / `localStorage`). Same client, no backend.
- **set** (e.g. `http://127.0.0.1:8788`) → `fetch` / `wx.request` the real HTTP API.

Turn rules (authoritative on the room): pocket 1–8 continues; miss or foul switches; first legal 9 wins. Host/guest only submit a shot on their own turn. Aim is disabled with **对方击球** when it is not your turn. Solo still uses `continueShot` and never reracks on a miss.

### API shapes (mock and real)

| action | HTTP | body | response |
| --- | --- | --- | --- |
| create | `POST /room/create` | optional `{ balls, scores, targetN }` | `{ roomId, role: "host", state }` |
| join | `POST /room/join` | `{ roomId }` | `{ role: "guest", state }` |
| shot | `POST /room/shot` | `{ roomId, shotSeq, aimAngle, power, spin?, events[], ballsSnapshot }` | `{ state }` |
| aim | `POST /room/aim` | `{ roomId, shotSeq, angle, power, aimLine? }` — only when `turnOpenId===me` and phase Aim\|Pull | `{ state }` dirty `aim{angle,power,aimLine,updatedAt}`; object-ball coords stripped; `shotSeq` unchanged |
| state | `GET /room/state?roomId=&sinceSeq=` | — | `deadlineAt`, `nicknames{host,guest}`, `winnerOpenId?`, `stars{host,guest}`, `foulCode?`, `foulHint`, `pocketScore`, `zoneBonus`, `turnOpenId`. Aim/Pull + `sinceSeq>=shotSeq` omits non-cue ball coords |

`events[]` examples: `{ type: "miss" }`, `{ type: "legal" }`, `{ type: "pocket", n: 1, legal: true }`, `{ type: "foul" }`, `{ type: "nine", legal: true }`. `ballsSnapshot` is the felt-normalized table after the balls stop (`nx`, `ny`). Waiting-seat shots return `{ ok: false, reason: "not-your-turn" }`.

`state.turn` is `0` (host) / `1` (guest). `state.turnRole` is `"host"` / `"guest"`.

### Flip to a real backend

1. Keep the same client. Do not change shot / HUD code.
2. Set `js/config.json` → `room.roomApiBase` to your origin (no trailing slash), **or** open preview with `?api=https://your-host`.
3. Implement the four paths above. The client already posts `shotSeq`, aim, power, optional spin, `events[]`, and `ballsSnapshot`.
4. Optional local stand-in: `node taiqiu/dev/room-server.js 8788` then `?api=http://127.0.0.1:8788`. Bind host defaults to `0.0.0.0` (`HOST` / `TAIQIU_ROOM_HOST`, or argv `[port] [host]`); tests can still pass `{ host: '127.0.0.1' }`.

Empty `roomApiBase` always uses the mock, even if a cloud env is listed.

### Docker / 局域网房间服

在 `taiqiu/` 目录一键起房间服（容器听 `0.0.0.0:8788`）：

```bash
docker build -t taiqiu-room .
docker run --rm -p 8788:8788 taiqiu-room
# 或: docker compose up --build
```

客户端把 `js/config.json` → `room.roomApiBase`（或预览 `?api=`）设为 `http://<电脑局域网IP>:8788`，不要填 `127.0.0.1`（手机访问的是自己）。微信开发者工具开发版请勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。

**8788 + 双机复测邀请加入：**

1. 电脑起房间服：`node taiqiu/dev/room-server.js 8788`（或 Docker `8788:8788`）。
2. 两台设备 / 两个模拟器都把 `room.roomApiBase` 指到 `http://<电脑局域网IP>:8788`（预览可用 `?api=`）。
3. 主机：进游戏 → **好友对局**（先开房）→ **邀请好友**。分享卡片 query 必须是 `roomId=XXXXXX&from=invite`。开房失败时不要发出空邀请。
4. 好友：从分享卡片打开（冷启动走 `onLaunch` / `getLaunchOptionsSync`，热启动走 `onShow`）。应直接 `mode=room` 并 `POST /room/join`，不能先落单机/菜单。
5. 成功：双方同一 `roomId`、能看到对方昵称、主机先手。失败：可见 toast + **重新加入**，不是静默回菜单。

### How to test mock 2P (two pages / two simulators)

**Two browser pages (recommended for mock):** they share `localStorage`.

```bash
python3 -m http.server 8767 --directory taiqiu
```

1. Page A: http://127.0.0.1:8767/dev/preview.html — tap **好友对局**. Copy the 6-char room id.
2. Page B: http://127.0.0.1:8767/dev/preview.html?roomId=XXXXXX — launch query joins as guest.
3. Same table: A shoots, B sees the balls after poll (~450ms). Miss / foul → B's turn. Legal 1–8 → A continues. Legal 9 → match over.

Page A can also tap **邀请好友**. Share query is `roomId=XXXXXX&from=invite` — a share without `roomId` is a bug. The friend must join from `onLaunch` / `onShow` / `getEnterOptionsSync` (`query.roomId`, or `referrerInfo.extraData`). Join failure shows a toast (房间无效 / 已满 / 服务器连不上) and **重新加入**.

**Two WeChat simulators:** each simulator has its own `wx` storage, so the mock will **not** sync between them. Either:

- open two **browser** pages as above, or
- set `room.roomApiBase` (or `?api=`) to a running `dev/room-server.js` so both simulators talk to one HTTP room.

In DevTools: compile `taiqiu/`, tap **好友对局** on simulator A, share / copy `roomId`, launch simulator B with query `roomId=XXXXXX` (or a share card). After join, only the current seat can aim.

**Same-process tests** (CI): `node taiqiu/test/m1.test.js` covers LocalMockRoom create/join, miss switch, pocket continue, and out-of-turn reject.

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
