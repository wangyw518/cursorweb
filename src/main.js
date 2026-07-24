import { Game } from './game/Game.js';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');

const game = new Game({ canvas, hud, overlay });
game.start();

// 防止移动端橡皮筋滚动影响手感
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.target.closest('.overlay')) return;
    e.preventDefault();
  },
  { passive: false },
);
