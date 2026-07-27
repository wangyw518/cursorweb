import { clear, el, resultPanel, toast } from '../shared/dom.js';

/** 最后一格：回合制占格，把对手逼到无处可下即赢；可下「坑格」让对方踩雷 */
export const lastTile = {
  id: 'last-tile',
  name: '最后一格',
  tagline: '把坑留给下一个人',
  vibe: '坑人棋 · 对战 AI',
};

export function mountLastTile(root) {
  const COLS = 6;
  const ROWS = 7;
  let board;
  let turn; // 'you' | 'ai'
  let trapsLeft;
  let selectedMode; // 'place' | 'trap'
  let over;
  let raf;
  let particles = [];

  const stage = root;
  clear(stage);
  const canvas = el('canvas');
  const hud = el('div', { className: 'hud-top' });
  stage.append(canvas, hud);
  let started = false;
  let dock = null;

  const ctx = canvas.getContext('2d');
  let cssW = 0;
  let cssH = 0;

  function resize() {
    const r = stage.getBoundingClientRect();
    cssW = r.width;
    cssH = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function reset() {
    board = Array.from({ length: ROWS * COLS }, () => null);
    // 预留一些障碍，让终盘更像「最后几格」
    const blocked = new Set();
    while (blocked.size < 8) blocked.add(Math.floor(Math.random() * board.length));
    for (const i of blocked) board[i] = { type: 'block' };
    turn = 'you';
    trapsLeft = { you: 2, ai: 2 };
    selectedMode = 'place';
    over = false;
    particles = [];
    if (started) mountDock();
    else dock?.remove();
    renderHud();
  }

  function emptyCells() {
    return board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  }

  function end(win, reason) {
    over = true;
    stage.append(
      resultPanel({
        title: win ? '你坑成功了' : '你被坑了',
        body: reason,
        actions: [
          { label: '再来一局', primary: true, onClick: () => { stage.querySelector('.panel')?.remove(); reset(); } },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function place(idx, who, asTrap) {
    if (over || board[idx]) return false;
    board[idx] = { type: asTrap ? 'trap' : 'stone', owner: who, revealed: !asTrap };
    burst(idx, asTrap ? '#ff5c6a' : who === 'you' ? '#d6ff3f' : '#7aa7ff');
    return true;
  }

  function afterMove(who) {
    const empties = emptyCells();
    if (!empties.length) {
      end(who === 'ai', '棋盘填满：最后一手的人赢（你让对方无路可走）');
      return;
    }
    turn = who === 'you' ? 'ai' : 'you';
    renderHud();
    if (turn === 'ai') setTimeout(aiMove, 380);
  }

  function tryStep(idx) {
    if (over || turn !== 'you') return;
    const cell = board[idx];
    if (cell?.type === 'trap' && !cell.revealed) {
      cell.revealed = true;
      toast(stage, '踩到陷阱！额外失去行动');
      // 陷阱触发：跳过你的回合效果 = AI 再走一次感觉，这里直接让 AI 走
      turn = 'ai';
      renderHud();
      setTimeout(aiMove, 400);
      return;
    }
    if (cell) return;
    const asTrap = selectedMode === 'trap' && trapsLeft.you > 0;
    if (asTrap) trapsLeft.you -= 1;
    place(idx, 'you', asTrap);
    selectedMode = 'place';
    mountDock();
    afterMove('you');
  }

  function aiMove() {
    if (over || turn !== 'ai') return;
    const empties = emptyCells();
    if (!empties.length) {
      end(true, 'AI 无子可下，你赢了');
      return;
    }
    // 简单策略：优先把你逼到边角；偶布陷阱
    let idx = empties[Math.floor(Math.random() * empties.length)];
    const cornerish = empties.filter((i) => {
      const x = i % COLS;
      const y = (i / COLS) | 0;
      return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
    });
    if (cornerish.length) idx = cornerish[Math.floor(Math.random() * cornerish.length)];
    const asTrap = trapsLeft.ai > 0 && Math.random() < 0.35 && empties.length <= 12;
    if (asTrap) trapsLeft.ai -= 1;
    place(idx, 'ai', asTrap);
    // 若踩到你的陷阱
    const traps = board
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c?.type === 'trap' && c.owner === 'you' && !c.revealed);
    // AI 不会主动踩未知格以外——已下在空格。检查：无
    afterMove('ai');
  }

  function burst(idx, color) {
    const { x, y, s } = cellRect(idx);
    for (let i = 0; i < 10; i += 1) {
      particles.push({
        x: x + s / 2,
        y: y + s / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        color,
      });
    }
  }

  function cellRect(idx) {
    const pad = 16;
    const bottom = 100;
    const bw = cssW - pad * 2;
    const bh = cssH - pad * 2 - bottom;
    const s = Math.min(bw / COLS, bh / ROWS) - 4;
    const ox = (cssW - (s + 4) * COLS) / 2 + 2;
    const oy = pad + 36;
    const x = ox + (idx % COLS) * (s + 4);
    const y = oy + ((idx / COLS) | 0) * (s + 4);
    return { x, y, s };
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, '#24382f');
    g.addColorStop(1, '#101a16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    for (let i = 0; i < board.length; i += 1) {
      const { x, y, s } = cellRect(i);
      const c = board[i];
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      round(ctx, x, y, s, s, 10);
      ctx.fill();
      if (!c) continue;
      if (c.type === 'block') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        round(ctx, x + 4, y + 4, s - 8, s - 8, 8);
        ctx.fill();
      } else if (c.type === 'trap' && !c.revealed) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        round(ctx, x + 4, y + 4, s - 8, s - 8, 8);
        ctx.fill();
      } else if (c.type === 'trap') {
        ctx.fillStyle = '#ff5c6a';
        round(ctx, x + 6, y + 6, s - 12, s - 12, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('坑', x + s / 2, y + s / 2 + 5);
      } else {
        ctx.fillStyle = c.owner === 'you' ? '#d6ff3f' : '#7aa7ff';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    particles = particles.filter((p) => {
      p.life -= 0.04;
      p.x += p.vx;
      p.y += p.vy;
      if (p.life <= 0) return false;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
      return true;
    });
    raf = requestAnimationFrame(draw);
  }

  function renderHud() {
    hud.innerHTML = `<span>回合 <strong>${turn === 'you' ? '你' : 'AI'}</strong></span><span>空格 <strong>${emptyCells().length}</strong></span><span>陷阱 <strong>${trapsLeft.you}</strong></span>`;
  }

  function mountDock() {
    dock?.remove();
    dock = el('div', { className: 'dock row' }, [
      el('button', {
        className: `btn ${selectedMode === 'place' ? 'btn-primary' : 'btn-secondary'}`,
        text: '落子',
        onClick: () => {
          selectedMode = 'place';
          mountDock();
        },
      }),
      el('button', {
        className: `btn ${selectedMode === 'trap' ? 'btn-danger' : 'btn-secondary'}`,
        text: `埋坑 (${trapsLeft.you})`,
        onClick: () => {
          if (trapsLeft.you <= 0) return toast(stage, '陷阱用完了');
          selectedMode = 'trap';
          mountDock();
        },
      }),
    ]);
    stage.append(dock);
  }

  function onPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
    for (let i = 0; i < board.length; i += 1) {
      const c = cellRect(i);
      if (x >= c.x && x <= c.x + c.s && y >= c.y && y <= c.y + c.s) {
        tryStep(i);
        break;
      }
    }
  }

  canvas.addEventListener('pointerdown', onPointer);
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();
  reset();
  draw();

  stage.append(
    resultPanel({
      title: '最后一格',
      body: '轮流占格。你可埋最多 2 个隐形坑。踩坑会丢掉回合。让对方无路可走就赢。',
      actions: [
        {
          label: '开始坑人',
          primary: true,
          onClick: () => {
            stage.querySelector('.panel')?.remove();
            started = true;
            mountDock();
            resize();
          },
        },
      ],
    }),
  );

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    clear(root);
  };
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
