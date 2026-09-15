# 晚一步（Late Step）M0 / M1

微信原生小游戏：侧视自动跑、跳 / 冲刺、种子地形、残影回放。固定物理步长 `dt = 1/60`。

M2（擦肩得分、本地最高分 UI、分享卡片）仍为 stub。

## 在微信开发者工具中打开

1. 安装并打开 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 选择 **小游戏 → 导入**，目录选本文件夹：
   ```
   <repo>/minigame
   ```
   导入根必须是含 `game.js` / `game.json` / `project.config.json` 的 `minigame/`，不要选仓库根目录。
3. AppID 使用：
   ```
   wxc8683bd9c1599d7d
   ```
   （已写在 `project.config.json`，`compileType` 为 `game`。）
4. 模拟器建议横屏。冷启动直接进入可跑场景，无大厅。

## 操作

- 角色自动向前跑。
- **跳**：点屏幕左半边，或左下「跳」。
- **冲**：点屏幕右半边，或右下「冲」（短加速 + 微跳；冷却见 `js/config.json` 的 `dashCdMs`）。
- 撞上矮箱 / 高箱、掉进缺口、或撞上自己的残影会结束本局，点「再来一局」用新种子重开。

## 包体与栈

- 微信原生小游戏 + Canvas 2D，无 Cocos / 无重型引擎。
- 纯客户端，无服务端。
- 仅填充矩形绘制，无大图 / Spine / 音频包，主包远低于 2MB。

## 物理

`game.js` 用 `requestAnimationFrame` 累加真实帧间隔，只以 `config.fixedDt` 步进 `runner.step`。不要用裸 rAF delta 做积分。残影用同一套 `stepKinematics`。

跑速 / 跳速 / 冲刺 / 重力 / 角色尺寸 / 地面高度等手感参数全部在 `js/config.json`（`runSpeed`、`jumpVy`、`dashBoost`、`dashHopVy`、`gravity`、`groundY`、`playerW` / `playerH` 等）。幽灵延迟键保持冻结。调手感只改 config，不要改 `runner.js` 里的魔法数。

## DevTools 手感三项

1. **箱子**：矮箱单跳能过；高箱只跳不稳，冲刺（或冲+跳）才稳。
2. **开局**：前约 3 秒不应因出生点不公连续秒死（前 2 秒 `quietMs` 无残影）。
3. **误触**：左半屏跳、右半屏冲（`controlSplitX`），看半屏点按误触率；也可用左下「跳」/ 右下「冲」。

## M1 残影：如何在开发者工具里验证「死于刚才那一下」

1. 冷启动后先跑 **2 秒**（`quietMs`）。这期间跳 / 冲可以过第一段地形，**不会**生成残影。
2. 存活超过 2 秒后，在较平坦处 **只跳一次**（或只冲一次），然后不要再按。
3. 约 **1.5 秒**（`ghostDelayMs`）后，半透明残影（玩家色、alpha 0.35、最多 2 帧拖影）会沿**刚才那一下的同一物理轨迹**出现在「若只做了那一下」的当前位置。
4. 若你没有用第二次跳 / 冲错开轨迹，会撞上残影 → 残影描边闪一下，结算文案 **「晚了一步」**，再来一局按钮与地形死亡相同。
5. 残影 **4 秒**（`ghostTtlMs`）后消失；同时最多 **8** 个（`ghostCap`），超出丢掉最早的。
