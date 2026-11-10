// Scribble It: one player draws on their phone, everyone else shouts guesses.
// The drawer taps "Someone guessed it" and picks who. Easy 20, medium 40, hard 60.
import { showResults } from './host.js';

const DRAW_TIME = 75, CHOOSE_TIME = 20, REVEAL_TIME = 4500, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const LEVELS = [{ pts: 20, label: 'Easy' }, { pts: 40, label: 'Medium' }, { pts: 60, label: 'Hard' }];
const DRAWER_SHARE = 0.5; // the drawer earns half the word's points when someone gets it
const WORDS = [
  ['sun', 'house', 'cat', 'tree', 'pizza', 'fish', 'car', 'apple', 'banana', 'umbrella', 'glasses', 'cake', 'moon', 'flower', 'snake', 'ball', 'boat', 'cloud', 'key', 'chair', 'ice cream', 'guitar', 'heart', 'book', 'clock', 'eye', 'door', 'hat', 'star', 'spider', 'bicycle', 'candle', 'egg', 'ladder', 'rainbow', 'shoe', 'cup', 'phone', 'bridge', 'snowman'],
  ['elephant', 'volcano', 'robot', 'pirate', 'skateboard', 'campfire', 'lighthouse', 'mermaid', 'haircut', 'traffic jam', 'toothbrush', 'astronaut', 'popcorn', 'waterfall', 'scarecrow', 'treasure map', 'selfie', 'roller coaster', 'sunburn', 'chef', 'backpack', 'penguin', 'dentist', 'windmill', 'karaoke', 'hot air balloon', 'sandcastle', 'vampire', 'wedding', 'surfing', 'yoga', 'alarm clock', 'ghost', 'airport', 'chopsticks', 'cactus', 'mosquito', 'fireworks', 'laundry', 'tornado'],
  ['jet lag', 'deadline', 'gravity', 'hangover', 'awkward silence', 'wifi', 'déjà vu', 'inflation', 'plot twist', 'midlife crisis', 'procrastination', 'time travel', 'social media', 'black hole', 'brain freeze', 'stand-up comedy', 'bad haircut', 'evolution', 'nightmare', 'first date', 'electricity', 'fake news', 'group project', 'stock market', 'sarcasm', 'monday morning', 'karma', 'small talk', 'homesick', 'blind date', 'writer\'s block', 'peer pressure', 'road rage', 'conspiracy', 'autocorrect', 'food coma', 'internship', 'lost in translation', 'overthinking', 'startup'],
];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function start(ctx) {
  const players = ctx.players, score = new Map(players.map((p) => [p.id, 0]));
  const rounds = players.length <= 4 ? 2 : 1;
  const turns = []; for (let r = 0; r < rounds; r++) for (const p of shuffle(players)) turns.push({ p, round: r + 1 });
  const decks = WORDS.map(shuffle);
  let ti = -1, phase = 'idle', options = null, word = null, pts = 0, strokes = [], ends = 0, timer = 0, tick = 0, pointRows = [], stopped = false;

  const root = document.createElement('div'); root.className = 'sk';
  root.innerHTML = `<div class="board"><div class="paper"><canvas width="1600" height="1200"></canvas><div class="curtain"><div><h3></h3><p></p></div></div></div></div>
    <div class="side"><div class="rnd"></div>
      <div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52"/></svg><div class="timer">–</div></div>
      <div class="who"><i></i><span></span></div><div class="stake"></div><div class="blanks"></div><ol></ol></div><canvas class="confetti"></canvas>`;
  ctx.stage.appendChild(root);
  const cv = root.querySelector('canvas'), cx = cv.getContext('2d'), curtain = root.querySelector('.curtain');
  const q = (s) => root.querySelector(s);
  cx.lineCap = cx.lineJoin = 'round';
  const drawStroke = (s) => { // smooth curve through the midpoints of the phone's sample points
    const p = s.p, X = 1600, Y = 1200; if (!p.length) return; cx.strokeStyle = s.c; cx.lineWidth = s.w * X; cx.beginPath(); cx.moveTo(p[0] * X, p[1] * Y);
    if (p.length === 2) cx.lineTo(p[0] * X + 0.1, p[1] * Y);
    for (let i = 2; i < p.length - 2; i += 2) cx.quadraticCurveTo(p[i] * X, p[i + 1] * Y, (p[i] + p[i + 2]) / 2 * X, (p[i + 1] + p[i + 3]) / 2 * Y);
    if (p.length >= 4) cx.lineTo(p[p.length - 2] * X, p[p.length - 1] * Y);
    cx.stroke();
  };
  const redraw = () => { cx.clearRect(0, 0, 1600, 1200); strokes.forEach(drawStroke); };
  const ringFg = root.querySelector('.ring .fg'), LEN = 2 * Math.PI * 52; ringFg.style.strokeDasharray = LEN;
  function confetti() {
    const c = root.querySelector('.confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#ff4b2b', '#2b7bff', '#ffc62b', '#19c2a0', '#b455ff', '#ff7ac8'], ps = Array.from({ length: 160 }, () => ({ x: innerWidth * (0.2 + Math.random() * 0.4), y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 900, vy: -400 - Math.random() * 700, r: Math.random() * 6, w: 8 + Math.random() * 10, c: cols[Math.floor(Math.random() * 6)], s: (Math.random() - 0.5) * 12 }));
    let t0 = performance.now(), lt = t0; const step = (now) => { const dt = Math.min(0.05, (now - lt) / 1000); lt = now; x.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.vy += 1500 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.s * dt; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); x.restore(); } if (now - t0 < 2600 && !stopped) requestAnimationFrame(step); else x.clearRect(0, 0, c.width, c.height); }; requestAnimationFrame(step);
  }
  const showCurtain = (h, p) => { curtain.style.display = ''; curtain.querySelector('h3').innerHTML = h; curtain.querySelector('p').innerHTML = p || ''; };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function board() {
    const ol = q('ol'); ol.innerHTML = '';
    [...players].sort((a, b) => score.get(b.id) - score.get(a.id)).forEach((p) => { const li = document.createElement('li'); li.innerHTML = `<i style="background:${p.color}"></i><span></span><b>${score.get(p.id)}</b>`; li.children[1].textContent = p.name; ol.appendChild(li); });
  }
  const others = (d) => players.filter((p) => p !== d && p.online);

  function nextTurn() {
    if (stopped) return;
    clearTimeout(timer); ti++;
    while (ti < turns.length && !turns[ti].p.online) ti++;
    if (ti >= turns.length) return finish();
    const { p: d, round } = turns[ti]; phase = 'choose'; strokes = []; redraw();
    options = LEVELS.map((l, i) => ({ w: decks[i].pop() || WORDS[i][Math.floor(Math.random() * WORDS[i].length)], pts: l.pts }));
    q('.rnd').textContent = `Round ${round} of ${rounds} · turn ${ti + 1} of ${turns.length}`;
    q('.who i').style.background = d.color; q('.who span').textContent = d.name + ' draws';
    q('.stake').textContent = '?'; q('.timer').textContent = '–'; q('.ring').classList.remove('low'); ringFg.style.strokeDashoffset = 0; q('.blanks').textContent = ''; board();
    showCurtain(esc(d.name) + ' is up', 'Picking a word…');
    for (const p of players) ctx.to(p.id, p === d ? { m: 'sk_choose', words: options } : { m: 'wait', title: d.name + ' is picking a word', text: 'Get ready to shout your guess.' });
    timer = setTimeout(() => choose(1), CHOOSE_TIME * 1000);
  }
  function choose(i) {
    if (phase !== 'choose') return; clearTimeout(timer);
    const d = turns[ti].p, o = options[Math.max(0, Math.min(2, i | 0))]; word = o.w; pts = o.pts; phase = 'draw';
    curtain.style.display = 'none';
    q('.stake').textContent = `${LEVELS.find((l) => l.pts === pts).label} · ${pts} pts`;
    ends = Date.now() + DRAW_TIME * 1000; ctx.beep(660, 0.15);
    q('.blanks').textContent = word.split(' ').map((w) => w.replace(/[^\s]/g, '_').split('').join(' ')).join('   ');
    for (const p of players) ctx.to(p.id, p === d ? { m: 'sk_draw', word, pts, time: DRAW_TIME, others: others(d).map((x) => ({ id: x.id, name: x.name, color: x.color })) } : { m: 'wait', title: d.name + ' is drawing', text: `Shout your guess out loud! ${pts} points up for grabs.` });
  }
  function reveal(guesser) {
    if (phase !== 'draw') return; phase = 'reveal';
    const d = turns[ti].p;
    if (guesser) {
      score.set(guesser.id, score.get(guesser.id) + pts); score.set(d.id, score.get(d.id) + Math.round(pts * DRAWER_SHARE));
      showCurtain(esc(guesser.name) + ' got it!', `It was <span class="word">${esc(word)}</span>. +${pts} for ${esc(guesser.name)}, +${Math.round(pts * DRAWER_SHARE)} for ${esc(d.name)}.`);
      ctx.beep(880, 0.12); setTimeout(() => ctx.beep(1320, 0.25), 120); confetti();
    } else { showCurtain("Time's up", `It was <span class="word">${esc(word)}</span>.`); ctx.beep(200, 0.4, 'sawtooth'); }
    board();
    for (const p of players) ctx.to(p.id, { m: 'wait', title: guesser ? guesser.name + ' got it!' : "Time's up", text: 'The word was “' + word + '”.' });
    timer = setTimeout(nextTurn, REVEAL_TIME);
  }
  function finish() {
    phase = 'done'; clearInterval(tick);
    const ranked = [...players].sort((a, b) => score.get(b.id) - score.get(a.id));
    pointRows = ranked.map((p, i) => ({ id: p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(ctx.stage, 'SCRIBBLE IT', 'Final scores', ranked.map((p, i) => ({ name: p.name, color: p.color, pts: pointRows[i].pts, extra: score.get(p.id) + ' in-game' })));
    const v = ctx.vip(); for (const p of players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Scribble It is over', text: 'Results are on the big screen.' });
  }
  tick = setInterval(() => {
    if (phase !== 'draw') return;
    const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000)), t = q('.timer');
    if (t.textContent !== String(left)) { t.textContent = left; q('.ring').classList.toggle('low', left <= 10); if (left <= 5 && left > 0) ctx.beep(520, 0.08); }
    ringFg.style.strokeDashoffset = LEN * (1 - Math.max(0, ends - Date.now()) / (DRAW_TIME * 1000));
    if (left <= 0) reveal(null);
  }, 200);
  nextTurn();

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      if (p !== turns[ti]?.p) return;
      if (d.a === 'word') return choose(d.i);
      if (phase !== 'draw') return;
      if (d.a === 'st' && Array.isArray(d.p)) {
        let s = strokes.find((x) => x.n === d.n);
        if (!s) { s = { n: d.n, c: /^#[0-9a-f]{6}$/i.test(d.c) ? d.c : '#14110f', w: Math.min(0.08, Math.max(0.003, +d.w || 0.01)), p: [] }; strokes.push(s); }
        for (const v of d.p) s.p.push(+v || 0);
        redraw();
      } else if (d.a === 'undo') { strokes.pop(); redraw(); }
      else if (d.a === 'clear') { strokes = []; redraw(); }
      else if (d.a === 'guessed') { const g = players.find((x) => x.id === d.id && x !== p); if (g) reveal(g); }
    },
    onLeave(p) { if (phase !== 'done' && p === turns[ti]?.p) { phase = 'idle'; nextTurn(); } },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; clearTimeout(timer); clearInterval(tick); },
  };
}
