# 晚一步（Late Step）M0

微信原生小游戏壳：侧视自动跑、跳 / 冲刺、种子地形。固定物理步长 `dt = 1/60`。

本里程碑不含残影回放、擦肩得分、本地最高分 UI、分享卡片（对应模块仅 stub）。

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
- 撞上矮箱 / 高箱或掉进缺口会结束本局，点「再来一局」用新种子重开。

## 包体与栈

- 微信原生小游戏 + Canvas 2D，无 Cocos / 无重型引擎。
- 纯客户端，无服务端。
- 仅填充矩形绘制，无大图 / Spine / 音频包，主包远低于 2MB。

## 物理

`game.js` 用 `requestAnimationFrame` 累加真实帧间隔，只以 `config.fixedDt`（`0.0166666667`）步进 `runner.step`。不要用裸 rAF delta 做积分。
