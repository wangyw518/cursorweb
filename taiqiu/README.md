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

- Drag from the cue ball or felt. Pull back to aim; fire direction is opposite the pull.
- Release to shoot. A short pull cancels.
- Tap **瞄准3D** in the footer (clear of the WeChat capsule) for the stub. 俯视瞄准 stays on.
- Tap **弱AI试杆** for an optional noisy practice shot at the object ball.
- After a win (9 pocketed), tap **再来一局** for a new rack. Mid-game **新开一局** is the same full rack. A miss keeps every ball where it stopped and returns to Aim.
- Tap **好友对局** to create a room, then **邀请好友**. WeChat `shareAppMessage` / `onShareAppMessage` carries `query=roomId=XXXXXX`. Cold start (`onLaunch` / `getLaunchOptionsSync`) and hot start (`onShow`) both join that `roomId`; failure toasts 房间无效 / 房间已满 / 对局已结束. After each shot the client posts `shot` and both sides poll `state`. Legal 1–8 keeps the shooter; miss / foul switches; a miss never reracks.

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
| create | `POST /room/create` | optional `{ balls, scores, targetN, nick, openId, shotClockSec }` | `{ roomId, role: "host", deadlineAt, state, share: { query: "roomId=XXXXXX", path: "?roomId=XXXXXX" } }` |
| join | `POST /room/join` | `{ roomId, nick?, openId? }` | `{ role: "guest", deadlineAt, state }` or `{ ok: false, reason: "missing"\|"full"\|"ended", state? }` |
| aim | `POST /room/aim` | `{ roomId, shotSeq, angle, power, aimLine?, openId? }` | `{ state }` with dirty `aim` only (never writes `balls[]`) |
| shot | `POST /room/shot` | `{ roomId, shotSeq, angle\|aimAngle, power, spin?, events[]?, ballsSnapshot? }` | `{ deadlineAt, angle, power, spin?, shotSeq, phase, impulse, state }` |
| state | `GET /room/state?roomId=` | — | full authoritative snapshot (`state` + `ballsSnapshot`, `turn` / `turnRole` / `turnOpenId`, `shotSeq`, `deadlineAt`, `aim`, `nicknames`, `stars`, `foulCode`, `foulHint`, `winnerOpenId`, `matchOver`, `winner`) |

`events[]` examples: `{ type: "miss" }`, `{ type: "legal" }`, `{ type: "pocket", n: 1, legal: true }`, `{ type: "foul" }`, `{ type: "nine", legal: true }`. `ballsSnapshot` is the felt-normalized table after the balls stop (`nx`, `ny`). Waiting-seat shots / non-consecutive `shotSeq` return `{ ok: false, reason: "not-your-turn"|"stale-seq", state }`. Crediting the waiting seat's `stars` / `scores` returns `{ ok: false, reason: "not-your-score", state }`.

Shot scoring is attributed on the server: this-shot `pocketScore` + `zoneBonus` (or the same fields on `events[]`) are added only to the current `turnOpenId` → `stars.host` or `stars.guest`. Client `stars` are never applied wholesale. The server does **not** invent a constant (especially 32); miss / foul is 0 this shot. `shot` / `state` responses echo `pocketScore`, `zoneBonus`, and cumulative `stars:{host,guest}`. Each client HUD reads only its own key (`host` or `guest`).

P0 extras (same store for HTTP and `cloudfunctions/taiqiuRoom`): default `shotClockSec=20`; create / join / shot / timeout handover issue `deadlineAt = now + shotClockSec`. If the clock expires before `shot`, the server sets `foulCode=shotClock`, switches turn, increments `shotSeq`, does **not** rack, and issues a new deadline. Aim is accepted only for the current `turnOpenId` while `phase` is Aim/Pull; it writes `aim: { angle, power, aimLine, updatedAt }` and must not touch object-ball coordinates. Timeout is settled on `state` poll (client is not the clock authority).

### 观战路径（冲量先发，不上帧同步）

对手看到的不是「断续瞄准 + 最终静帧」，而是：

