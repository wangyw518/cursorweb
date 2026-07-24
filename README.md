# 摸鱼判官

微信小游戏（含浏览器高保真预览）。三关卡点 + 同种子挑战好友，专为群聊自传播设计。

## 快速体验（浏览器）

```bash
npm install
npm run dev
```

打开终端提示的本地地址。可用挑战链接自测：

```
http://localhost:5173/?seed=abc123&lv=3
```

## 微信小游戏

```bash
npm run build:minigame
```

用**微信开发者工具**导入 `minigame-dist/`（或直接导入仓库内 `minigame/` 做原生调试）。

- 游客 AppID 可预览玩法
- 正式发布把 AppID 写入 `.env` / `project.config.json`

## 架构要点

| 层 | 技术 | 作用 |
|----|------|------|
| 玩法权威 | 端上 Canvas + 种子 RNG | 对局零网络，触摸反馈低延迟 |
| Web 预览 | Vite + Canvas/DOM HUD | 快速迭代 UI / 分享链路 |
| 微信包 | 纯 Canvas 小游戏 | 无 DOM，真机可跑 |
| 平台桥 | `src/platform/bridge.js` | 分享 / 存储 / 广告适配 |

设计细节见 [`docs/DESIGN.md`](docs/DESIGN.md)（第 3 关参数、文案库、分享回流图）。

## 需要你提供的配置

复制 `.env.example` → `.env`，按需填写：

### 必填（要上线微信时）

1. **`VITE_WECHAT_APP_ID`**  
   微信公众平台 → 小游戏账号 → 开发管理 → AppID  
   （没有的话先注册：https://mp.weixin.qq.com/ ）

2. **分享图 `VITE_SHARE_IMAGE_URL`**  
   建议 500×400 PNG。可用包内 `public/share-cover.svg` 导出，或换成你们的品牌图。

### 强烈建议（要靠广告变现时）

3. **`VITE_REWARD_AD_UNIT_ID`**  
   流量主开通后创建的**激励视频**广告位 ID。  
   未配置时：开发模式会「模拟看完广告」，方便自测复活/开天眼。

### 可选（非传播必需）

4. **`VITE_CLOUD_ENV_ID`**（微信云开发环境）——以后做群排行榜再用  
5. **`VITE_API_BASE_URL`**——自建榜/反作弊；**当前玩法不依赖**

### 你暂时不用提供

- 服务器 / 数据库（对局全本地）
- 登录体系（可先用微信匿名）
- 素材外包（角色为程序化绘制，后续再换立绘）

## 目录

```
src/                 浏览器版完整实现
minigame/            微信小游戏原生包
docs/DESIGN.md       难度 / 文案 / 分享路径
.env.example         配置模板
```

## 调难度

只改 `src/game/data/levels.js` 与 `minigame/js/data.js` 的 L3 参数（保持两边一致）。优先改 `decisionWindowMs`、`conflictChance`。
