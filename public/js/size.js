// Size Up: two pictures stand on one ground line. The blue one is shown at its true size; everyone
// resizes the red one on their phone until it looks right, then locks in. Closest guess scores most.
import { showResults } from './host.js';

const ROUNDS = 5, GUESS_TIME = 30, REVEAL_TIME = 8500, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
// name, real size in metres, which side of the picture that size is ('h' = height, 'w' = width), and the word used in the question
const THINGS = {
  human: ['a person', 1.7, 'h', 'tall'], giraffe: ['a giraffe', 5, 'h', 'tall'], elephant: ['an African elephant', 3.2, 'h', 'tall'], penguin: ['an emperor penguin', 1.1, 'h', 'tall'],
  whale: ['a blue whale', 25, 'w', 'long'], shark: ['a great white shark', 4.5, 'w', 'long'], crocodile: ['a saltwater crocodile', 4.5, 'w', 'long'], flamingo: ['a flamingo', 1.3, 'h', 'tall'],
  squid: ['a giant squid', 12, 'h', 'long'], sauropod: ['a Brachiosaurus', 12, 'h', 'tall'], mammoth: ['a woolly mammoth', 3, 'h', 'tall'], dodo: ['a dodo', 1, 'h', 'tall'],
  football: ['a football', 0.22, 'h', 'wide'], basketball: ['a basketball', 0.24, 'h', 'wide'], baguette: ['a baguette', 0.65, 'w', 'long'], guitar: ['an electric guitar', 1, 'h', 'long'],
  violin: ['a violin', 0.6, 'h', 'long'], door: ['a standard door', 2.03, 'h', 'tall'], banana: ['a banana', 0.19, 'w', 'long'], phone: ['a smartphone', 0.15, 'h', 'tall'],
  skateboard: ['a skateboard', 0.8, 'w', 'long'], cactus: ['a saguaro cactus', 12, 'h', 'tall'], car: ['a family car', 4.5, 'w', 'long'], bus: ['a city bus', 12, 'w', 'long'],
  bicycle: ['a bicycle', 1.75, 'w', 'long'], motorcycle: ['a motorbike', 2.1, 'w', 'long'], scooter: ['a moped', 1.8, 'w', 'long'], plane: ['a Boeing 747', 76, 'w', 'long'],
  rocket: ['the Saturn V moon rocket', 111, 'h', 'tall'], tower: ['Tokyo Tower', 333, 'h', 'tall'], wheel: ['the London Eye', 135, 'h', 'tall'], moai: ['an Easter Island statue', 4, 'h', 'tall'],
  fuji: ['Mount Fuji', 3776, 'h', 'tall'], moon: ['the Moon', 3474000, 'h', 'wide'], earth: ['the Earth', 12742000, 'h', 'wide'], sequoia: ['the biggest giant sequoia', 84, 'h', 'tall'],
};
// [what you resize, what it stands next to, pack]
const LIST = [
  ['giraffe', 'human', 'animals'], ['elephant', 'human', 'animals'], ['penguin', 'human', 'animals'], ['whale', 'bus', 'animals'], ['shark', 'human', 'animals'], ['crocodile', 'car', 'animals'],
  ['flamingo', 'human', 'animals'], ['squid', 'giraffe', 'animals'], ['sauropod', 'elephant', 'animals'], ['mammoth', 'elephant', 'animals'], ['dodo', 'penguin', 'animals'],
  ['football', 'basketball', 'everyday'], ['baguette', 'football', 'everyday'], ['guitar', 'human', 'everyday'], ['violin', 'guitar', 'everyday'], ['door', 'human', 'everyday'],
  ['banana', 'phone', 'everyday'], ['skateboard', 'football', 'everyday'], ['basketball', 'banana', 'everyday'], ['phone', 'banana', 'everyday'],
  ['car', 'human', 'vehicles'], ['bus', 'car', 'vehicles'], ['bicycle', 'human', 'vehicles'], ['motorcycle', 'bicycle', 'vehicles'], ['scooter', 'skateboard', 'vehicles'], ['plane', 'whale', 'vehicles'], ['rocket', 'tower', 'vehicles'],
  ['tower', 'wheel', 'world'], ['wheel', 'sequoia', 'world'], ['sequoia', 'plane', 'world'], ['moai', 'human', 'world'], ['fuji', 'tower', 'world'], ['moon', 'earth', 'world'], ['cactus', 'human', 'world'], ['earth', 'moon', 'world'],
];
const PACKS = [['mixed', 'Mixed bag', 'A bit of everything'], ['animals', 'Animals', 'Giraffes, whales, dinosaurs'], ['everyday', 'Everyday stuff', 'Smaller than you think'], ['vehicles', 'Things that move', 'Bikes to moon rockets'], ['world', 'Landmarks & space', 'The really big ones']];
const BLUE = '#2b7bff', RED = '#ff5a4f';