1. **Aim 脏同步** — 当前座 `POST /room/aim`（默认 ≥180ms 一次），只写 `aim`，不改 `balls[]`。
2. **Shot 冲量** — 出杆当下 `POST /room/shot` 必带 `angle`/`aimAngle` + `power`（`spin` 可选）。成功后 `state.phase=rolling`，并回传本杆 `angle`/`power`/`spin`/`shotSeq`/`impulse`。此时还没有停稳快照。
3. **本地回放** — 对手用同一冲量在本地开物理（不改穿库规则）。
4. **权威纠偏** — 停稳后再 `POST /room/shot` 带 `events[]` + `ballsSnapshot`（可与冲量同 `shotSeq`）。现有计分 / 换手 / 停稳快照逻辑继续。

旧客户端一次把 `reason` + `ballsSnapshot` + 冲量打过来仍然兼容：回包仍带 `angle`/`power`，并直接 settle。

`state.turn` is `0` (host) / `1` (guest). `state.turnRole` is `"host"` / `"guest"`.

### Flip to a real backend

1. Keep the same client. Do not change shot / HUD code.
2. Set `js/config.json` → `room.roomApiBase` to your origin (no trailing slash), **or** open preview with `?api=https://your-host`.
3. Implement the four paths above. The client already posts `shotSeq`, aim, power, optional spin, `events[]`, and `ballsSnapshot`.
4. Optional local stand-in: `node taiqiu/dev/room-server.js 8788` then `?api=http://127.0.0.1:8788`. Bind host defaults to `0.0.0.0` (`HOST` / `TAIQIU_ROOM_HOST`, or argv `[port] [host]`); tests can still pass `{ host: '127.0.0.1' }`.

Empty `roomApiBase` uses `LocalMockRoom` in the browser / Node tests. On WeChat, if `wx.cloud.callFunction` exists, the client calls cloud function `taiqiuRoom` with the **same** `action` + payload as `dev/room-server.js` (`store.dispatch`). LAN `roomApiBase` (8788) always wins over cloud.

`cloudfunctions/taiqiuRoom/index.js` unwraps `wx.callFunction` **or** HTTP-trigger `{ path, body }` and then `store.dispatch` — same create/join/aim/shot/state as `node taiqiu/dev/room-server.js 8788`. The cloud folder keeps a byte-identical `roomStore.js` copy for WeChat upload.

### 复测：好友邀请进房（P0）

分享 query **必须**长这样（小游戏没有 page path，只有 query）：

```
roomId=XXXXXX
```

浏览器第二页 / 预览：

```
http://127.0.0.1:8767/dev/preview.html?roomId=XXXXXX&api=http://127.0.0.1:8788
```

1. 起房服：`node taiqiu/dev/room-server.js 8788`（默认 `0.0.0.0:8788`）。
2. 房主 A：`POST /room/create` `{ "openId":"host-a", "nick":"房主甲" }` → `ok`, 6 位 `roomId`, `share.query="roomId=<id>"`, `share.path="?roomId=<id>"`。
3. 好友 B：`POST /room/join` `{ "roomId":"<id>", "openId":"guest-b", "nick":"好友乙" }` → `ok`，`state.nicknames` 双方可见，`turnOpenId=host-a`（房主先手）。
4. `POST /room/join` `{ "roomId":"NOPE12" }` → `{ ok:false, reason:"missing" }`。满员 `full`、已结束 `ended`，并尽量带权威 `state`。
5. 一键脚本：`node taiqiu/dev/invite-join-check.js` 或 `node taiqiu/dev/invite-join-check.js 8788`。
6. 微信：房主点 **邀请好友**；分享卡片 query 为 `roomId=XXXXXX`。好友冷启动 / 热启动都会 `join`；失败 toast。真机跨设备请部署 `taiqiuRoom` 或两台都指向同一台 `http://<局域网IP>:8788`（不要填 `127.0.0.1`）。

### 复测：好友对局计分（P0）

双机各进一球，双方分数分别增加，且不为锁死 32。左上角各读自己的 `stars` key（房主 `host`，客座 `guest`）。

