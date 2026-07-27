import { clear, el, resultPanel, toast } from '../shared/dom.js';

export const whoLies = {
  id: 'who-lies',
  name: '谁在说谎',
  tagline: '1.2 秒点穿骗子',
  vibe: '极速推理 · 手速',
};

const FACES = ['😎', '🤓', '😤', '😇', '🫣', '😈', '🧐', '😮'];
const LINES = [
  { text: '我昨天通宵改 bug', truth: false },
  { text: '会议室被占用了', truth: true },
  { text: '这需求我刚听到', truth: false },
  { text: '测试环境挂了', truth: true },
  { text: '我邮件回过了', truth: false },
  { text: '客户自己改了需求', truth: true },
  { text: '我在地铁上', truth: false },
  { text: '文档在共享盘', truth: true },
];

export function mountWhoLies(root) {
  let round = 0;
  let score = 0;
  let streak = 0;
  let timer;
  let timeLeft;
  let options;
  let liarIndex;
  let locked;
  const TOTAL = 10;
  const WINDOW = 1.2;

  const stage = root;
  clear(stage);

  function nextRound() {
    locked = false;
    round += 1;
    if (round > TOTAL) {
      finish();
      return;
    }
    // 三张脸：两真一假 或 两假一真？规则：只有一句假话，点假话
    const pool = LINES.slice().sort(() => Math.random() - 0.5).slice(0, 6);
    const lie = pool.find((l) => !l.truth) || { text: '我从不摸鱼', truth: false };
    const truths = pool.filter((l) => l.truth).slice(0, 2);
    while (truths.length < 2) truths.push({ text: '服务器在重启', truth: true });
    options = [lie, ...truths].sort(() => Math.random() - 0.5);
    liarIndex = options.findIndex((o) => !o.truth);
    timeLeft = WINDOW;
    render();
    clearInterval(timer);
    timer = setInterval(() => {
      timeLeft -= 0.05;
      const bar = stage.querySelector('[data-timer]');
      if (bar) bar.style.width = `${Math.max(0, (timeLeft / WINDOW) * 100)}%`;
      if (timeLeft <= 0) {
        clearInterval(timer);
        miss('超时');
      }
    }, 50);
  }

  function pick(i) {
    if (locked) return;
    locked = true;
    clearInterval(timer);
    if (i === liarIndex) {
      streak += 1;
      const gain = 100 + streak * 20 + Math.floor(timeLeft * 80);
      score += gain;
      toast(stage, `识破！+${gain}`);
      setTimeout(nextRound, 350);
    } else {
      miss('指错人');
    }
  }

  function miss(reason) {
    locked = true;
    streak = 0;
    toast(stage, `${reason}，骗子是「${options[liarIndex].text}」`);
    setTimeout(nextRound, 650);
  }

  function finish() {
    stage.append(
      resultPanel({
        title: score >= 1200 ? '测谎仪' : score >= 700 ? '眼神不错' : '被骗惨了',
        body: `10 轮得分 ${score}。同题模式可之后加种子挑战好友。`,
        actions: [
          {
            label: '再测 10 轮',
            primary: true,
            onClick: () => {
              stage.querySelector('.panel')?.remove();
              round = 0;
              score = 0;
              streak = 0;
              nextRound();
            },
          },
          { label: '回大厅', onClick: () => history.back() },
        ],
      }),
    );
  }

  function render() {
    clear(stage);
    const hud = el('div', { className: 'hud-top' });
    hud.innerHTML = `<span>轮次 <strong>${round}/${TOTAL}</strong></span><span>得分 <strong>${score}</strong></span><span>连击 <strong>${streak}</strong></span>`;
    stage.append(hud);

    const body = el('div', {
      style: 'position:absolute;inset:44px 0 0;display:flex;flex-direction:column;padding:8px 0 12px;z-index:3',
    });
    body.append(
      el('div', {
        style: 'margin:0 16px 8px;color:#9db5a8;font-size:13px;text-align:center',
        text: '三句话里只有一句假话，快指出说谎的人',
      }),
    );
    const timerBg = el('div', {
      style: 'margin:0 16px 10px;height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;flex:0 0 auto',
    });
    timerBg.append(el('div', { 'data-timer': '1', style: `height:100%;width:100%;background:#ffb020` }));
    body.append(timerBg);

    const faces = el('div', { className: 'faces', style: 'flex:1;align-content:center' });
    options.forEach((opt, i) => {
      const face = FACES[(round * 3 + i) % FACES.length];
      faces.append(
        el('button', { className: 'face-btn', onClick: () => pick(i) }, [
          el('div', { className: 'emoji', text: face }),
          el('div', { className: 'bubble', text: opt.text }),
        ]),
      );
    });
    body.append(faces);
    stage.append(body);
  }

  stage.append(
    resultPanel({
      title: '谁在说谎',
      body: '每轮 1.2 秒：三张脸各说一句，只有一句是假的。点中骗子加分，连击加成。',
      actions: [
        {
          label: '开始识破',
          primary: true,
          onClick: () => {
            stage.querySelector('.panel')?.remove();
            round = 0;
            score = 0;
            streak = 0;
            nextRound();
          },
        },
      ],
    }),
  );

  return () => {
    clearInterval(timer);
    clear(root);
  };
}
