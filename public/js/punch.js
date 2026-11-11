// Punchline: everyone answers silly prompts on their phone, two answers go head to head, the room votes.
// Round 1 is a warm-up, round 2 puts your friends' names into the prompts for double points, and the
// final is one prompt for everybody at triple points. The laptop reads everything out loud (press M to mute).
import { showResults } from './host.js';

const WRITE_TIME = 75, VOTE_TIME = 20, FINAL_WRITE = 50, FINAL_VOTE = 30, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const PROMPTS = [
  'The worst thing to say on a first date', 'A terrible name for a perfume', 'The real reason the group chat went silent', 'What your landlord is definitely hiding',
  'A rejected flavour of ice cream', 'The worst possible wedding hashtag', 'What aliens will say when they finally meet us', 'A bad time to start laughing',
  'The secret ingredient in hostel mess food', 'What your phone would say about you if it could talk', 'The worst superpower to have at a party', 'A terrible slogan for an airline',
  'What you should never say to airport security', 'A new rule that would instantly improve group projects', 'The worst thing to hear from your pilot',
  'An honest name for a 9 am lecture', 'The most useless thing to bring on a trip', 'What dogs are actually thinking', 'A bad name for a gym',
  'The worst thing to whisper during a movie', 'What the WiFi password should have been', 'A terrible first line for a cover letter', 'The real meaning of "let\'s circle back"',
  'What your mom says the moment you leave the room', 'A surprisingly bad gift for your boss', 'The worst excuse for being late', 'What LinkedIn would look like if people were honest',
  'A new Olympic sport nobody asked for', 'The worst thing to find in your biryani', 'What "I\'m five minutes away" really means', 'A terrible name for a boy band',
  'The first thing you would do if you were invisible', 'A warning label that should exist on humans', 'The worst thing to say when meeting your partner\'s parents', 'The first question at every family gathering',
  'An awful theme for a birthday party', 'The worst advice to give a fresher', 'What the Eiffel Tower thinks about tourists', 'A terrible thing to shout in a library',
  'The name of a restaurant that would shut in a week', 'What you actually do when you say you are "working from home"', 'A bad slogan for a dating app', 'The worst emoji to send your boss by accident',
  'What would make cricket more exciting', 'The most suspicious thing to say to a cab driver', 'A horrible ringtone', 'What you should never Google at work',
  'The real reason nobody replies to the email', 'A bad idea for a startup', 'The worst thing a fortune cookie could say', 'What the Paris metro smells like, in three words',
  'A terrible thing to say right after "trust me"', 'The worst person to be stuck in a lift with', 'What goes through your head during a group presentation', 'An honest review of this evening so far',
  'The worst flatmate habit', 'What your suitcase would complain about', 'A rejected title for a Bollywood movie', 'The best excuse to leave a party early',
  'What the waiter is really thinking', 'A terrible name for a baby', 'The worst thing to say during a job interview', 'What you would rename Monday',
  'The worst thing to say when the bill arrives', 'A text you should never send at 2 am', 'What the microwave is doing when you are not looking', 'The least reassuring thing a doctor can say',
  'A terrible opening line for a best man speech', 'What pigeons are planning', 'The worst possible name for a hostel', 'A notification nobody wants to get',
  'The side effect listed last on the medicine box', 'What your plants say about you behind your back', 'The worst prize on a game show', 'A bad thing to realise halfway through a flight',
  'The fastest way to get removed from a WhatsApp group', 'What the autocorrect really wants', 'A truly cursed pizza topping', 'The worst sentence to start with "No offence, but"',
  'What the gym mirror has seen', 'A museum exhibit nobody would visit', 'The most unhelpful thing a GPS could say', 'What "we should catch up soon" actually means',
  'A terrible name for a pet tiger', 'The worst time to hear "oops"', 'A job title that sounds important but means nothing', 'What happens in the last five minutes before a deadline',
];
// {name} is swapped for someone in the room (never one of the two people answering); {name2} for a second person
const PERSONAL = [
  'The real reason {name} is always late', '{name}\'s search history, in three words', 'What {name} is secretly a world champion at', 'The title of {name}\'s autobiography',
  '{name}\'s worst idea for a startup', 'What {name} would get arrested for', 'The last thing {name} Googled', '{name}\'s villain origin story',
  'If {name} launched a perfume, it would smell like…', 'What {name} does when nobody is watching', '{name}\'s dating profile headline', 'The reality show {name} would somehow win',
  '{name}\'s most used emoji, and why', 'What {name} would bring to a desert island', '{name}\'s hidden talent that should stay hidden', 'The excuse {name} gives for not replying',
  'What {name}\'s phone wallpaper should be', 'The warning label that should come with {name}', '{name} as a superhero: name and power', 'What {name} will be famous for in 2040',
  'The one thing {name} should never be put in charge of', 'What {name}\'s alarm clock would say if it could talk', 'A law named after {name} would ban…', '{name}\'s secret second job',
  'What {name} mumbles in their sleep', 'The app that only {name} would download', 'If {name} ran the country for a day, the first decision', '{name}\'s walk-out song',
  'The world record {name} could actually break', '{name}\'s review of this evening, in five words', 'What {name} would name their yacht', '{name}\'s worst cooking disaster',
  'What {name} is thinking right now', 'The Bollywood movie about {name}\'s life is called…', '{name}\'s honest LinkedIn headline', 'The thing {name} will still be explaining in 30 years',
  '{name} and {name2} open a business together. What is it?', 'What {name} and {name2} argue about at 3 am', 'In the heist movie, {name} is the weak link. What goes wrong?',
  '{name} gets one wish from a genie and wastes it on…', 'The group chat name if {name} was the admin', 'What {name} would say in an Oscar speech', '{name}\'s toxic trait, described kindly',
  'A new holiday invented by {name}', 'The only thing that can stop {name}', '{name} writes a self-help book. The title?', 'What {name} and {name2} would name their podcast',
];
const FINALS = [
  'Describe this group of friends in one sentence', 'The headline about us in tomorrow\'s newspaper', 'The name of the reality show about this room', 'One rule this group should adopt forever',
  'What we will all be doing in 20 years', 'The worst trip this group could take together', 'A toast for tonight, in one line', 'The group\'s official motto',
  'The crime this group would commit together, badly', 'What the neighbours think is happening in here', 'The documentary about tonight is called…', 'If this group was a restaurant, the one-star review',
];
const QUIPS = [
  'Three raccoons in a trench coat', 'My lawyer says I cannot answer that', 'Whatever the person next to me wrote', 'Free WiFi and regret', 'Ask me again after chai', 'It was me. I did it.',
  'A PowerPoint about my feelings', '404: joke not found', 'Only on Tuesdays', 'Two words: emotional damage', 'Loud chewing', 'A group project', 'Expired paneer', 'Reply all', 'Crocs with socks',
  'One (1) pigeon', 'Technically legal', 'An uncomfortable amount of glitter', 'The Paris metro at 8 am', 'Unskippable ads', 'Mild panic', 'A very firm handshake', 'Ctrl + Z',
  'Nobody knows, and it is better that way', 'A slightly damp sandwich', 'Seventeen unread voice notes', 'The audacity', 'Vibes, mostly', 'A suspiciously cheap flight', 'Somebody\'s cousin',
];
const EMOJI = ['😂', '💀', '🔥', '👏', '🥱', '🍅'];
const used = new Set();
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function draw(list, k) { let pool = list.filter((p) => !used.has(p)); if (pool.length < k) { for (const p of list) used.delete(p); pool = [...list]; } const out = shuffle(pool).slice(0, k); out.forEach((p) => used.add(p)); return out; }

