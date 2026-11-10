// Laptop side: lobby, session scores, and hand-off to the three games.
import * as Race from './race.js';
import * as Sketch from './sketch.js';
import * as Turf from './turf.js';

export const COLORS = ['#ff4b2b', '#2b7bff', '#ffc62b', '#19c2a0', '#b455ff', '#ff7ac8', '#7bd834', '#ff9a2b'];
const MAX_PLAYERS = 8;
const GAMES = {
  race:   { mod: Race,   name: 'Turbo Clash', cls: 'race',   min: 1, range: '1–5 racers', desc: 'Split-screen 3D racing. Tilt to steer, five cars, five superpowers.',
            icon: '<svg viewBox="0 0 100 100"><path d="M12 62c2-16 12-26 28-28l20-2c12 0 22 8 28 22v10H12z" fill="#14110f"/><circle cx="32" cy="66" r="11" fill="#f6efe2" stroke="#14110f" stroke-width="5"/><circle cx="72" cy="66" r="11" fill="#f6efe2" stroke="#14110f" stroke-width="5"/><path d="M44 38l16-2c6 0 11 4 14 10H42z" fill="#ffc62b"/></svg>' },
  sketch: { mod: Sketch, name: 'Scribble It', cls: 'sketch', min: 2, range: '2–8 players', desc: 'Draw on your phone, everyone shouts guesses. Easy 20, medium 40, hard 60.',
            icon: '<svg viewBox="0 0 100 100"><path d="M18 78l8-26 42-42 18 18-42 42z" fill="#14110f"/><path d="M30 56l14 14" stroke="#ffc62b" stroke-width="5"/><path d="M68 10l18 18" stroke="#ff4b2b" stroke-width="9"/></svg>' },
  turf:   { mod: Turf,   name: 'Turf War',    cls: 'turf',   min: 2, range: '2–8 players', desc: 'Loop out, claim land, cut trails. Get knocked out and you restart on empty ground.',
            icon: '<svg viewBox="0 0 100 100"><rect x="14" y="14" width="44" height="44" rx="6" fill="#14110f"/><rect x="42" y="42" width="44" height="44" rx="6" fill="#ff4b2b" stroke="#14110f" stroke-width="5"/><rect x="22" y="22" width="14" height="14" rx="3" fill="#ffc62b"/></svg>' },
};

const $ = (s) => document.querySelector(s);
const lobbyEl = $('#lobby'), stage = $('#stage');
const S = { code: null, players: [], game: null, gameKey: null, last: {} };
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
addEventListener('pointerdown', () => beep(1, 0.01, 'sine', 0.0001), { once: true });

// ---------- network ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'host' }));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => { toast('Connection lost. Reload this page to open a new room.', 8000); };
}
const raw = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function to(id, d) { if (d.m) S.last[id] = d; raw({ t: 'to', id, d }); }
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
  for (const p of online()) to(p.id, { m: 'lobby', vip: p === v, name: p.name, color: p.color, code: S.code, scores,
    games: Object.entries(GAMES).map(([k, g]) => ({ k, name: g.name, desc: g.range })) });
}
function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
const gamesEl = $('#games');
for (const [k, g] of Object.entries(GAMES)) {
  const b = document.createElement('button'); b.className = 'game ' + g.cls;
  b.innerHTML = `${g.icon}<div class="n">${g.name}</div><div class="d">${g.desc}</div><div class="p">${g.range}</div>`;
  b.onclick = () => startGame(k); gamesEl.appendChild(b);
}

// ---------- game hand-off ----------
function startGame(key) {
  const g = GAMES[key]; if (!g || S.game) return;
  const ps = online();
  if (ps.length < g.min) return toast(g.min === 1 ? 'Join with a phone first' : `${g.name} needs at least ${g.min} players`);
  lobbyEl.hidden = true; stage.hidden = false; stage.innerHTML = '';
  S.gameKey = key;
  S.game = g.mod.start({
    players: ps, stage, to, all, beep,
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
