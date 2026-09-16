# 星轨 Star Trail

夜空点星、连线成环的微信小游戏。纯客户端，本地最高分。

轻点星辰按顺序织成轨迹；回到第一颗星闭合（至少 4 颗）即清算环内与线上的星，连击加分。轨迹被夜风拉断，或 60 秒夜尽，进入结算。

## 微信开发者工具导入

1. 打开 **微信开发者工具** → 小游戏 / 导入
2. 选择本目录 **`xinggui/`**（不要选仓库根目录）
3. AppID：`wxc8683bd9c1599d7d`
4. 确认 `project.config.json` 中 `compileType` 为 `game`
5. 真机或模拟器运行即可。预览包应远小于 2MB

入口：`game.js` + `game.json`。`dev/` 与 `test/` 已从分包忽略列表排除。

## 浏览器冒烟

在 `xinggui/` 下：

```bash
python3 -m http.server 4173
```

打开 [http://localhost:4173/dev/](http://localhost:4173/dev/) 。可选 `?seed=demo` 固定星图。

## 测试

```bash
node test/run.js
```

## 玩法

- 点星连线，顺序即轨迹
- 闭合回起点：爆发清星、连击
- 选中星若漂得太远，轨断
- 主按钮：**再织一轨**

## 模块

`js/stars.js` `trail.js` `attract.js` `score.js` `fx.js` `session.js` `hud.js` `storage.js` `sky.js` `platform.js` · `config.json`
