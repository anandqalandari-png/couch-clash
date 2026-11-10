// Punchline: everyone answers silly prompts on their phone, two answers go head to head, the room votes.
import { showResults } from './host.js';

const WRITE_TIME = 80, VOTE_TIME = 22, REVEAL_TIME = 6000, FINAL_WRITE = 50, FINAL_VOTE = 30, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const PROMPTS = [
  'The worst thing to say on a first date', 'A terrible name for a perfume', 'The real reason the group chat went silent', 'What your landlord is definitely hiding',
  'A rejected flavour of ice cream', 'The worst possible wedding hashtag', 'What aliens will say when they finally meet us', 'A bad time to start laughing',
  'The secret ingredient in hostel mess food', 'What your phone would say about you if it could talk', 'The worst superpower to have at a party', 'A terrible slogan for an airline',
  'What you should never say to airport security', 'The title of your autobiography', 'A new rule that would instantly improve group projects', 'The worst thing to hear from your pilot',
  'An honest name for a 9 am lecture', 'The most useless thing to bring on a trip', 'What dogs are actually thinking', 'A bad name for a gym',
  'The worst thing to whisper during a movie', 'What the WiFi password should have been', 'A terrible first line for a cover letter', 'The real meaning of "let\'s circle back"',
  'What your mom says the moment you leave the room', 'A surprisingly bad gift for your boss', 'The worst excuse for being late', 'What LinkedIn would look like if people were honest',
  'A new Olympic sport nobody asked for', 'The worst thing to find in your biryani', 'What "I\'m five minutes away" really means', 'A terrible name for a boy band',
  'The first thing you would do as invisible', 'A warning label that should exist on humans', 'The worst thing to say when meeting your partner\'s parents', 'The first question at every family gathering',
  'An awful theme for a birthday party', 'The worst advice to give a fresher', 'What the Eiffel Tower thinks about tourists', 'A terrible thing to shout in a library',
  'The name of a restaurant that would shut in a week', 'What you actually do when you say you are "working from home"', 'A bad slogan for a dating app', 'The worst emoji to send by accident to your boss',
  'What would make cricket more exciting', 'The most suspicious thing to say to a cab driver', 'A horrible ringtone', 'What you should never Google at work',
  'The real reason nobody replies to the email', 'A bad idea for a startup', 'The worst thing a fortune cookie could say', 'What the Paris metro smells like, in three words',
  'A terrible thing to say after "trust me"', 'The worst person to be stuck in a lift with', 'What goes through your head during a group presentation', 'An honest review of this evening so far',
  'The worst flatmate habit', 'What your suitcase would complain about', 'A rejected title for a Bollywood movie', 'The best excuse to leave a party early',
  'What the waiter is really thinking', 'A terrible name for a baby', 'The worst thing to say during a job interview', 'What you would rename Monday',
];
const FINALS = [
  'Describe this group of friends in one sentence', 'The headline about us in tomorrow\'s newspaper', 'The name of the reality show about this room', 'One rule this group should adopt forever',
  'What we will all be doing in 20 years', 'The worst trip this group could take together', 'A toast for tonight, in one line',
];
const used = new Set();
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function draw(list, k) { let pool = list.filter((p) => !used.has(p)); if (pool.length < k) { for (const p of list) used.delete(p); pool = [...list]; } const out = shuffle(pool).slice(0, k); out.forEach((p) => used.add(p)); return out; }