```bash
node taiqiu/dev/room-server.js 8788
# A 进球（nova = 24+8）
curl -s -X POST http://127.0.0.1:8788/room/shot \
  -H 'content-type: application/json' \
  -d '{"roomId":"<id>","openId":"host-a","shotSeq":1,"reason":"legal","pocketScore":24,"zoneBonus":8}'
# 期望：pocketScore=24 zoneBonus=8 stars={host:32,guest:0}

# A 未进换手后再由 B 进球（meteor = 24+16）
curl -s -X POST http://127.0.0.1:8788/room/shot \
  -H 'content-type: application/json' \
  -d '{"roomId":"<id>","openId":"guest-b","shotSeq":3,"reason":"legal","pocketScore":24,"zoneBonus":16}'
# 期望：stars={host:32,guest:40}，guest 不是 32

node taiqiu/dev/friend-score-check.js
node taiqiu/test/room-score.test.js
```

### 复测：好友观战冲量先发（P0）

```bash
node taiqiu/dev/room-server.js 8788
# 出杆当下（无 ballsSnapshot）
curl -s -X POST http://127.0.0.1:8788/room/shot \
  -H 'content-type: application/json' \
  -d '{"roomId":"<id>","openId":"host-a","shotSeq":1,"angle":0.8,"power":0.65}'
# 期望：phase=rolling，回包 angle=0.8 power=0.65，guest GET /room/state 立刻能读到冲量

# 停稳纠偏
curl -s -X POST http://127.0.0.1:8788/room/shot \
  -H 'content-type: application/json' \
  -d '{"roomId":"<id>","openId":"host-a","shotSeq":1,"reason":"miss","ballsSnapshot":[{"id":"cue","n":0,"nx":0.37,"ny":0.55,"pocketed":false}]}'
# 期望：phase=Aim，guest 读到停稳 balls

node taiqiu/dev/friend-watch-check.js
node taiqiu/test/room-watch.test.js
```

### Docker / 局域网房间服

在 `taiqiu/` 目录一键起房间服（容器听 `0.0.0.0:8788`）：

```bash
docker build -t taiqiu-room .
docker run --rm -p 8788:8788 taiqiu-room
# 或: docker compose up --build
```

客户端把 `js/config.json` → `room.roomApiBase`（或预览 `?api=`）设为 `http://<电脑局域网IP>:8788`，不要填 `127.0.0.1`（手机访问的是自己）。微信开发者工具开发版请勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。同网两台手机即可打 2P。

### How to test mock 2P (two pages / two simulators)

**Two browser pages (recommended for mock):** they share `localStorage`.

```bash
python3 -m http.server 8767 --directory taiqiu
```

1. Page A: http://127.0.0.1:8767/dev/preview.html — tap **好友对局**. Copy the 6-char room id.
2. Page B: http://127.0.0.1:8767/dev/preview.html?roomId=XXXXXX — launch query joins as guest.
3. Same table: A shoots, B sees the balls after poll (~450ms). Miss / foul → B's turn. Legal 1–8 → A continues. Legal 9 → match over.

Page A can also tap **邀请好友** (`shareAppMessage` query `roomId=XXXXXX`).

**Two WeChat simulators:** each simulator has its own `wx` storage, so the mock will **not** sync between them. Either:

- open two **browser** pages as above, or
- set `room.roomApiBase` (or `?api=`) to a running `dev/room-server.js` so both simulators talk to one HTTP room.

In DevTools: compile `taiqiu/`, tap **好友对局** on simulator A, share / copy `roomId`, launch simulator B with query `roomId=XXXXXX` (or a share card). After join, only the current seat can aim.

**Same-process tests** (CI): `node taiqiu/test/m1.test.js` covers LocalMockRoom create/join, miss switch, pocket continue, and out-of-turn reject.

## Local logic check

```bash
node taiqiu/test/m0.test.js
node taiqiu/test/m1.test.js
node taiqiu/test/invite-join.test.js
node taiqiu/dev/invite-join-check.js
```

## Browser smoke

```bash
python3 -m http.server 8767 --directory taiqiu
# http://127.0.0.1:8767/dev/preview.html
```