export function start(ctx) {
  const players = ctx.players, n = players.length;
  const ROUNDS = n <= 6 ? [{ name: 'WARM-UP', sub: 'Two prompts are on your phone. Be funny.', list: PROMPTS, mult: 1 }, { name: 'IT\'S PERSONAL', sub: 'These prompts are about people in this room. Points are doubled.', list: PERSONAL, mult: 2 }]
    : [{ name: 'IT\'S PERSONAL', sub: 'These prompts are about people in this room. Be funny.', list: PERSONAL, mult: 1 }];
  const FINAL_MULT = ROUNDS.length + 1;
  const score = new Map(players.map((p) => [p.id, 0])), lines = [];
  let phase = 'intro', round = 0, ends = 0, timer = 0, stopped = false, matchups = [], mi = -1, cur = null, fin = null, pointRows = [], muted = false;
  try { muted = localStorage.getItem('cc_mute') === '1'; } catch {}
  const root = document.createElement('div'); root.className = 'pl';
  root.innerHTML = `<div class="pl-head"><span class="pl-rnd"></span><span class="pl-mute"></span><span class="pl-timer"></span></div><div class="pl-body"></div><div class="pl-foot"></div>`;
  ctx.stage.appendChild(root);
  const q = (s) => root.querySelector(s), body = q('.pl-body');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const live = () => players.filter((p) => p.online);
  const after = (ms, fn) => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) fn(); }, ms); };
  const chip = (p, extra = '', style = '') => `<span class="pl-chip ${extra}" style="${style}"><i style="background:${p.color}"></i>${esc(p.name)}</span>`;
  function foot() { q('.pl-foot').innerHTML = [...players].sort((a, b) => score.get(b.id) - score.get(a.id)).map((p) => `<span class="pl-sc"><i style="background:${p.color}"></i>${esc(p.name)}<b>${score.get(p.id)}</b></span>`).join(''); }
  function setTimer(sec) { ends = sec ? Date.now() + sec * 1000 : 0; q('.pl-timer').textContent = sec || ''; q('.pl-timer').classList.remove('low'); }
  const give = (p, pts) => score.set(p.id, score.get(p.id) + pts);
  const quip = () => draw(QUIPS, 1)[0];

  // ---------- the host's voice ----------
  const synth = window.speechSynthesis;
  function say(text, fresh) {
    if (muted || !synth) return;
    try { if (fresh) synth.cancel(); const u = new SpeechSynthesisUtterance(String(text).replace(/…/g, ' ')); const vs = synth.getVoices(); u.voice = vs.find((v) => /^en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; u.rate = 1.04; synth.speak(u); } catch {}
  }
  const readMs = (t) => Math.min(6500, 900 + String(t).length * (muted || !synth ? 45 : 68));
  function muteLabel() { q('.pl-mute').textContent = !synth ? '' : muted ? '🔇 Voice off · press M' : '🔊 Voice on · press M to mute'; }
  const onKey = (e) => { if (e.key === 'm' || e.key === 'M') { muted = !muted; try { localStorage.setItem('cc_mute', muted ? '1' : '0'); } catch {} if (muted && synth) synth.cancel(); muteLabel(); } };
  addEventListener('keydown', onKey); muteLabel();
  function float(k) { // a reaction thrown from a phone
    if (!EMOJI[k] || root.querySelectorAll('.pl-float').length > 36) return;
    const s = document.createElement('span'); s.className = 'pl-float'; s.textContent = EMOJI[k]; s.style.left = 4 + Math.random() * 90 + '%'; s.style.setProperty('--dx', (Math.random() * 12 - 6).toFixed(1) + 'vw'); s.style.fontSize = (5 + Math.random() * 4).toFixed(1) + 'vh';
    root.appendChild(s); setTimeout(() => s.remove(), 2700);
  }
  const allReact = (title, text) => { for (const p of players) ctx.to(p.id, { m: 'pl_react', title, text }); };

  // ---------- writing ----------
  function intro() {
    phase = 'intro'; setTimer(0); const R = ROUNDS[round];
    q('.pl-rnd').textContent = `Round ${round + 1} of ${ROUNDS.length + 1}`;
    body.innerHTML = `<div class="pl-big"><h2>${esc(R.name)}</h2><p>${esc(R.sub)}</p></div>`;
    foot(); for (const p of players) ctx.to(p.id, { m: 'wait', title: R.name, text: 'Prompts coming up…' });
    ctx.beep(520, 0.12); say(R.name + '. ' + R.sub, true); after(3600, write);
  }
  function fill(text, a, b) { // put names from the room into a prompt, avoiding the two people who answer it
    const pool = shuffle(live().filter((p) => p !== a && p !== b)), one = pool[0] || a, two = pool[1] || shuffle([a, b])[0];
    return text.replace(/\{name2\}/g, two.name).replace(/\{name\}/g, one.name);
  }
  function write() {
    phase = 'write'; const order = shuffle(live()), texts = draw(ROUNDS[round].list, order.length);
    matchups = order.map((p, i) => { const b = order[(i + 1) % order.length]; return { id: i, prompt: fill(texts[i], p, b), a: p, b, ans: {}, votes: new Map() }; }); mi = -1;
    for (const p of order) ctx.to(p.id, { m: 'pl_write', color: p.color, label: 'Prompt', safe: 1, prompts: matchups.filter((m) => m.a === p || m.b === p).map((m) => ({ id: m.id, text: m.prompt })), time: WRITE_TIME });
    for (const p of players) if (!order.includes(p)) ctx.to(p.id, { m: 'wait', title: 'Sit tight', text: 'You joined mid-round.' });
    body.innerHTML = `<div class="pl-big"><h2>WRITE!</h2><p>Answer both prompts on your phone. Stuck? Tap the dice for a ready-made answer at half points.</p><div class="pl-wait"></div></div>`; waitChips(); setTimer(WRITE_TIME);
  }
  const doneWriting = (p) => matchups.filter((m) => m.a === p || m.b === p).every((m) => m.ans[p.id] !== undefined);
  function waitChips() { const el = q('.pl-wait'); if (!el) return; const ps = phase === 'fwrite' ? fin.order : [...new Set(matchups.flatMap((m) => [m.a, m.b]))]; el.innerHTML = ps.map((p) => chip(p, (phase === 'fwrite' ? fin.ans[p.id] !== undefined : doneWriting(p)) ? 'ok' : 'pending')).join(''); }

  // ---------- head to head ----------
  function nextMatch() {
    mi++; if (mi >= matchups.length) { round++; return round < ROUNDS.length ? intro() : finalIntro(); }
    const m = cur = matchups[mi];
    for (const [who, key] of [[m.a, 'ta'], [m.b, 'tb']]) { const a = m.ans[who.id]; if (a && a.text) { m[key] = a.text; m[key + 'Kind'] = a.safe ? 'safe' : ''; } else { m[key] = quip(); m[key + 'Kind'] = 'auto'; } }
    if (m.taKind === 'auto' && m.tbKind === 'auto') return nextMatch();
    phase = 'show'; setTimer(0); q('.pl-rnd').textContent = `${ROUNDS[round].name} · ${mi + 1} of ${matchups.length}`;
    body.innerHTML = `<div class="pl-prompt"></div><div class="pl-duel"><div class="pl-card a hid"><p></p><div class="pl-meta"></div></div><div class="pl-vs">VS</div><div class="pl-card b hid"><p></p><div class="pl-meta"></div></div></div>`;
    q('.pl-prompt').textContent = m.prompt; q('.pl-card.a p').textContent = m.ta; q('.pl-card.b p').textContent = m.tb;
    allReact('Look up!', 'The answers are coming…'); ctx.beep(600, 0.1); say(m.prompt, true);
    const show = (sel, text, then) => { q(sel).classList.remove('hid'); ctx.beep(sel.endsWith('a') ? 700 : 820, 0.08, 'triangle'); say(text); after(readMs(text), then); };
    after(readMs(m.prompt), () => show('.pl-card.a', m.ta, () => show('.pl-card.b', m.tb, openVote)));
  }
  function openVote() {
    const m = cur; m.voters = live().filter((p) => p !== m.a && p !== m.b);
    if (!m.voters.length) return reveal();
    phase = 'vote'; setTimer(VOTE_TIME);
    for (const p of players) ctx.to(p.id, m.voters.includes(p) ? { m: 'pl_vote', color: p.color, prompt: m.prompt, opts: [{ k: 0, text: m.ta }, { k: 1, text: m.tb }], time: VOTE_TIME } : { m: 'pl_react', title: p === m.a || p === m.b ? 'Your answer is up!' : 'Look up!', text: 'The others are voting. Throw a reaction.' });
  }
  function reveal() {
    const m = cur, mult = ROUNDS[round].mult; phase = 'reveal'; setTimer(0);
    const votes = [[], []]; for (const [id, k] of m.votes) { const p = players.find((x) => x.id === id); if (p) votes[k].push(p); }
    const total = votes[0].length + votes[1].length; let punch = false;
    [[m.a, m.ta, m.taKind, 0, '.a'], [m.b, m.tb, m.tbKind, 1, '.b']].forEach(([who, text, kind, k, sel]) => {
      const mine = votes[k], theirs = votes[1 - k]; let pts = mine.length * 100 * mult, tag = '';
      if (mine.length >= 2 && !theirs.length && kind !== 'auto') { pts += 100 * mult; tag = 'PUNCHLINE!'; punch = true; }
      if (kind === 'safe') { pts = Math.round(pts / 2); tag = tag || 'DICE ANSWER ½'; } if (kind === 'auto') { pts = 0; tag = 'AUTOPILOT 🤖'; }
      give(who, pts); if (!kind && total) lines.push({ text, who, prompt: m.prompt, votes: mine.length, total });
      const card = q('.pl-card' + sel), pc = total ? Math.round((mine.length / total) * 100) : 0; card.classList.toggle('win', mine.length > theirs.length); card.classList.toggle('lose', mine.length < theirs.length);
      card.querySelector('.pl-meta').innerHTML = `<div class="pl-pct"><s style="width:${pc}%"></s><b>${total ? pc + '%' : 'no votes'}</b></div><div class="pl-votes">${mine.map((p, i) => chip(p, 'sm pop', `animation-delay:${0.25 + i * 0.18}s`)).join('')}</div><div class="pl-by" style="animation-delay:${0.5 + mine.length * 0.18}s">${chip(who)}<b>+${pts}</b></div>${tag ? `<div class="pl-stamp" style="animation-delay:${0.7 + mine.length * 0.18}s">${tag}</div>` : ''}`;
    });
    votes.flat().forEach((_, i) => setTimeout(() => !stopped && ctx.beep(620 + i * 70, 0.06, 'triangle'), 250 + i * 180));
    setTimeout(() => { if (stopped) return; foot(); ctx.beep(880, 0.12); if (punch) { ctx.sfx('coin'); for (let i = 0; i < 14; i++) setTimeout(() => float(Math.random() < 0.5 ? 0 : 3), i * 70); } }, 600 + total * 180);
    allReact('Look up!', 'Throw a reaction at the big screen.');
    after(5200 + total * 180, nextMatch);
  }

  // ---------- final: one prompt for everyone ----------
  function finalIntro() {
    phase = 'intro'; setTimer(0); q('.pl-rnd').textContent = 'Final round';
    body.innerHTML = `<div class="pl-big"><h2>THE LAST LAUGH</h2><p>One prompt. Everyone answers. Vote for your favourite. Points are worth ${FINAL_MULT} times as much.</p></div>`;
    for (const p of players) ctx.to(p.id, { m: 'wait', title: 'The Last Laugh', text: 'One prompt for everybody…' });
    ctx.beep(520, 0.12); say('The last laugh. One prompt. Everyone answers.', true); after(4200, () => {
      phase = 'fwrite'; fin = { prompt: draw(FINALS, 1)[0], order: shuffle(live()), ans: {}, votes: new Map() };
      for (const p of players) ctx.to(p.id, fin.order.includes(p) ? { m: 'pl_write', color: p.color, label: 'Final prompt', prompts: [{ id: 'f', text: fin.prompt }], time: FINAL_WRITE } : { m: 'wait', title: 'Sit tight', text: '' });
      body.innerHTML = `<div class="pl-prompt"></div><div class="pl-big small"><div class="pl-wait"></div></div>`; q('.pl-prompt').textContent = fin.prompt; waitChips(); setTimer(FINAL_WRITE); say(fin.prompt);
    });
  }
  function finalVote() {
    phase = 'fvote'; fin.list = shuffle(fin.order.filter((p) => ((fin.ans[p.id] || {}).text || '').trim()).map((p) => ({ p, text: fin.ans[p.id].text.trim() })));
    if (fin.list.length < 2) return finalReveal();
    body.innerHTML = `<div class="pl-prompt"></div><div class="pl-grid">${fin.list.map((a, i) => `<div class="pl-card mini" data-i="${i}" style="animation-delay:${i * 0.12}s"><p></p><div class="pl-meta"></div></div>`).join('')}</div>`;
    q('.pl-prompt').textContent = fin.prompt; fin.list.forEach((a, i) => { root.querySelector(`.pl-card[data-i="${i}"] p`).textContent = a.text; });
    fin.voters = live(); setTimer(FINAL_VOTE);
    for (const p of players) { const opts = fin.list.map((a, i) => ({ k: i, text: a.text, own: a.p === p })).filter((o) => !o.own); ctx.to(p.id, opts.length && p.online ? { m: 'pl_vote', color: p.color, label: 'Vote for your favourite', prompt: fin.prompt, opts, time: FINAL_VOTE } : { m: 'pl_react', title: 'Look up!', text: '' }); }
  }
  function finalReveal() {
    phase = 'reveal'; setTimer(0); const list = fin.list || [], counts = list.map((_, i) => [...fin.votes].filter(([, k]) => k === i).length), top = Math.max(0, ...counts), total = counts.reduce((a, b) => a + b, 0);
    list.forEach((a, i) => {
      const mine = [...fin.votes].filter(([, k]) => k === i).map(([id]) => players.find((p) => p.id === id)).filter(Boolean), pts = mine.length * 100 * FINAL_MULT; give(a.p, pts);
      if (total) lines.push({ text: a.text, who: a.p, prompt: fin.prompt, votes: mine.length, total });
      const card = root.querySelector(`.pl-card[data-i="${i}"]`); if (!card) return; card.classList.toggle('win', top > 0 && mine.length === top);
      card.querySelector('.pl-meta').innerHTML = `<div class="pl-votes">${mine.map((p, j) => chip(p, 'sm pop', `animation-delay:${j * 0.15}s`)).join('')}</div><div class="pl-by">${chip(a.p)}<b>+${pts}</b></div>`;
    });
    foot(); ctx.beep(880, 0.12); allReact('Look up!', 'Throw a reaction at the big screen.');
    after(list.length >= 2 ? 7000 : 1500, award);
  }
  function award() { // the single best-received answer of the whole game
    const best = lines.filter((l) => l.votes > 0).sort((a, b) => b.votes / b.total - a.votes / a.total || b.votes - a.votes)[0];
    if (!best) return finish();
    phase = 'award'; q('.pl-rnd').textContent = 'Line of the night';
    body.innerHTML = `<div class="pl-award"><h3>LINE OF THE NIGHT</h3><div class="pl-prompt sm"></div><div class="pl-card win"><p></p><div class="pl-meta"><div class="pl-by">${chip(best.who)}<b>${Math.round((best.votes / best.total) * 100)}% of the vote</b></div></div></div></div>`;
    q('.pl-prompt').textContent = best.prompt; q('.pl-card p').textContent = best.text; ctx.sfx('coin'); say('Line of the night, by ' + best.who.name.replace(/[^\w\s]/g, '') + '. ' + best.text, true);
    for (let i = 0; i < 18; i++) setTimeout(() => !stopped && float([0, 2, 3][i % 3]), i * 90);
    after(7000, finish);
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
  window.__pl = { get phase() { return phase; }, get matchups() { return matchups; }, get cur() { return cur; }, score, lines };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      if (d.a === 'react') return float(d.k | 0);
      if (d.a === 'ans') {
        const text = d.safe ? quip() : String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 90), ans = { text, safe: !!d.safe };
        if (phase === 'write') { const m = matchups[d.id]; if (m && (m.a === p || m.b === p) && m.ans[p.id] === undefined) { m.ans[p.id] = ans; ctx.beep(700, 0.05); waitChips(); if ([...new Set(matchups.flatMap((x) => [x.a, x.b]))].filter((x) => x.online).every(doneWriting)) { ends = 0; q('.pl-timer').textContent = ''; after(600, nextMatch); } } }
        else if (phase === 'fwrite' && fin.order.includes(p) && fin.ans[p.id] === undefined) { fin.ans[p.id] = ans; ctx.beep(700, 0.05); waitChips(); if (fin.order.filter((x) => x.online).every((x) => fin.ans[x.id] !== undefined)) { ends = 0; after(600, finalVote); } }
      }
      if (d.a === 'vote') {
        if (phase === 'vote' && cur.voters.includes(p) && !cur.votes.has(p.id) && (d.k === 0 || d.k === 1)) { cur.votes.set(p.id, d.k); ctx.beep(760, 0.05); if (cur.voters.filter((x) => x.online).every((x) => cur.votes.has(x.id))) { ends = 0; after(500, reveal); } }
        else if (phase === 'fvote' && !fin.votes.has(p.id) && fin.list[d.k] && fin.list[d.k].p !== p) { fin.votes.set(p.id, d.k | 0); ctx.beep(760, 0.05); if (fin.voters.filter((x) => x.online).every((x) => fin.votes.has(x.id) || fin.list.every((a) => a.p === x))) { ends = 0; after(500, finalReveal); } }
      }
    },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; clearTimeout(timer); clearInterval(tick); removeEventListener('keydown', onKey); try { synth && synth.cancel(); } catch {} window.__pl = null; },
  };
}
