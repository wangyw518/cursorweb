import { lastTile, mountLastTile } from './games/lastTile.js';
import { redPacket, mountRedPacket } from './games/redPacket.js';
import { elevator, mountElevator } from './games/elevator.js';
import { fourWords, mountFourWords } from './games/fourWords.js';
import { reverseClear, mountReverseClear } from './games/reverseClear.js';
import { whoLies, mountWhoLies } from './games/whoLies.js';
import { clear, el } from './shared/dom.js';

const GAMES = [
  { meta: lastTile, mount: mountLastTile },
  { meta: redPacket, mount: mountRedPacket },
  { meta: elevator, mount: mountElevator },
  { meta: fourWords, mount: mountFourWords },
  { meta: reverseClear, mount: mountReverseClear },
  { meta: whoLies, mount: mountWhoLies },
];

const app = document.getElementById('app');
let unmount = null;

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  if (unmount) {
    unmount();
    unmount = null;
  }
  clear(app);
  const found = GAMES.find((g) => g.meta.id === id);
  if (!found) {
    renderHub();
    return;
  }
  renderShell(found);
}

function renderHub() {
  const grid = el('div', { className: 'game-grid' });
  for (const g of GAMES) {
    grid.append(
      el('button', {
        className: 'game-card',
        onClick: () => {
          location.hash = `#/${g.meta.id}`;
        },
      }, [
        el('b', { text: g.meta.name }),
        el('span', { text: g.meta.tagline }),
        el('i', { text: g.meta.vibe }),
      ]),
    );
  }
  app.append(
    el('div', { className: 'hub' }, [
      el('h1', { className: 'hub-brand', text: '六款试玩厅' }),
      el('p', {
        className: 'hub-lead',
        text: '每款都是可玩原型。点进去真正玩一轮，再决定哪个值得做成微信小游戏。',
      }),
      grid,
    ]),
  );
}

function renderShell(game) {
  const stageHost = el('div', { className: 'stage', id: 'game-root' });
  app.append(
    el('div', { className: 'shell' }, [
      el('div', { className: 'shell-bar' }, [
        el('button', {
          className: 'chip-btn',
          text: '← 大厅',
          onClick: () => {
            location.hash = '#/';
          },
        }),
        el('h1', { text: game.meta.name }),
        el('button', {
          className: 'chip-btn',
          text: '重开',
          onClick: () => route(),
        }),
      ]),
      stageHost,
    ]),
  );
  // override history.back used inside games
  const realBack = history.back.bind(history);
  history.back = () => {
    location.hash = '#/';
  };
  unmount = () => {
    history.back = realBack;
    gameUnmount?.();
  };
  const gameUnmount = game.mount(stageHost);
  unmount = () => {
    history.back = realBack;
    if (typeof gameUnmount === 'function') gameUnmount();
  };
}

window.addEventListener('hashchange', route);
route();

document.addEventListener(
  'touchmove',
  (e) => {
    if (e.target.closest('.hub') || e.target.closest('.elevator-list') || e.target.closest('.panel')) return;
    e.preventDefault();
  },
  { passive: false },
);
