import { clear, el, resultPanel, toast } from '../shared/dom.js';

export const fourWords = {
  id: 'four-words',
  name: '一句搞定',
  tagline: '只准回四个字',
  vibe: '嘴炮 RPG · 三回合',
};

const SCENES = [
  {
    title: '催稿风暴',
    foe: '产品经理',
    hp: 100,
    prompt: '「明天上线，今天必须出」',
    answers: [
      { text: '今晚加班', dmg: 28, reply: '那你出个时间表' },
      { text: '另约时间', dmg: 36, reply: '……行，我去顶一下' },
      { text: '你先说清', dmg: 42, reply: '需求被你问崩了' },
      { text: '做不到啊', dmg: 12, reply: '态度不好记一笔' },
    ],
  },
  {
    title: '相亲突袭',
    foe: '七大姑',
    hp: 110,
    prompt: '「对方条件不错，你啥想法」',
    answers: [
      { text: '再看看吧', dmg: 30, reply: '看看？你都看三年了' },
      { text: '先加个微信', dmg: 22, reply: '行，我这就推' },
      { text: '我有对象', dmg: 48, reply: '啊？什么时候的事！' },
      { text: '吃了吗您', dmg: 15, reply: '别岔开话题' },
    ],
  },
  {
    title: '讨债现场',
    foe: '借钱不还的兄弟',
    hp: 120,
    prompt: '「再缓缓，下个月一定」',
    answers: [
      { text: '转账截图', dmg: 40, reply: '兄弟你狠' },
      { text: '写欠条吧', dmg: 34, reply: '……好' },
      { text: '当我借你', dmg: 8, reply: '你真是好人' },
      { text: '报警行吗', dmg: 50, reply: '别别别我现在转' },
    ],
  },
];

export function mountFourWords(root) {
  let sceneIdx = 0;
  let hp;
  let turn;
  let custom;
  const stage = el('div', { className: 'stage' });
  root.append(stage);

  function scoreCustom(text) {
    const t = text.replace(/\s/g, '');
    if ([...t].length !== 4) return 0;
    let dmg = 20;
    if (/不|别|滚|警|钱|截|微|加/.test(t)) dmg += 12;
    if (/哈|嗯|哦|啊/.test(t)) dmg -= 8;
    return Math.max(8, Math.min(55, dmg + Math.floor(Math.random() * 10)));
  }

  function render() {
    clear(stage);
    const scene = SCENES[sceneIdx];
    const hud = el('div', { className: 'hud-top' });
    hud.innerHTML = `<span>${scene.title}</span><span>敌方 <strong>${scene.foe}</strong></span><span>回合 <strong>${turn}/3</strong></span>`;
    stage.append(hud);

    const card = el('div', {
      style:
        'margin:56px 16px 0;padding:18px;border-radius:16px;background:rgba(12,20,16,.88);border:1px solid rgba(214,255,63,.25)',
    });
    card.append(el('p', { text: scene.prompt, style: 'margin:0 0 12px;font-size:16px;font-weight:800' }));
    const barBg = el('div', { style: 'height:10px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden' });
    barBg.append(
      el('div', {
        style: `height:100%;width:${Math.max(0, (hp / scene.hp) * 100)}%;background:#ff5c6a;transition:width .2s`,
      }),
    );
    card.append(el('div', { style: 'color:#9db5a8;font-size:12px;margin-bottom:6px', text: `HP ${Math.max(0, hp)}/${scene.hp}` }));
    card.append(barBg);
    stage.append(card);

    const dock = el('div', { className: 'dock' });
    const grid = el('div', { className: 'choice-grid' });
    for (const a of scene.answers) {
      grid.append(
        el('button', {
          text: a.text,
          onClick: () => attack(a.text, a.dmg, a.reply),
        }),
      );
    }
    dock.append(grid);
    const row = el('div', { className: 'input-row', style: 'margin-top:8px' });
    const input = el('input', { maxlength: '4', placeholder: '自制四字' });
    custom = input;
    row.append(input);
    row.append(
      el('button', {
        className: 'btn btn-primary',
        text: '发出',
        style: 'width:88px',
        onClick: () => {
          const text = input.value.trim();
          const dmg = scoreCustom(text);
          if (!dmg) return toast(stage, '必须正好四个字');
          attack(text, dmg, dmg > 35 ? '被你噎住了' : '……');
        },
      }),
    );
    dock.append(row);
    stage.append(dock);
  }

  function attack(text, dmg, reply) {
    hp -= dmg;
    toast(stage, `「${text}」 -${dmg}！${reply}`);
    turn += 1;
    if (hp <= 0) {
      stage.append(
        resultPanel({
          title: '一句话搞定',
          body: `你用「${text}」击溃了对方。可晒金句进群。`,
          actions: [
            { label: '下一场景', primary: true, onClick: () => next(true) },
            { label: '回大厅', onClick: () => history.back() },
          ],
        }),
      );
      return;
    }
    if (turn > 3) {
      stage.append(
        resultPanel({
          title: '没能说赢',
          body: `对方还剩 ${hp} HP。换四个更狠的字再来。`,
          actions: [
            { label: '重开本场景', primary: true, onClick: () => beginScene() },
            { label: '换场景', onClick: () => next(false) },
          ],
        }),
      );
      return;
    }
    render();
  }

  function beginScene() {
    const scene = SCENES[sceneIdx];
    hp = scene.hp;
    turn = 1;
    clear(stage);
    render();
  }

  function next(won) {
    sceneIdx = (sceneIdx + 1) % SCENES.length;
    beginScene();
  }

  stage.append(
    resultPanel({
      title: '一句搞定',
      body: '每个冲突只能打三回合，每回合回四个字。点现成句，或自己输入四字暴击。',
      actions: [{ label: '开战', primary: true, onClick: () => beginScene() }],
    }),
  );

  return () => clear(root);
}
