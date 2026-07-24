import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'minigame-dist');

console.log('1/3 Vite build...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('2/3 Assemble WeChat mini-game package...');
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'dist'), resolve(out, 'web'), { recursive: true });
cpSync(resolve(root, 'minigame'), out, { recursive: true });

// 注入说明：小游戏可用 web-view 过渡，或后续用适配器迁移 canvas。
const readme = `# 微信小游戏包（摸鱼判官）

本目录由 \`npm run build:minigame\` 生成。

## 推荐上线路径（两阶段）

### 阶段 A：小程序 WebView 快上（本仓库已支持）
1. 把 \`web/\` 部署到 HTTPS（OSS / 云托管）。
2. 在微信公众平台配置业务域名。
3. 用 \`minigame/game.js\` 打开 web-view 指向你的 HTTPS 地址。
4. 分享 query 带 seed&lv，与现网一致。

### 阶段 B：原生小游戏（低延迟最终态）
将 \`src/game/*\` 迁到小游戏 worker/主域 canvas（API 已通过 platform/bridge 隔离）。
当前逻辑零服务端权威，迁移成本低。

打开微信开发者工具 -> 导入 \`minigame-dist\` -> 填 AppID。
`;
writeFileSync(resolve(out, 'README.md'), readme);

const appId = process.env.VITE_WECHAT_APP_ID || '';
const cfgPath = resolve(out, 'project.config.json');
if (existsSync(cfgPath)) {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  if (appId) cfg.appid = appId;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

console.log('3/3 Done -> minigame-dist/');
