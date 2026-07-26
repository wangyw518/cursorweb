import { clear, el, resultPanel, toast } from '../shared/dom.js';

export const reverseClear = {
  id: 'reverse-clear',
  name: '倒着通关',
  tagline: '从终点一步步撤回起点',
  vibe: '解谜卡关 · 羊式传播',
};

/** 简易网格：S 起点 G 终点 # 墙 . 路；玩家从 G 开始，沿「合法反走」退回 S */
const LEVELS = [
  [
    '######',
    '#S..G#',
    '######',
  ],
  [
    '#######',
    '#S#..G#',
    '#.#.#.#',
    '#...#.#',
    '#######',
  ],
  [
    '#########',
    '#S..#..G#',
    '##.#.#.##',
    '#..#.#..#',
    '#.##.##.#',
    '#.......#',
    '#########',
  ],
];

export function mountReverseClear(root) {
  let levelId = 0;
  let grid;
  let px;
  let py;
  let sx;
  let sy;
  let steps;
  let maxSteps;
  let path;
  const stage = el('div', { className: 'stage' });
  const canvas = el('canvas');
  stage.append(canvas);
  const hud = el('div', { className: 'hud-top' });
  stage.append(hud);
  root.append(stage);
  const ctx = canvas.getContext('2d');
  let cssW = 0;
  let cssH = 0;
  let raf;

  function parse(level) {
    grid = level.map((r) => r.split(''));
    path = [];
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x] === 'S') {
          sx = x;
          sy = y;
          grid[y][x] = '.';
        }
        if (grid[y][x] === 'G') {
          px = x;
          py = y;
          grid[y][x] = '.';
        }
      }
    }
    path.push([px, py]);
    // 步数上限：最短路 * 1.6 近似，制造卡点
    maxSteps = Math.max(6, Math.floor(bfs() * 1.7));
    steps = 0;
  }

  function bfs() {
    const q = [[px, py, 0]];
    const seen = new Set([`${px},${py}`]);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (q.length) {
      const [x, y, d] = q.shift();
      if (x === sx && y === sy) return d;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        if (!grid[ny] || !grid[ny][nx] || grid[ny][nx] === '#') continue;
        seen.add(key);
        q.push([nx, ny, d + 1]);
      }
    }
    return 12;
  }

  function tryMove(dx, dy) {
    const nx = px + dx;
    const ny = py + dy;
    if (!grid[ny] || !grid[ny][nx] || grid[ny][nx] === '#') {
      toast(stage, '撞墙，路线崩了？');
      return;
    }
    // 禁止立即原路折返超过一次的无聊刷步——允许，但浪费步数
    px = nx;
    py = ny;
    steps += 1;
    path.push([px, py]);
    if (px === sx && py === sy) {
      win();
      return;
    }
    if (steps >= maxSteps) {
      lose();
    }
  }

  function win() {
    const hard = levelId >= 2;
    stage.append(
      resultPanel({
        title: hard ? '倒退大师' : '撤回成功',
        body: `用 ${steps} 步退回起点（上限 ${maxSteps}）。${hard ? '这关可以晒战报了。' : '还有更难的。'}`,
        actions: [
          {
            label: levelId < LEVELS.length - 1 ? '下一关' : '从第 1 关再来',
            primary: true,
            onClick: () => {
              stage.querySelector('.panel')?.remove();
              levelId = levelId < LEVELS.length - 1 ? levelId + 1 : 0;
              parse(LEVELS[levelId]);
            },
          },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function lose() {
    stage.append(
      resultPanel({
        title: '倒退失败',
        body: `步数用尽（${maxSteps}）。差一点点回到起点——很想再试对吧？`,
        actions: [
          {
            label: '不服再倒',
            primary: true,
            onClick: () => {
              stage.querySelector('.panel')?.remove();
              parse(LEVELS[levelId]);
            },
          },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    cssW = r.width;
    cssH = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, cssW, cssH);
    const rows = grid.length;
    const cols = grid[0].length;
    const size = Math.min((cssW - 32) / cols, (cssH - 180) / rows);
    const ox = (cssW - size * cols) / 2;
    const oy = 70;

    // path ghost
    ctx.strokeStyle = 'rgba(94,220,255,0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      const cx = ox + x * size + size / 2;
      const cy = oy + y * size + size / 2;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px0 = ox + x * size;
        const py0 = oy + y * size;
        if (grid[y][x] === '#') {
          ctx.fillStyle = '#2a3540';
        } else {
          ctx.fillStyle = '#1a2430';
        }
        ctx.fillRect(px0 + 1, py0 + 1, size - 2, size - 2);
        if (x === sx && y === sy) {
          ctx.fillStyle = '#d6ff3f';
          ctx.font = `bold ${Math.floor(size * 0.35)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('S', px0 + size / 2, py0 + size * 0.62);
        }
        if (x === path[0][0] && y === path[0][1]) {
          ctx.strokeStyle = '#ffb020';
          ctx.strokeRect(px0 + 4, py0 + 4, size - 8, size - 8);
          ctx.fillStyle = '#ffb020';
          ctx.font = `bold ${Math.floor(size * 0.28)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('终', px0 + size / 2, py0 + size * 0.62);
        }
      }
    }

    // player
    ctx.fillStyle = '#5edcff';
    ctx.beginPath();
    ctx.arc(ox + px * size + size / 2, oy + py * size + size / 2, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    hud.innerHTML = `<span>关卡 <strong>${levelId + 1}/${LEVELS.length}</strong></span><span>倒退 <strong>${steps}/${maxSteps}</strong></span><span>目标 <strong>回到 S</strong></span>`;
    raf = requestAnimationFrame(draw);
  }

  // swipe / buttons
  let sx0;
  let sy0;
  canvas.addEventListener('pointerdown', (e) => {
    sx0 = e.clientX;
    sy0 = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx0;
    const dy = e.clientY - sy0;
    if (Math.hypot(dx, dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
    else tryMove(0, dy > 0 ? 1 : -1);
  });

  const dock = el('div', { className: 'dock row' });
  const mk = (label, dx, dy) =>
    el('button', {
      className: 'btn btn-secondary',
      text: label,
      onClick: () => tryMove(dx, dy),
    });
  // 2x2 pad-ish via 4 buttons in 2 rows - use nested
  clear(dock);
  const pad = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' });
  pad.append(el('div'), mk('上', 0, -1), el('div'), mk('左', -1, 0), mk('下', 0, 1), mk('右', 1, 0));
  dock.append(pad);
  stage.append(dock);

  window.addEventListener('resize', resize);
  resize();
  parse(LEVELS[0]);
  draw();

  stage.append(
    resultPanel({
      title: '倒着通关',
      body: '你出生在终点。滑动/点方向，一步步退回 S。步数不够就会崩——专治「差一点点」。',
      actions: [{ label: '开始倒退', primary: true, onClick: () => stage.querySelector('.panel')?.remove() }],
    }),
  );

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    clear(root);
  };
}
