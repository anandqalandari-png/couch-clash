// Laptop side: lobby, session scores, bots, and hand-off to the games.
import * as Race from './race.js';
import * as Sketch from './sketch.js';
import * as Turf from './turf.js';
import * as Football from './football.js';
import * as Punch from './punch.js';
import * as Blast from './blast.js';
import * as Size from './size.js';

export const COLORS = ['#ff4b2b', '#2b7bff', '#ffc62b', '#19c2a0', '#b455ff', '#ff7ac8', '#7bd834', '#ff9a2b'];
const MAX_PLAYERS = 8, MAX_BOTS = 3, BOT_NAMES = ['Gizmo', 'Nacho', 'Pixel'];
const GAMES = {
  race:   { mod: Race,   name: 'Turbo Clash', cls: 'race',   min: 1, bots: true, range: '1–5 racers', desc: 'Split-screen 3D racing. Tilt to steer, five cars, five superpowers.',
            icon: '<svg viewBox="0 0 100 100"><path d="M12 62c2-16 12-26 28-28l20-2c12 0 22 8 28 22v10H12z" fill="#14110f"/><circle cx="32" cy="66" r="11" fill="#f6efe2" stroke="#14110f" stroke-width="5"/><circle cx="72" cy="66" r="11" fill="#f6efe2" stroke="#14110f" stroke-width="5"/><path d="M44 38l16-2c6 0 11 4 14 10H42z" fill="#ffc62b"/></svg>' },
  sketch: { mod: Sketch, name: 'Scribble It', cls: 'sketch', min: 2, range: '2–8 players', desc: 'Draw on your phone, everyone shouts guesses. Easy 20, medium 40, hard 60.',
            icon: '<svg viewBox="0 0 100 100"><path d="M18 78l8-26 42-42 18 18-42 42z" fill="#14110f"/><path d="M30 56l14 14" stroke="#ffc62b" stroke-width="5"/><path d="M68 10l18 18" stroke="#ff4b2b" stroke-width="9"/></svg>' },
  turf:   { mod: Turf,   name: 'Turf War',    cls: 'turf',   min: 2, bots: true, range: '2–8 players', desc: 'Loop out, claim land, cut trails. Get knocked out and you restart on empty ground.',
            icon: '<svg viewBox="0 0 100 100"><rect x="14" y="14" width="44" height="44" rx="6" fill="#14110f"/><rect x="42" y="42" width="44" height="44" rx="6" fill="#ff4b2b" stroke="#14110f" stroke-width="5"/><rect x="22" y="22" width="14" height="14" rx="3" fill="#ffc62b"/></svg>' },
  football: { mod: Football, name: 'Car Football', cls: 'football', min: 2, bots: true, range: '2–8 players', desc: 'Cars, one giant ball, two goals. Teams reshuffle after every goal.',
            icon: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="#fff" stroke="#14110f" stroke-width="6"/><path d="M50 30l17 12-6 20H39l-6-20z" fill="#14110f"/></svg>' },
  punch:  { mod: Punch,  name: 'Punchline',   cls: 'punch',  min: 3, range: '3–8 players', desc: 'Silly prompts, some of them about your friends. The room votes for the funniest.',
            icon: '<svg viewBox="0 0 100 100"><path d="M12 18h76v50H46L26 86V68H12z" fill="#14110f"/><path d="M30 36h40M30 50h26" stroke="#ffc62b" stroke-width="7" stroke-linecap="round"/></svg>' },
  blast:  { mod: Blast,  name: 'Blast Zone',  cls: 'blast',  min: 2, bots: true, range: '2–8 players', desc: 'Bomb the crates, grab pickups, trap your friends. Ghosts throw bombs back in.',
            icon: '<svg viewBox="0 0 100 100"><circle cx="46" cy="60" r="30" fill="#ffc62b"/><path d="M62 36l10-12" stroke="#ffc62b" stroke-width="8" stroke-linecap="round"/><path d="M76 12l4 8 8 2-7 5 1 9-7-5-8 4 3-9-6-6h9z" fill="#ff4b2b"/></svg>' },
  size:   { mod: Size,   name: 'Size Up',     cls: 'size',   min: 1, bots: true, range: '1–8 players', desc: 'How big is a blue whale next to a bus? Resize it on your phone. Closest guess wins.',
            icon: '<svg viewBox="0 0 100 100"><rect x="10" y="52" width="22" height="34" rx="5" fill="#14110f"/><rect x="40" y="18" width="46" height="68" rx="8" fill="#14110f"/><path d="M52 34v38M46 40l6-6 6 6M46 66l6 6 6-6" stroke="#ffc62b" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
};

// short sound effects (CC0, by Kenney); silently skipped if the browser cannot play them
export function sfx(name, vol = 1) { try { const a = new Audio('/assets/sfx/' + name + '.ogg'); a.volume = Math.max(0, Math.min(1, vol)) * 0.6; a.play().catch(() => {}); } catch {} }

const $ = (s) => document.querySelector(s);
const lobbyEl = $('#lobby'), stage = $('#stage');
const S = { code: null, players: [], game: null, gameKey: null, last: {}, bots: 0 };
let ws, toastT;

// ---------- sound (tiny synth, fails silently) ----------
let actx;
export function beep(freq = 440, dur = 0.12, type = 'square', vol = 0.06) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch {}
}
// browsers only allow sound (and the Punchline voice) after a click or key press on the page
const unlock = () => { beep(1, 0.01, 'sine', 0.0001); const h = document.querySelector('#soundHint'); if (h) h.hidden = true; removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

// ---------- network ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'host' }));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => { toast('Connection lost. Reload this page to open a new room.', 8000); };
}
const raw = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function to(id, d) { if (String(id).startsWith('bot')) return; if (d.m) S.last[id] = d; raw({ t: 'to', id, d }); }
function all(d) { for (const p of S.players) to(p.id, d); }
const online = () => S.players.filter((p) => p.online);
const vip = () => online()[0];

function handle(m) {
  if (m.t === 'room') { S.code = m.code; renderJoin(); return; }
  if (m.t === 'join') {
    let p = S.players.find((x) => x.id === m.id);
    if (p) { p.online = true; p.name = m.name; if (S.last[p.id] && S.game) to(p.id, S.last[p.id]); }
    else {
      if (S.players.length >= MAX_PLAYERS) return raw({ t: 'kick', id: m.id, msg: 'Room is full (8 players)' });
      const used = new Set(S.players.map((x) => x.color));
      p = { id: m.id, name: m.name, color: COLORS.find((c) => !used.has(c)), online: true, score: 0, races: 0 };
      S.players.push(p); beep(660, 0.1); setTimeout(() => beep(880, 0.12), 90);
      if (S.game) to(p.id, { m: 'wait', title: 'Game in progress', text: "You're in for the next one." });
    }
    S.game?.onJoin?.(p);
    if (!S.game) syncLobby(); else renderLobby();
    return;
  }
  if (m.t === 'leave') {
    const p = S.players.find((x) => x.id === m.id); if (!p) return;
    p.online = false;
    if (!S.game) { S.players = S.players.filter((x) => x !== p); delete S.last[p.id]; syncLobby(); }
    else S.game.onLeave?.(p);
    return;
  }
  if (m.t === 'msg') {
    const p = S.players.find((x) => x.id === m.id); if (!p || !m.d) return;
    const d = m.d;
    if (d.a === 'menu' && !S.game) { if (p === vip()) startGame(d.game); return; }
    if (d.a === 'bots' && !S.game) { if (p === vip()) setBots(d.n); return; }
    if (d.a === 'quit' && S.game && p === vip()) return quitGame();
    S.game?.onMsg?.(p, d);
  }
}

// ---------- lobby ----------
function renderJoin() {
  const url = location.origin + '/play?c=' + S.code;
  $('#qr').src = '/qr?t=' + encodeURIComponent(url);
  $('#joinUrl').textContent = location.host + '/play';
  $('#code').textContent = S.code;
  $('#localHint').hidden = !/^(localhost|127\.)/.test(location.hostname);
}
function renderLobby() {
  const ul = $('#players'); ul.innerHTML = '';
  const v = vip();
  for (const p of S.players) {
    const li = document.createElement('li'); if (!p.online) li.className = 'off';
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span><span></span>${p === v ? '<span class="vip">HOST</span>' : ''}<span class="pts">${p.score}</span>`;
    li.children[1].textContent = p.name; ul.appendChild(li);
  }
  $('#count').textContent = `${S.players.length} / ${MAX_PLAYERS}`;
  $('#noPlayers').hidden = S.players.length > 0;
}
function syncLobby() {
  renderLobby();
  const v = vip();
  const scores = [...S.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, color: p.color, score: p.score }));
  for (const p of online()) to(p.id, { m: 'lobby', vip: p === v, name: p.name, color: p.color, code: S.code, scores, bots: S.bots, maxBots: MAX_BOTS,
    games: Object.entries(GAMES).map(([k, g]) => ({ k, name: g.name, desc: g.range, c: g.cls, bots: !!g.bots, min: g.min })) });
}
function setBots(n) {
  S.bots = Math.max(0, Math.min(MAX_BOTS, n | 0)); $('#botN').textContent = S.bots;
  $('#botHint').textContent = S.bots ? `${S.bots} bot${S.bots > 1 ? 's' : ''} will join every game except Scribble It and Punchline` : 'No bots. Add some to fill out a small group';
  if (!S.game) syncLobby();
}
$('#botMinus').onclick = () => setBots(S.bots - 1); $('#botPlus').onclick = () => setBots(S.bots + 1);
function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
const gamesEl = $('#games');
for (const [k, g] of Object.entries(GAMES)) {
  const b = document.createElement('button'); b.className = 'game ' + g.cls;
  b.innerHTML = `${g.icon}<div class="n">${g.name}</div><div class="d">${g.desc}</div><div class="p">${g.range}</div>`;
  b.onclick = () => startGame(k); gamesEl.insertBefore(b, $('#botTile'));
}

// ---------- game hand-off ----------
function startGame(key) {
  const g = GAMES[key]; if (!g || S.game) return;
  const ps = online(); if (!ps.length) return toast('Join with a phone first');
  if (g.bots) { // bots take the colours nobody is using
    const used = new Set(ps.map((p) => p.color)), nb = Math.min(S.bots, MAX_PLAYERS - ps.length);
    for (let i = 0; i < nb; i++) { const color = COLORS.find((c) => !used.has(c)); used.add(color); ps.push({ id: 'bot' + i, name: BOT_NAMES[i] + ' 🤖', color, online: true, bot: true, score: 0, races: 99 }); }
  }
  if (ps.length < g.min) return toast(g.bots ? `${g.name} needs at least ${g.min} players. Add a bot or another phone` : `${g.name} needs at least ${g.min} people (bots don't count here)`);
  lobbyEl.hidden = true; stage.hidden = false; stage.innerHTML = '';
  S.gameKey = key;
  S.game = g.mod.start({
    players: ps, stage, to, all, beep, sfx,
    vip: () => vip(),
    end(results = []) {           // results: [{id, pts}]
      for (const r of results) { const p = S.players.find((x) => x.id === r.id); if (p) p.score += r.pts; }
      quitGame();
    },
  });
}
function quitGame() {
  try { S.game?.stop?.(); } catch (e) { console.error(e); }
  S.game = null; S.gameKey = null; stage.innerHTML = ''; stage.hidden = true; lobbyEl.hidden = false;
  S.players = S.players.filter((p) => p.online);
  syncLobby();
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.game) quitGame();
  if (e.key === 'Enter' && S.game) S.game.onHostKey?.('enter');
});

// shared results card used by every game
export function showResults(stageEl, title, sub, rows) {
  const el = document.createElement('div'); el.className = 'results';
  el.innerHTML = `<div class="card"><h2></h2><p class="sub"></p><ol></ol><p class="foot">Host: tap “Back to lobby” on your phone, or press Enter here.</p></div>`;
  el.querySelector('h2').textContent = title; el.querySelector('.sub').textContent = sub;
  const ol = el.querySelector('ol');
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rk">${i + 1}</span><i style="background:${r.color}"></i><span class="nm"></span><span class="x"></span><span class="pt">${r.pts ? '+' + r.pts : ''}</span>`;
    li.querySelector('.nm').textContent = r.name; li.querySelector('.x').textContent = r.extra || '';
    ol.appendChild(li);
  });
  stageEl.appendChild(el); return el;
}

connect();
window.__S = S; // for debugging and tests
