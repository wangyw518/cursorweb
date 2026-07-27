import { clear, el, resultPanel, toast } from '../shared/dom.js';

export const elevator = {
  id: 'elevator',
  name: '电梯困局',
  tagline: '超载前决定谁留下',
  vibe: '节奏抉择 · 社死剧情',
};

const CAST = [
  { id: 'boss', name: '老板', weight: 70, keepScore: -40, kickScore: 25, line: '我只是路过…' },
  { id: 'crush', name: '暗恋对象', weight: 55, keepScore: 30, kickScore: -35, line: '好巧…' },
  { id: 'intern', name: '实习生', weight: 50, keepScore: 10, kickScore: -5, line: '我可以挤一挤' },
  { id: 'courier', name: '快递员', weight: 80, keepScore: 15, kickScore: 5, line: '急件！' },
  { id: 'ex', name: '前任', weight: 60, keepScore: -20, kickScore: 20, line: '好久不见啊' },
  { id: 'hr', name: 'HR', weight: 58, keepScore: 5, kickScore: -10, line: '正好聊聊绩效' },
  { id: 'dog', name: '蹭电梯的狗', weight: 25, keepScore: 40, kickScore: -25, line: '汪？' },
  { id: 'you', name: '你自己', weight: 65, keepScore: 0, kickScore: -999, line: '我总不能把自己扔出去' },
];

export function mountElevator(root) {
  const LIMIT = 280;
  let people;
  let timeLeft;
  let score;
  let floor;
  let timer;
  let over;
  let ui = {};

  const stage = root;
  clear(stage);

  function pickPeople() {
    const pool = CAST.filter((c) => c.id !== 'you').sort(() => Math.random() - 0.5).slice(0, 5);
    return [{ ...CAST.find((c) => c.id === 'you') }, ...pool].map((p) => ({ ...p, inCab: true }));
  }

  function weight() {
    return people.filter((p) => p.inCab).reduce((s, p) => s + p.weight, 0);
  }

  function syncMeters() {
    if (!ui.hud) return;
    const w = weight();
    const overload = w > LIMIT;
    ui.hud.innerHTML = `<span>楼层 <strong>${floor}F</strong></span><span>重量 <strong style="color:${overload ? '#ff5c6a' : '#d6ff3f'}">${w}/${LIMIT}</strong></span><span>门禁 <strong>${Math.max(0, timeLeft).toFixed(1)}s</strong></span>`;
    if (ui.bar) ui.bar.style.width = `${Math.min(100, (w / LIMIT) * 100)}%`;
    if (ui.bar) ui.bar.style.background = overload ? '#ff5c6a' : '#ffb020';
    if (ui.closeBtn) ui.closeBtn.textContent = overload ? '超载！关门会失败' : '强制关门出发';
  }

  function render() {
    clear(stage);
    ui = {};
    ui.hud = el('div', { className: 'hud-top' });
    stage.append(ui.hud);

    const meter = el('div', {
      style:
        'position:absolute;top:48px;left:16px;right:16px;height:10px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;',
    });
    ui.bar = el('div', { style: 'height:100%;width:0;background:#ffb020;transition:width .15s' });
    meter.append(ui.bar);
    stage.append(meter);

    const list = el('div', { className: 'elevator-list' });
    for (const p of people) {
      if (!p.inCab && p.id !== 'you') {
        // still show kicked people so you can pull back
      }
      const row = el('div', { className: 'person' }, [
        el('div', {}, [
          el('b', { text: `${p.name}${p.inCab ? '' : '（门外）'}` }),
          el('div', {}, [el('small', { text: `${p.weight}kg · ${p.line}` })]),
        ]),
      ]);
      if (p.id !== 'you') {
        row.append(
          el('button', {
            className: 'btn btn-warm',
            text: p.inCab ? '拖出去' : '拉回来',
            style: 'padding:10px 12px;font-size:13px',
            onClick: () => {
              if (over) return;
              p.inCab = !p.inCab;
              score += p.inCab ? Math.floor(p.keepScore / 4) : p.kickScore;
              toast(stage, p.inCab ? `拉回 ${p.name}` : `请出 ${p.name}`);
              render();
            },
          }),
        );
      }
      list.append(row);
    }
    stage.append(list);

    ui.closeBtn = el('button', {
      className: 'btn btn-primary',
      text: '强制关门出发',
      onClick: () => closeDoor(false),
    });
    stage.append(el('div', { className: 'dock' }, [ui.closeBtn]));
    syncMeters();
  }

  function closeDoor(auto) {
    if (over) return;
    over = true;
    clearInterval(timer);
    const w = weight();
    const inside = people.filter((p) => p.inCab);
    let title = '抵达下一封';
    let body = '';
    if (w > LIMIT) {
      title = '电梯罢工';
      score -= 30;
      body = `超载 ${w - LIMIT}kg，门关不上。得分 ${score}`;
    } else if (inside.some((p) => p.id === 'boss') && inside.some((p) => p.id === 'ex')) {
      title = '名场面';
      score += 20;
      body = `老板和前任同框，你站中间微笑。得分 ${score}`;
    } else if (people.some((p) => p.id === 'crush' && !p.inCab)) {
      title = '错过心动';
      body = `你把暗恋对象留在门外。得分 ${score}`;
    } else {
      title = auto ? '门自己关了' : '稳稳出发';
      score += Math.max(0, 40 - Math.abs(LIMIT - 20 - w));
      body = `载着 ${inside.length} 人上行。得分 ${score}`;
    }
    stage.append(
      resultPanel({
        title,
        body,
        actions: [
          { label: '再坐一趟', primary: true, onClick: () => start() },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function start() {
    people = pickPeople();
    while (weight() <= LIMIT) {
      const extra = CAST.filter((c) => c.id !== 'you' && !people.find((p) => p.id === c.id));
      if (!extra.length) break;
      people.push({ ...extra[Math.floor(Math.random() * extra.length)], inCab: true });
    }
    timeLeft = 12;
    score = 0;
    floor = 1 + Math.floor(Math.random() * 20);
    over = false;
    clearInterval(timer);
    render();
    timer = setInterval(() => {
      if (over) return;
      timeLeft -= 0.1;
      syncMeters();
      if (timeLeft <= 0) closeDoor(true);
    }, 100);
  }

  stage.append(
    resultPanel({
      title: '电梯困局',
      body: '电梯超载了。12 秒内拖人出去或拉回来，再关门。人选会影响结局与得分。',
      actions: [{ label: '挤进去', primary: true, onClick: () => start() }],
    }),
  );

  return () => {
    clearInterval(timer);
    clear(root);
  };
}