export const fmt = (m) => { const f = (v) => (v >= 100 ? Math.round(v).toLocaleString('en') : String(+v.toPrecision(v >= 10 ? 3 : 2))); return m >= 1e6 ? f(m / 1000) + ' km' : m >= 1000 ? f(m / 1000) + ' km' : m >= 1 ? f(m) + ' m' : f(m * 100) + ' cm'; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / 0.71; };
const imgs = {};
function load(key) { if (!imgs[key]) imgs[key] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `/assets/sizeup/${key}.png`; }); return imgs[key]; }
function tinted(im, color) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; }
const dims = (im, key, size) => { const a = im ? im.width / im.height : 1; return THINGS[key][2] === 'h' ? [size * a, size] : [size, size / a]; }; // [width, height] in metres

export function start(ctx) {
  const players = ctx.players, score = new Map(players.map((p) => [p.id, 0])), speed = new Map(players.map((p) => [p.id, 0])), chance = new Set(players.map((p) => p.id));
  let phase = 'pack', round = -1, list = [], cur = null, ends = 0, timer = 0, raf = 0, stopped = false, pointRows = [], revealAt = 0;
  const root = document.createElement('div'); root.className = 'sz';
  root.innerHTML = `<div class="sz-head"><span class="sz-rnd"></span><h2 class="sz-q"></h2><span class="sz-timer"></span></div><div class="sz-main"><canvas></canvas><ol class="sz-list"></ol><div class="sz-packs"></div></div><div class="sz-foot"></div>`;
  ctx.stage.appendChild(root);
  const q = (s) => root.querySelector(s), cv = q('canvas'), g = cv.getContext('2d');
  const after = (ms, fn) => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) fn(); }, ms); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function foot() { q('.sz-foot').innerHTML = [...players].sort((a, b) => score.get(b.id) - score.get(a.id)).map((p) => `<span class="${cur && cur.g[p.id] && cur.g[p.id].locked ? 'ok' : ''}"><i style="background:${p.color}"></i>${esc(p.name)}<b>${score.get(p.id)}</b></span>`).join(''); }

  // ---------- pack choice ----------
  function showPacks() {
    q('.sz-rnd').textContent = 'Size Up'; q('.sz-q').textContent = 'How big is it, really?'; q('.sz-timer').textContent = '';
    q('.sz-packs').innerHTML = `<div class="sz-how"><b>1</b> The blue picture is at its true size <b>2</b> Resize the red one on your phone <b>3</b> Lock in. Closest wins</div>` + PACKS.map(([k, n, d]) => `<button data-k="${k}"><strong>${n}</strong><span>${d}</span></button>`).join('');
    q('.sz-packs').querySelectorAll('button').forEach((b) => (b.onclick = () => choose(b.dataset.k)));
    const v = ctx.vip(); for (const p of players) ctx.to(p.id, p === v ? { m: 'choice', color: p.color, title: 'Pick a pack', text: 'Five rounds. Closest guess scores most.', opts: PACKS.map(([k, n, d]) => ({ k, label: n, sub: d })) } : { m: 'wait', title: 'Size Up', text: 'The host is picking a pack.' });
    foot();
  }
  async function choose(k) {
    if (phase !== 'pack') return; phase = 'loading';
    list = shuffle(LIST.filter((r) => k === 'mixed' || r[2] === k)).slice(0, ROUNDS);
    await Promise.all(list.flatMap((r) => [load(r[0]), load(r[1])])); if (stopped) return;
    q('.sz-packs').innerHTML = ''; next();
  }

  // ---------- a round ----------
  async function next() {
    round++; if (round >= list.length) return finish();
    const [tk, rk] = list[round], T = THINGS[tk], Rf = THINGS[rk], tim = await load(tk), rim = await load(rk); if (stopped) return;
    cur = { tk, rk, truth: T[1], ref: Rf[1], tim, rim, tSil: tim && tinted(tim, RED), rSil: rim && tinted(rim, BLUE), g: {}, lo: Rf[1] / 25, hi: Rf[1] * 25, t0: performance.now() };
    phase = 'guess'; ends = Date.now() + GUESS_TIME * 1000; q('.sz-list').innerHTML = '';
    q('.sz-rnd').textContent = `Round ${round + 1} of ${list.length}`; q('.sz-q').textContent = `How ${T[3]} is ${T[0]}?`;
    for (const p of players) {
      const startV = Rf[1] * Math.pow(2, (Math.random() - 0.5) * 3.4); cur.g[p.id] = { v: startV, moved: false, locked: false, at: 0, pending: false };
      if (p.bot) { const gg = cur.g[p.id]; gg.botV = T[1] * Math.pow(2, gauss() * 0.5); gg.botAt = performance.now() + 3000 + Math.random() * 8000; continue; }
      ctx.to(p.id, { m: 'sz_guess', color: p.color, round: round + 1, of: list.length, q: `How ${T[3]} is ${T[0]}?`, word: T[3], tgt: { img: tk, dim: T[2] }, ref: { img: rk, dim: Rf[2], size: Rf[1], label: `${Rf[0].replace(/^(a|an|the) /, (m) => m[0].toUpperCase() + m.slice(1))}: ${fmt(Rf[1])} ${Rf[3]}` }, lo: cur.lo, hi: cur.hi, start: startV, time: GUESS_TIME, chance: chance.has(p.id) });
    }
    foot(); ctx.beep(600, 0.1);
  }
  const pts = (v, t) => { const e = Math.abs(Math.log2(v / t)); return e <= Math.log2(1.05) ? 100 : Math.max(0, Math.round(100 * (1 - e))); };
  function lock(p, v) {
    const gg = cur.g[p.id]; if (!gg || gg.locked || phase !== 'guess') return;
    gg.v = Math.min(cur.hi, Math.max(cur.lo, +v || gg.v)); gg.moved = true; gg.locked = true; gg.at = (performance.now() - cur.t0) / 1000;
    if (!p.bot && chance.has(p.id) && Math.abs(Math.log2(gg.v / cur.truth)) > 0.8 && ends - Date.now() > 6000) { gg.pending = true; ctx.to(p.id, { e: 'sz', st: 'second' }); }
    else ctx.to(p.id, { e: 'sz', st: 'locked' });
    ctx.beep(700, 0.05); foot(); maybeReveal();
  }
  function maybeReveal() {
    if (phase !== 'guess') return; const done = (p) => !p.online || (cur.g[p.id].locked && !cur.g[p.id].pending);
    if (players.filter((p) => !p.bot).every(done)) for (const p of players) if (p.bot && !cur.g[p.id].locked) cur.g[p.id].botAt = 0; // bots stop dithering once the humans are in
    if (players.every(done)) after(500, reveal);
  }
  function reveal() {
    if (phase !== 'guess') return; phase = 'reveal'; ends = 0; q('.sz-timer').textContent = ''; revealAt = performance.now();
    const T = THINGS[cur.tk], rows = players.map((p) => { const gg = cur.g[p.id], ok = gg.moved, s = ok ? pts(gg.v, cur.truth) : 0; score.set(p.id, score.get(p.id) + s); speed.set(p.id, speed.get(p.id) + (gg.locked ? gg.at : GUESS_TIME)); return { p, v: gg.v, ok, s }; }).sort((a, b) => b.s - a.s);
    cur.rows = rows;
    q('.sz-q').textContent = `${T[0][0].toUpperCase() + T[0].slice(1)}: about ${fmt(cur.truth)} ${T[3]}`;
    setTimeout(() => { if (stopped || phase !== 'reveal') return; q('.sz-list').innerHTML = rows.map((r, i) => `<li style="animation-delay:${i * 0.12}s"><i style="background:${r.p.color}"></i><span>${esc(r.p.name)}</span><em>${r.ok ? fmt(r.v) : 'no guess'}</em><b class="${r.s === 100 ? 'bull' : ''}">${r.s === 100 ? 'BULLSEYE ' : ''}+${r.s}</b></li>`).join(''); foot(); ctx.sfx('coin', 0.6); }, 2300);
    for (const r of rows) ctx.to(r.p.id, { e: 'sz', st: 'reveal', pts: r.s, truth: fmt(cur.truth), mine: r.ok ? fmt(r.v) : '' });
    ctx.beep(880, 0.12); after(REVEAL_TIME, next);
  }
  function finish() {
    phase = 'done'; cur = null;
    const ranked = [...players].sort((a, b) => score.get(b.id) - score.get(a.id) || speed.get(a.id) - speed.get(b.id)); pointRows = ranked.map((p, i) => ({ id: p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(ctx.stage, 'SIZE UP', `Out of ${list.length * 100}`, ranked.map((p, i) => ({ name: p.name, color: p.color, pts: pointRows[i].pts, extra: score.get(p.id) + ' in-game' })));
    const v = ctx.vip(); for (const p of players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Size Up is over', text: 'Results are on the big screen.' });
  }

  // ---------- drawing ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (ends) { const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000)), el = q('.sz-timer'); if (el.textContent !== String(left)) { el.textContent = left; el.classList.toggle('low', left <= 5); if (left <= 5 && left > 0) ctx.beep(520, 0.06); } if (left <= 0 && phase === 'guess') { for (const p of players) { const gg = cur.g[p.id]; gg.pending = false; } reveal(); } }
    if (phase === 'guess') for (const p of players) { const gg = cur.g[p.id]; if (p.bot && !gg.locked && now > gg.botAt) lock(p, gg.botV); }
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2); if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); if (!cur) return;
    const ground = h * 0.86, [rw, rh] = dims(cur.rim, cur.rk, cur.ref), tDim = THINGS[cur.tk][2], rev = phase === 'reveal', t = rev ? (now - revealAt) / 1000 : 0;
    const showV = rev ? cur.truth : cur.ref * (THINGS[cur.rk][2] === tDim ? 1 : 0.8), [tw, th] = dims(cur.tim, cur.tk, showV);
    let maxW = tw, maxH = Math.max(rh, th);
    if (rev) for (const r of cur.rows) if (r.ok) { const v = Math.min(r.v, Math.max(cur.truth, cur.ref) * 2), [gw, gh] = dims(cur.tim, cur.tk, v); maxW = Math.max(maxW, gw); maxH = Math.max(maxH, gh); }
    const aw = rev ? w * 0.66 : w; // the results list sits on the right during the reveal
    const s = Math.min((aw * 0.86) / (rw + maxW * 1.05 + (rw + maxW) * 0.12), (h * 0.74) / maxH), gap = (rw + maxW) * 0.12 * s, x0 = (aw - (rw * s + gap + maxW * s)) / 2, tx = x0 + rw * s + gap;
    // ground
    g.strokeStyle = 'rgba(20,17,15,.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.03, ground); g.lineTo(w * 0.97, ground); g.stroke();
    g.fillStyle = 'rgba(20,17,15,.06)'; g.fillRect(w * 0.03, ground, w * 0.94, h - ground);
    // reference, at true scale
    if (cur.rSil) g.drawImage(rev ? cur.rim : cur.rSil, x0, ground - rh * s, rw * s, rh * s);
    g.fillStyle = BLUE; g.font = '900 ' + Math.max(14, h * 0.032) + 'px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    const Rf = THINGS[cur.rk]; g.fillText(`${Rf[0]} · ${fmt(cur.ref)}`, x0 + rw * s / 2, ground + 10);
    if (!rev) { // the mystery shape breathes so nobody reads its size as a clue
      const k = 1 + Math.sin(now / 600) * 0.12, W2 = tw * s * k, H2 = th * s * k;
      if (cur.tSil) { g.globalAlpha = 0.9; g.drawImage(cur.tSil, tx + (maxW * s - W2) / 2, ground - H2, W2, H2); g.globalAlpha = 1; }
      g.fillStyle = '#fff'; g.font = '400 ' + Math.max(40, Math.min(W2, H2) * 0.5) + 'px "Bowlby One", "Arial Black", sans-serif'; g.textBaseline = 'middle'; g.fillText('?', tx + maxW * s / 2, ground - H2 / 2);
      g.fillStyle = RED; g.font = '900 ' + Math.max(14, h * 0.032) + 'px "DM Sans", system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('Set the size on your phone', tx + maxW * s / 2, ground + 10);
      return;
    }
    // everyone's guesses as dashed marks, then the real thing grows in
    const grow = Math.min(1, Math.max(0, (t - 1.1) / 1.0)), ease = 1 - Math.pow(1 - grow, 3), fs = Math.max(13, h * 0.026);
    cur.rows.forEach((r, i) => {
      if (!r.ok) return; const a = Math.min(1, Math.max(0, t * 3 - i * 0.25)); if (a <= 0) return;
      const off = r.v > Math.max(cur.truth, cur.ref) * 2, v = off ? Math.max(cur.truth, cur.ref) * 2 : r.v, [gw, gh] = dims(cur.tim, cur.tk, v);
      g.globalAlpha = a; g.strokeStyle = r.p.color; g.lineWidth = 3; g.setLineDash([9, 7]); g.beginPath();
      const label = r.p.name + (off ? ' ↑' : ''); g.font = '900 ' + fs + 'px "DM Sans", system-ui, sans-serif'; const lw = g.measureText(label).width + 16;
      if (tDim === 'h') { const y = ground - gh * s; g.moveTo(tx - 10, y); g.lineTo(tx + maxW * s + 10, y); g.stroke(); g.setLineDash([]); const lx = i % 2 ? tx - 14 - lw : tx + maxW * s + 14; g.fillStyle = r.p.color; g.beginPath(); g.roundRect(lx, y - fs * 0.75, lw, fs * 1.5, fs * 0.75); g.fill(); g.fillStyle = '#14110f'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, lx + 8, y + 1); }
      else { const x = tx + gw * s, top = ground - maxH * s - 14 - (i % 4) * (fs * 1.7); g.moveTo(x, ground + 6); g.lineTo(x, top); g.stroke(); g.setLineDash([]); g.fillStyle = r.p.color; g.beginPath(); g.roundRect(x - lw / 2, top - fs * 1.5, lw, fs * 1.5, fs * 0.75); g.fill(); g.fillStyle = '#14110f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, top - fs * 0.75 + 1); }
      g.globalAlpha = 1;
    });
    g.setLineDash([]);
    if (cur.tim && ease > 0) { const [W2, H2] = dims(cur.tim, cur.tk, cur.truth * ease); g.drawImage(cur.tim, tDim === 'h' ? tx + (maxW * s - W2 * s) / 2 : tx, ground - H2 * s, W2 * s, H2 * s); }
    if (grow >= 1) { g.fillStyle = RED; g.font = '900 ' + Math.max(14, h * 0.034) + 'px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(`${THINGS[cur.tk][0]} · ${fmt(cur.truth)}`, tx + maxW * s / 2, ground + 10); }
  }
  showPacks(); raf = requestAnimationFrame(frame);
  window.__sz = { get phase() { return phase; }, get cur() { return cur; }, score, choose, lock };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      if (d.a === 'pick' && phase === 'pack' && p === ctx.vip()) return choose(d.k);
      if (phase !== 'guess' || !cur) return; const gg = cur.g[p.id]; if (!gg) return;
      if (d.a === 'sz' && !gg.locked && +d.v > 0) { gg.v = Math.min(cur.hi, Math.max(cur.lo, +d.v)); gg.moved = true; }
      if (d.a === 'lock') lock(p, d.v);
      if (d.a === 'again' && gg.pending) { chance.delete(p.id); gg.pending = false; gg.locked = false; foot(); }
      if (d.a === 'keep' && gg.pending) { gg.pending = false; ctx.to(p.id, { e: 'sz', st: 'locked' }); maybeReveal(); }
    },
    onLeave() { if (phase === 'guess') maybeReveal(); },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; clearTimeout(timer); cancelAnimationFrame(raf); window.__sz = null; },
  };
}