export function start(ctx) {
  const players = ctx.players, n = players.length, rounds = n <= 6 ? 2 : 1;
  const score = new Map(players.map((p) => [p.id, 0]));
  let phase = 'intro', round = 0, ends = 0, timer = 0, stopped = false, matchups = [], mi = -1, cur = null, fin = null, pointRows = [];
  const root = document.createElement('div'); root.className = 'pl';
  root.innerHTML = `<div class="pl-head"><span class="pl-rnd"></span><span class="pl-timer"></span></div><div class="pl-body"></div><div class="pl-foot"></div>`;
  ctx.stage.appendChild(root);
  const q = (s) => root.querySelector(s), body = q('.pl-body');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const live = () => players.filter((p) => p.online);
  const after = (ms, fn) => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) fn(); }, ms); };
  const chip = (p, extra = '') => `<span class="pl-chip ${extra}"><i style="background:${p.color}"></i>${esc(p.name)}</span>`;
  function foot() { q('.pl-foot').innerHTML = [...players].sort((a, b) => score.get(b.id) - score.get(a.id)).map((p) => `<span class="pl-sc"><i style="background:${p.color}"></i>${esc(p.name)}<b>${score.get(p.id)}</b></span>`).join(''); }
  function setTimer(sec) { ends = sec ? Date.now() + sec * 1000 : 0; q('.pl-timer').textContent = sec || ''; }
  const give = (p, pts) => score.set(p.id, score.get(p.id) + pts);

  function intro() {
    phase = 'intro'; setTimer(0); const mult = round + 1;
    q('.pl-rnd').textContent = `Round ${round + 1} of ${rounds + 1}`;
    body.innerHTML = `<div class="pl-big"><h2>ROUND ${round + 1}</h2><p>Two prompts are on your phone. Be funny.${mult > 1 ? ' Points are doubled.' : ''}</p></div>`;
    foot(); for (const p of players) ctx.to(p.id, { m: 'wait', title: 'Round ' + (round + 1), text: 'Prompts coming up…' });
    ctx.beep(520, 0.12); after(2600, write);
  }
  function write() {
    phase = 'write'; const order = shuffle(live()), texts = draw(PROMPTS, order.length);
    matchups = order.map((p, i) => ({ id: i, prompt: texts[i], a: p, b: order[(i + 1) % order.length], ans: {}, votes: new Map() })); mi = -1;
    for (const p of order) ctx.to(p.id, { m: 'pl_write', color: p.color, prompts: matchups.filter((m) => m.a === p || m.b === p).map((m) => ({ id: m.id, text: m.prompt })), time: WRITE_TIME });
    for (const p of players) if (!order.includes(p)) ctx.to(p.id, { m: 'wait', title: 'Sit tight', text: 'You joined mid-round.' });
    body.innerHTML = `<div class="pl-big"><h2>WRITE!</h2><p>Answer both prompts on your phone.</p><div class="pl-wait"></div></div>`; waitChips(); setTimer(WRITE_TIME);
  }
  const doneWriting = (p) => matchups.filter((m) => m.a === p || m.b === p).every((m) => m.ans[p.id] !== undefined);
  function waitChips() { const el = q('.pl-wait'); if (!el) return; const ps = phase === 'fwrite' ? fin.order : [...new Set(matchups.flatMap((m) => [m.a, m.b]))]; el.innerHTML = ps.map((p) => chip(p, (phase === 'fwrite' ? fin.ans[p.id] !== undefined : doneWriting(p)) ? 'ok' : 'pending')).join(''); }

  function nextMatch() {
    mi++; if (mi >= matchups.length) { round++; return round < rounds ? intro() : finalIntro(); }
    const m = cur = matchups[mi], ta = (m.ans[m.a.id] || '').trim(), tb = (m.ans[m.b.id] || '').trim(); m.ta = ta; m.tb = tb;
    if (!ta && !tb) return nextMatch();
    q('.pl-rnd').textContent = `Round ${round + 1} · ${mi + 1} of ${matchups.length}`;
    body.innerHTML = `<div class="pl-prompt"></div><div class="pl-duel"><div class="pl-card a"><p></p><div class="pl-meta"></div></div><div class="pl-vs">VS</div><div class="pl-card b"><p></p><div class="pl-meta"></div></div></div>`;
    q('.pl-prompt').textContent = m.prompt; q('.pl-card.a p').textContent = ta || '(no answer)'; q('.pl-card.b p').textContent = tb || '(no answer)';
    ctx.beep(600, 0.1);
    m.voters = live().filter((p) => p !== m.a && p !== m.b);
    if (!ta || !tb || !m.voters.length) { phase = 'reveal'; setTimer(0); for (const p of players) ctx.to(p.id, { m: 'wait', title: 'Look up!', text: '' }); return after(1800, reveal); }
    phase = 'vote'; setTimer(VOTE_TIME);
    for (const p of players) ctx.to(p.id, m.voters.includes(p) ? { m: 'pl_vote', color: p.color, prompt: m.prompt, opts: [{ k: 0, text: ta }, { k: 1, text: tb }], time: VOTE_TIME } : { m: 'wait', title: p === m.a || p === m.b ? 'Your answer is up!' : 'Look up!', text: 'The others are voting.' });
  }
  function reveal() {
    const m = cur, mult = round + 1; phase = 'reveal'; setTimer(0);
    const va = [...m.votes].filter(([, k]) => k === 0).map(([id]) => players.find((p) => p.id === id)), vb = [...m.votes].filter(([, k]) => k === 1).map(([id]) => players.find((p) => p.id === id));
    const res = [[m.a, m.ta, va, vb, '.a'], [m.b, m.tb, vb, va, '.b']];
    for (const [who, text, mine, theirs, sel] of res) {
      let pts = mine.length * 100 * mult, tag = '';
      if (text && !(sel === '.a' ? m.tb : m.ta)) { pts = 100 * mult; tag = 'UNOPPOSED'; }
      else if (text && mine.length >= 2 && !theirs.length) { pts += 100 * mult; tag = 'PUNCHLINE!'; }
      if (!text) pts = 0;
      give(who, pts);
      const card = q('.pl-card' + sel); card.classList.toggle('win', mine.length > theirs.length || tag === 'UNOPPOSED'); card.classList.toggle('lose', mine.length < theirs.length || !text);
      card.querySelector('.pl-meta').innerHTML = `<div class="pl-by">${chip(who)}<b>+${pts}</b></div><div class="pl-votes">${mine.map((p) => chip(p, 'sm')).join('')}</div>${tag ? `<div class="pl-stamp">${tag}</div>` : ''}`;
      if (tag === 'PUNCHLINE!') { ctx.sfx('coin'); }
    }
    foot(); ctx.beep(880, 0.12); setTimeout(() => ctx.beep(1175, 0.2), 130);
    for (const p of players) ctx.to(p.id, { m: 'wait', title: 'Look up!', text: '' });
    after(REVEAL_TIME, nextMatch);
  }

  function finalIntro() {
    phase = 'intro'; setTimer(0); q('.pl-rnd').textContent = 'Final round';
    body.innerHTML = `<div class="pl-big"><h2>THE LAST LAUGH</h2><p>One prompt. Everyone answers. Then vote for your favourite.</p></div>`;
    ctx.beep(520, 0.12); after(3000, () => {
      phase = 'fwrite'; fin = { prompt: draw(FINALS, 1)[0], order: shuffle(live()), ans: {}, votes: new Map() };
      for (const p of players) ctx.to(p.id, fin.order.includes(p) ? { m: 'pl_write', color: p.color, prompts: [{ id: 'f', text: fin.prompt }], time: FINAL_WRITE } : { m: 'wait', title: 'Sit tight', text: '' });
      body.innerHTML = `<div class="pl-prompt"></div><div class="pl-big small"><div class="pl-wait"></div></div>`; q('.pl-prompt').textContent = fin.prompt; waitChips(); setTimer(FINAL_WRITE);
    });
  }
  function finalVote() {
    phase = 'fvote'; fin.list = fin.order.filter((p) => (fin.ans[p.id] || '').trim()).map((p) => ({ p, text: fin.ans[p.id].trim() }));
    if (fin.list.length < 2) return finalReveal();
    body.innerHTML = `<div class="pl-prompt"></div><div class="pl-grid">${fin.list.map((a, i) => `<div class="pl-card mini" data-i="${i}"><p></p><div class="pl-meta"></div></div>`).join('')}</div>`;
    q('.pl-prompt').textContent = fin.prompt; fin.list.forEach((a, i) => { root.querySelector(`.pl-card[data-i="${i}"] p`).textContent = a.text; });
    fin.voters = live(); setTimer(FINAL_VOTE);
    for (const p of players) { const opts = fin.list.map((a, i) => ({ k: i, text: a.text, own: a.p === p })).filter((o) => !o.own); ctx.to(p.id, opts.length && p.online ? { m: 'pl_vote', color: p.color, prompt: fin.prompt, opts, time: FINAL_VOTE } : { m: 'wait', title: 'Look up!', text: '' }); }
  }
  function finalReveal() {
    phase = 'reveal'; setTimer(0);
    (fin.list || []).forEach((a, i) => {
      const mine = [...fin.votes].filter(([, k]) => k === i).map(([id]) => players.find((p) => p.id === id)), pts = mine.length * 150; give(a.p, pts);
      const card = root.querySelector(`.pl-card[data-i="${i}"]`); if (!card) return; card.classList.toggle('win', mine.length > 0 && mine.length === Math.max(...fin.list.map((_, j) => [...fin.votes].filter(([, k]) => k === j).length)));
      card.querySelector('.pl-meta').innerHTML = `<div class="pl-by">${chip(a.p)}<b>+${pts}</b></div><div class="pl-votes">${mine.map((p) => chip(p, 'sm')).join('')}</div>`;
    });
    foot(); ctx.beep(880, 0.12); for (const p of players) ctx.to(p.id, { m: 'wait', title: 'Look up!', text: '' });
    after(fin.list && fin.list.length >= 2 ? 7500 : 1500, finish);
  }
  function finish() {
    phase = 'done'; const ranked = [...players].sort((a, b) => score.get(b.id) - score.get(a.id)); pointRows = ranked.map((p, i) => ({ id: p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(ctx.stage, 'PUNCHLINE', 'Funniest in the room', ranked.map((p, i) => ({ name: p.name, color: p.color, pts: pointRows[i].pts, extra: score.get(p.id) + ' in-game' })));
    const v = ctx.vip(); for (const p of players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Punchline is over', text: 'Results are on the big screen.' });
  }
  const tick = setInterval(() => {
    if (!ends) return; const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000)), el = q('.pl-timer');
    if (el.textContent !== String(left)) { el.textContent = left; el.classList.toggle('low', left <= 5); if (left <= 5 && left > 0) ctx.beep(520, 0.06); }
    if (left > 0) return; ends = 0;
    if (phase === 'write') nextMatch(); else if (phase === 'vote') reveal(); else if (phase === 'fwrite') finalVote(); else if (phase === 'fvote') finalReveal();
  }, 200);
  intro();
  window.__pl = { get phase() { return phase; }, get matchups() { return matchups; }, score };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      if (d.a === 'ans') {
        const text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
        if (phase === 'write') { const m = matchups[d.id]; if (m && (m.a === p || m.b === p) && m.ans[p.id] === undefined) { m.ans[p.id] = text; ctx.beep(700, 0.05); waitChips(); if ([...new Set(matchups.flatMap((x) => [x.a, x.b]))].filter((x) => x.online).every(doneWriting)) { ends = 0; q('.pl-timer').textContent = ''; after(600, nextMatch); } } }
        else if (phase === 'fwrite' && fin.order.includes(p) && fin.ans[p.id] === undefined) { fin.ans[p.id] = text; ctx.beep(700, 0.05); waitChips(); if (fin.order.filter((x) => x.online).every((x) => fin.ans[x.id] !== undefined)) { ends = 0; after(600, finalVote); } }
      }
      if (d.a === 'vote') {
        if (phase === 'vote' && cur.voters.includes(p) && !cur.votes.has(p.id) && (d.k === 0 || d.k === 1)) { cur.votes.set(p.id, d.k); ctx.beep(760, 0.05); if (cur.voters.filter((x) => x.online).every((x) => cur.votes.has(x.id))) { ends = 0; after(500, reveal); } }
        else if (phase === 'fvote' && !fin.votes.has(p.id) && fin.list[d.k] && fin.list[d.k].p !== p) { fin.votes.set(p.id, d.k | 0); ctx.beep(760, 0.05); if (fin.voters.filter((x) => x.online).every((x) => fin.votes.has(x.id) || fin.list.every((a) => a.p === x))) { ends = 0; after(500, finalReveal); } }
      }
    },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; clearTimeout(timer); clearInterval(tick); window.__pl = null; },
  };
}
