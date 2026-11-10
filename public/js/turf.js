// Turf War: steer in any direction, loop out of your land to claim more, cut someone's trail to knock them out.
// House rule: a knocked-out player is not dead. They restart on a patch of empty ground,
// and are only eliminated when no empty patch is left.
import { showResults } from './host.js';

const GAME_TIME = 150, SPEED = 150, TURN = 6.5, WIN_SHARE = 0.75, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const STEAL_ON_KNOCKOUT = true; // true: the attacker takes the victim's land. false: it becomes empty ground.
const G = 5;                    // size of one ownership cell in world units (movement itself is not tied to cells)
const HEAD = 13, TRAIL_W = 9, HIT = 8, START_R = 9, SMALL_R = 6;

export function start(ctx) {
  const n = ctx.players.length;
  const W = 80 * Math.round(10 * Math.sqrt(Math.max(1, n))), H = W * 9 / 16, // map area grows in step with the player count: 2 players 1120 wide, 5 players 1760, 8 players 2240
    C = W / G, R = Math.round(H / G), TOTAL = C * R;
  const own = new Int8Array(TOTAL).fill(-1);
  const cellOf = (x, y) => Math.max(0, Math.min(R - 1, Math.floor(y / G))) * C + Math.max(0, Math.min(C - 1, Math.floor(x / G)));
  const P = ctx.players.map((p, i) => ({ p, i, color: p.color, name: p.name, x: 0, y: 0, ang: 0, target: 0, moving: false, freeze: 0, trail: [], lastIn: [0, 0],
    out: false, outAt: 0, land: 0, kos: 0, kills: 0, path: null, flash: 0, blink: Math.random() * 3 }));
  let phase = 'countdown', left = GAME_TIME, cd = 3.999, lastCd = 4, raf = 0, last = performance.now(), pointRows = [], sendT = 0, dirty = true, shake = 0, clock = 0;
  let parts = [], texts = [];

  // ---------- board logic ----------
  function stampDisc(i, cx, cy, r) { // cx, cy, r in cells
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(R - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(C - 1, Math.ceil(cx + r)); x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) own[y * C + x] = i;
  }
  function count() { for (const pl of P) pl.land = 0; for (let k = 0; k < TOTAL; k++) if (own[k] >= 0) P[own[k]].land++; }
  function place(pl, cx, cy, r) {
    stampDisc(pl.i, cx, cy, r); pl.x = (cx) * G; pl.y = (cy) * G; pl.lastIn = [pl.x, pl.y]; pl.trail = []; pl.moving = false; dirty = true;
    pl.ang = pl.target = Math.atan2(H / 2 - pl.y, W / 2 - pl.x);
  }
  function findPatch(pl) {
    for (const r of [START_R, SMALL_R]) {
      let best = null, bs = -1e9;
      for (let cy = r + 1; cy < R - r - 1; cy += 3) for (let cx = r + 1; cx < C - r - 1; cx += 3) {
        let ok = true;
        for (let y = cy - r; y <= cy + r && ok; y++) for (let x = cx - r; x <= cx + r; x++) if (own[y * C + x] !== -1) { ok = false; break; }
        if (!ok) continue;
        let d = 1e9; const wx = cx * G, wy = cy * G;
        for (const o of P) { if (o === pl || o.out) continue; d = Math.min(d, Math.hypot(o.x - wx, o.y - wy)); for (let k = 0; k < o.trail.length; k += 6) d = Math.min(d, Math.hypot(o.trail[k] - wx, o.trail[k + 1] - wy) * 1.5); }
        if (d < 60) continue;
        const edge = Math.min(cx, C - cx) + Math.min(cy, R - cy); // lean towards corners and edges
        const s = Math.min(d, 400) - edge * 1.2 + Math.random() * 20;
        if (s > bs) { bs = s; best = [cx, cy]; }
      }
      if (best) return { cx: best[0], cy: best[1], r };
    }
    return null;
  }
  function burst(x, y, color, nP = 26, sp = 260) { for (let i = 0; i < nP; i++) { const a = Math.random() * 6.28, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.5, r: 3 + Math.random() * 6, color }); } }
  function knockout(v, killer) {
    if (v.out) return;
    v.trail = [];
    const to = killer && killer !== v && STEAL_ON_KNOCKOUT ? killer.i : -1;
    for (let k = 0; k < TOTAL; k++) if (own[k] === v.i) own[k] = to;
    v.kos++; if (killer && killer !== v) { killer.kills++; killer.flash = 1; }
    burst(v.x, v.y, v.color, 40, 380); shake = 1; dirty = true;
    ctx.beep(160, 0.3, 'sawtooth', 0.07);
    const spot = findPatch(v);
    if (spot) { place(v, spot.cx, spot.cy, spot.r); v.freeze = 0.9; v.flash = 1; ctx.to(v.p.id, { e: 'tf', st: 'ko' }); feed(killer && killer !== v ? `${killer.name} knocked out ${v.name}` : `${v.name} tripped on their own trail`, v.color); }
    else { v.out = true; v.outAt = performance.now(); ctx.to(v.p.id, { e: 'tf', st: 'out', pct: 0 }); feed(`${v.name} is out: no empty land left`, v.color); }
    count();
  }
  function capture(pl) {
    const before = pl.land, t = pl.trail;
    for (let k = 0; k + 3 < t.length; k += 2) { // paint the trail into the ownership map
      const ax = t[k], ay = t[k + 1], bx = t[k + 2], by = t[k + 3], len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / (G * 0.5)));
      for (let s = 0; s <= steps; s++) stampDisc(pl.i, (ax + (bx - ax) * s / steps) / G, (ay + (by - ay) * s / steps) / G, 1.25);
    }
    pl.trail = [];
    // flood from the border through everything that is not mine; whatever is not reached is enclosed
    const seen = new Uint8Array(TOTAL), stack = [];
    const push = (k) => { if (!seen[k] && own[k] !== pl.i) { seen[k] = 1; stack.push(k); } };
    for (let x = 0; x < C; x++) { push(x); push((R - 1) * C + x); } for (let y = 0; y < R; y++) { push(y * C); push(y * C + C - 1); }
    while (stack.length) { const k = stack.pop(), x = k % C; if (x > 0) push(k - 1); if (x < C - 1) push(k + 1); if (k >= C) push(k - C); if (k < TOTAL - C) push(k + C); }
    for (let k = 0; k < TOTAL; k++) if (!seen[k] && own[k] !== pl.i) own[k] = pl.i;
    count(); dirty = true; pl.flash = 1;
    const gain = Math.round(((pl.land - before) / TOTAL) * 1000) / 10;
    if (gain >= 0.5) { texts.push({ x: pl.x, y: pl.y - 30, t: 0, text: '+' + gain.toFixed(gain >= 10 ? 0 : 1) + '%', color: pl.color }); burst(pl.x, pl.y, '#ffffff', 10, 160); }
    ctx.to(pl.p.id, { e: 'tf', st: 'cap' }); ctx.beep(520 + pl.i * 40, 0.08, 'triangle');
    for (const o of P) if (o !== pl && !o.out && o.land === 0) knockout(o, pl); // swallowed whole
  }
  const segDist2 = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0; return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2; };
  function hitsTrail(a, b) { // does a's head touch b's trail?
    const t = b.trail; if (t.length < 2) return false;
    let end = t.length;
    if (a === b) { // ignore the stretch right behind your own head
      let acc = Math.hypot(a.x - t[end - 2], a.y - t[end - 1]);
      while (end >= 4 && acc < 34) { acc += Math.hypot(t[end - 2] - t[end - 4], t[end - 1] - t[end - 3]); end -= 2; }
      if (acc < 34) return false;
    }
    for (let k = 0; k + 3 < end; k += 2) if (segDist2(a.x, a.y, t[k], t[k + 1], t[k + 2], t[k + 3]) < HIT * HIT) return true;
    if (a !== b && segDist2(a.x, a.y, t[t.length - 2], t[t.length - 1], b.x, b.y) < HIT * HIT && Math.hypot(a.x - b.x, a.y - b.y) > HEAD) return true;
    return false;
  }
  function stepPlayer(pl, dt) {
    if (pl.freeze > 0) { pl.freeze -= dt; return; }
    if (!pl.moving) return;
    let d = pl.target - pl.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); pl.ang += Math.max(-TURN * dt, Math.min(TURN * dt, d));
    pl.x = Math.max(HEAD, Math.min(W - HEAD, pl.x + Math.cos(pl.ang) * SPEED * dt)); pl.y = Math.max(HEAD, Math.min(H - HEAD, pl.y + Math.sin(pl.ang) * SPEED * dt));
    const inside = own[cellOf(pl.x, pl.y)] === pl.i, t = pl.trail;
    if (inside) { if (t.length) { t.push(pl.x, pl.y); capture(pl); } pl.lastIn = [pl.x, pl.y]; }
    else { if (!t.length) t.push(pl.lastIn[0], pl.lastIn[1]); if (Math.hypot(pl.x - t[t.length - 2], pl.y - t[t.length - 1]) > 4) t.push(pl.x, pl.y); }
  }
  function collisions() {
    for (const a of P) { if (a.out || a.freeze > 0) continue; for (const b of P) { if (b.out || !b.trail.length) continue; if (hitsTrail(a, b)) { knockout(b, a); if (a === b) break; } } }
  }

  // ---------- smooth outlines of each player's land (marching squares on a blurred mask) ----------
  function outline(pl) {
    let x0 = C, x1 = -1, y0 = R, y1 = -1;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (own[y * C + x] === pl.i) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { pl.path = null; return; }
    x0 -= 3; y0 -= 3; x1 += 3; y1 += 3; const w = x1 - x0 + 1, h = y1 - y0 + 1;
    let f = new Float32Array(w * h), g2 = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const gx = x + x0, gy = y + y0; f[y * w + x] = gx >= 0 && gy >= 0 && gx < C && gy < R && own[gy * C + gx] === pl.i ? 1 : 0; }
    for (let pass = 0; pass < 2; pass++) { // soften the stair-steps
      for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) g2[y * w + x] = (f[y * w + x - 1] + 2 * f[y * w + x] + f[y * w + x + 1]) / 4;
      for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) f[y * w + x] = (g2[(y - 1) * w + x] + 2 * g2[y * w + x] + g2[(y + 1) * w + x]) / 4;
    }
    const pts = new Map(), adj = new Map(), link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
    const E = (x, y, horiz) => { // crossing point on the edge leaving node (x,y) rightwards (horiz) or downwards
      const id = (y * w + x) * 2 + (horiz ? 0 : 1);
      if (!pts.has(id)) { const a = f[y * w + x], b = horiz ? f[y * w + x + 1] : f[(y + 1) * w + x], t = (0.5 - a) / (b - a || 1e-6); pts.set(id, [((horiz ? x + t : x) + x0 + 0.5) * G, ((horiz ? y : y + t) + y0 + 0.5) * G]); }
      return id;
    };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = f[y * w + x] > 0.5, b = f[y * w + x + 1] > 0.5, c = f[(y + 1) * w + x + 1] > 0.5, d = f[(y + 1) * w + x] > 0.5, idx = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => E(x, y, true), Bm = () => E(x, y + 1, true), L = () => E(x, y, false), Rt = () => E(x + 1, y, false);
      switch (idx) {
        case 1: case 14: link(L(), T()); break; case 2: case 13: link(T(), Rt()); break; case 4: case 11: link(Rt(), Bm()); break; case 8: case 7: link(L(), Bm()); break;
        case 3: case 12: link(L(), Rt()); break; case 6: case 9: link(T(), Bm()); break;
        case 5: link(L(), T()); link(Rt(), Bm()); break; case 10: link(T(), Rt()); link(L(), Bm()); break;
      }
    }
    const path = new Path2D(), used = new Set();
    for (const startId of adj.keys()) {
      if (used.has(startId)) continue;
      const loop = []; let cur = startId, prev = -1;
      while (cur !== undefined && !used.has(cur)) { used.add(cur); loop.push(pts.get(cur)); const nb = adj.get(cur); const nx = nb[0] !== prev && !used.has(nb[0]) ? nb[0] : nb[1] !== undefined && !used.has(nb[1]) ? nb[1] : undefined; prev = cur; cur = nx; }
      if (loop.length < 4) continue;
      // closed smooth curve through the midpoints
      const m = loop.length, mid = (i) => [(loop[i % m][0] + loop[(i + 1) % m][0]) / 2, (loop[i % m][1] + loop[(i + 1) % m][1]) / 2];
      const s = mid(0); path.moveTo(s[0], s[1]);
      for (let i = 1; i <= m; i++) { const p = loop[i % m], q = mid(i); path.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
      path.closePath();
    }
    pl.path = path;
  }

  // ---------- layout ----------
  const root = document.createElement('div'); root.className = 'tf';
  root.innerHTML = `<div class="bar"><div class="clock"></div><div class="chips"></div></div><div class="field"><canvas></canvas><div class="feed"></div></div>`;
  ctx.stage.appendChild(root);
  const big = document.createElement('div'); big.className = 'bigmsg'; ctx.stage.appendChild(big);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'), clockEl = root.querySelector('.clock'), chipsEl = root.querySelector('.chips'), feedEl = root.querySelector('.feed'), field = root.querySelector('.field');
  const chips = P.map((pl) => { const d = document.createElement('div'); d.className = 'chip'; d.innerHTML = `<i style="background:${pl.color}"></i><span></span><b>0%</b><u><s style="background:${pl.color}"></s></u>`; d.querySelector('span').textContent = pl.name; chipsEl.appendChild(d); return d; });
  let scale = 1, dpr = 1; const bg = document.createElement('canvas'), landC = document.createElement('canvas');
  function resize() {
    const w = field.clientWidth - 8, h = field.clientHeight - 20; scale = Math.min(w / W, h / H); dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [cv, bg, landC]) { c.width = Math.round(W * scale * dpr); c.height = Math.round(H * scale * dpr); }
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
    // board background, drawn once
    const b = bg.getContext('2d'); b.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const gr = b.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7); gr.addColorStop(0, '#2c3350'); gr.addColorStop(1, '#161a2c'); b.fillStyle = gr; b.fillRect(0, 0, W, H);
    b.strokeStyle = 'rgba(255,255,255,.045)'; b.lineWidth = 2; b.beginPath(); for (let x = 60; x < W; x += 60) { b.moveTo(x, 0); b.lineTo(x, H); } for (let y = 60; y < H; y += 60) { b.moveTo(0, y); b.lineTo(W, y); } b.stroke();
    b.fillStyle = 'rgba(255,255,255,.09)'; for (let x = 60; x < W; x += 60) for (let y = 60; y < H; y += 60) { b.beginPath(); b.arc(x, y, 3, 0, 7); b.fill(); }
    dirty = true;
  }
  function feed(text, color) { const d = document.createElement('div'); d.textContent = text; d.style.borderLeft = '8px solid ' + color; feedEl.appendChild(d); while (feedEl.children.length > 3) feedEl.firstChild.remove(); setTimeout(() => d.remove(), 4000); }
  const shade = (hex, f) => { const v = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * f + (f > 1 ? (f - 1) * 90 : 0)))); return `rgb(${c(16)},${c(8)},${c(0)})`; };
  const dark = P.map((pl) => shade(pl.color, 0.55)), lite = P.map((pl) => shade(pl.color, 1.25));
  const stripes = P.map(() => { const c = document.createElement('canvas'); c.width = c.height = 28; const x = c.getContext('2d'); x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 7; x.beginPath(); for (let k = -28; k < 56; k += 14) { x.moveTo(k, 28); x.lineTo(k + 28, 0); } x.stroke(); return c; });

  // start positions spread around an ellipse
  P.forEach((pl, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (n === 2 ? Math.PI / 2 : 0); place(pl, Math.round(C / 2 + Math.cos(a) * (C / 2 - START_R - 8)), Math.round(R / 2 + Math.sin(a) * (R / 2 - START_R - 6)), START_R); });
  count(); resize(); addEventListener('resize', resize);
  for (const pl of P) ctx.to(pl.p.id, { m: 'turf', color: pl.color });

  function drawLand() {
    for (const pl of P) outline(pl);
    const l = landC.getContext('2d'); l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, landC.width, landC.height); l.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    for (const pl of P) { if (!pl.path) continue; l.save(); l.translate(0, 9); l.fillStyle = 'rgba(0,0,0,.35)'; l.fill(pl.path, 'evenodd'); l.restore(); }      // soft drop shadow
    for (const pl of P) { if (!pl.path) continue; l.save(); l.translate(0, 5); l.fillStyle = dark[pl.i]; l.fill(pl.path, 'evenodd'); l.restore(); }               // raised edge
    for (const pl of P) {
      if (!pl.path) continue;
      l.fillStyle = pl.color; l.fill(pl.path, 'evenodd');
      l.save(); l.clip(pl.path, 'evenodd'); l.fillStyle = l.createPattern(stripes[pl.i], 'repeat'); l.fillRect(0, 0, W, H); l.restore();
      l.lineWidth = 2.5; l.strokeStyle = lite[pl.i]; l.stroke(pl.path);
    }
  }
  function draw(dt) {
    if (dirty) { drawLand(); dirty = false; }
    const s = scale * dpr; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg, 0, 0);
    const sh = shake > 0 ? shake * 10 : 0, ox = (Math.random() - 0.5) * sh * s, oy = (Math.random() - 0.5) * sh * s;
    g.setTransform(1, 0, 0, 1, ox, oy); g.drawImage(landC, 0, 0); g.setTransform(s, 0, 0, s, ox, oy);
    for (const pl of P) if (pl.flash > 0 && pl.path) { g.globalAlpha = pl.flash * 0.45; g.fillStyle = '#fff'; g.fill(pl.path, 'evenodd'); g.globalAlpha = 1; pl.flash -= dt * 2.2; }
    // trails
    g.lineCap = g.lineJoin = 'round';
    for (const pl of P) {
      const t = pl.trail; if (pl.out || t.length < 2) continue;
      g.beginPath(); g.moveTo(t[0], t[1]); for (let k = 2; k < t.length; k += 2) g.lineTo(t[k], t[k + 1]); g.lineTo(pl.x, pl.y);
      g.shadowColor = pl.color; g.shadowBlur = 14 * s; g.strokeStyle = pl.color; g.globalAlpha = 0.5; g.lineWidth = TRAIL_W + 3; g.stroke();
      g.shadowBlur = 0; g.globalAlpha = 0.95; g.strokeStyle = lite[pl.i]; g.lineWidth = TRAIL_W * 0.45; g.stroke(); g.globalAlpha = 1;
    }
    // particles
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; const a = 1 - p.t / p.life; if (a <= 0) continue; g.globalAlpha = a; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r * a, 0, 7); g.fill(); }
    g.globalAlpha = 1; parts = parts.filter((p) => p.t < p.life);
    // heads
    const lead = [...P].filter((p) => !p.out).sort((a, b) => b.land - a.land)[0];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const pl of P) {
      if (pl.out) continue;
      const r = HEAD * (pl.freeze > 0 ? 1 + Math.sin(clock * 20) * 0.12 : 1), crown = pl === lead && pl.land > 0 && n > 1;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(pl.x + 2, pl.y + 7, r * 1.05, r * 0.85, 0, 0, 7); g.fill();
      const gr = g.createRadialGradient(pl.x - 4, pl.y - 5, 2, pl.x, pl.y, r); gr.addColorStop(0, lite[pl.i]); gr.addColorStop(1, pl.color);
      g.fillStyle = gr; g.beginPath(); g.arc(pl.x, pl.y, r, 0, 7); g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#fff'; g.stroke();
      const ex = Math.cos(pl.ang), ey = Math.sin(pl.ang), blink = (clock + pl.blink) % 3.2 < 0.12;
      for (const sd of [-1, 1]) { const cx = pl.x + ex * 4.5 - ey * sd * 5, cy = pl.y + ey * 4.5 + ex * sd * 5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, cy, 4.2, blink ? 0.8 : 4.2, pl.ang, 0, 7); g.fill(); if (!blink) { g.fillStyle = '#14110f'; g.beginPath(); g.arc(cx + ex * 1.6, cy + ey * 1.6, 2.1, 0, 7); g.fill(); } }
      if (crown) { g.fillStyle = '#ffc62b'; g.strokeStyle = '#14110f'; g.lineWidth = 2; g.beginPath(); const cx = pl.x, cy = pl.y - r - 3; g.moveTo(cx - 10, cy); g.lineTo(cx - 12, cy - 11); g.lineTo(cx - 5, cy - 6); g.lineTo(cx, cy - 13); g.lineTo(cx + 5, cy - 6); g.lineTo(cx + 12, cy - 11); g.lineTo(cx + 10, cy); g.closePath(); g.fill(); g.stroke(); }
      const fs = Math.max(15, 11 / scale); g.font = `900 ${fs}px "DM Sans", system-ui, sans-serif`; const tw = g.measureText(pl.name).width + fs, up = pl.y - r - (crown ? 30 : 16), ly = up < 14 ? pl.y + r + 16 : up, lx = Math.max(tw / 2 + 2, Math.min(W - tw / 2 - 2, pl.x));
      g.fillStyle = 'rgba(20,17,15,.8)'; g.beginPath(); g.roundRect(lx - tw / 2, ly - fs * 0.73, tw, fs * 1.46, fs * 0.73); g.fill(); g.fillStyle = '#fff'; g.fillText(pl.name, lx, ly + 1);
    }
    for (const t of texts) { t.t += dt; const a = 1 - t.t / 1.2; if (a <= 0) continue; g.globalAlpha = a; g.font = '400 30px "Bowlby One", "Arial Black", sans-serif'; g.lineWidth = 6; g.strokeStyle = '#14110f'; g.strokeText(t.text, t.x, t.y - t.t * 50); g.fillStyle = '#fff'; g.fillText(t.text, t.x, t.y - t.t * 50); }
    g.globalAlpha = 1; texts = texts.filter((t) => t.t < 1.2);
    if (shake > 0) shake -= dt * 3;
  }
  function hud() {
    const tot = Math.max(0, Math.ceil(left)), t = `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`;
    if (clockEl.textContent !== t) { clockEl.textContent = t; clockEl.classList.toggle('low', tot <= 10); }
    const max = Math.max(1, ...P.map((p) => p.land));
    P.forEach((pl, i) => { const pc = Math.round((pl.land / TOTAL) * 100), txt = pl.out ? 'OUT' : pc + '%', b = chips[i].querySelector('b'); if (b.textContent !== txt) b.textContent = txt; chips[i].querySelector('s').style.width = (pl.land / max) * 100 + '%'; chips[i].classList.toggle('out', pl.out); chips[i].style.order = String(-pl.land); });
  }
  function finish() {
    phase = 'done'; count();
    const ranked = [...P].sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : a.out ? b.outAt - a.outAt : b.land - a.land));
    pointRows = ranked.map((pl, i) => ({ id: pl.p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(ctx.stage, 'TURF WAR', 'Share of the map', ranked.map((pl, i) => ({ name: pl.name, color: pl.color, pts: pointRows[i].pts, extra: (pl.out ? 'out' : Math.round((pl.land / TOTAL) * 100) + '%') + ` · ${pl.kills} KO` })));
    const v = ctx.vip(); for (const p of ctx.players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Turf War is over', text: 'Results are on the big screen.' });
    ctx.beep(880, 0.15); setTimeout(() => ctx.beep(1320, 0.3), 140);
  }
  function tick(dt) {
    left -= dt;
    for (const pl of P) if (!pl.out) stepPlayer(pl, dt);
    collisions();
    const alive = P.filter((pl) => !pl.out);
    if ((n > 1 && alive.length <= 1) || P.some((pl) => pl.land / TOTAL >= WIN_SHARE) || left <= 0) finish();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    if (phase === 'countdown') { cd -= dt; const s = Math.ceil(cd); if (s !== lastCd) { lastCd = s; if (s > 0) { big.innerHTML = `<span>${s}</span>`; ctx.beep(440, 0.15); } else { big.innerHTML = '<span>GO!</span>'; ctx.beep(880, 0.4); phase = 'play'; setTimeout(() => { big.innerHTML = ''; }, 800); } } }
    if (phase === 'play') {
      const steps = Math.max(1, Math.ceil(dt / (1 / 90))); for (let k = 0; k < steps && phase === 'play'; k++) tick(dt / steps);
      sendT -= dt; if (sendT <= 0) { sendT = 0.5; for (const pl of P) if (!pl.out) ctx.to(pl.p.id, { e: 'tf', pct: Math.round((pl.land / TOTAL) * 100) }); }
    }
    draw(dt); hud();
  }
  raf = requestAnimationFrame(frame);
  window.__turf = { P, own, C, R, W, H, G, tick, get phase() { return phase; }, setLeft: (v) => { left = v; }, redraw: () => { dirty = true; } };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      const pl = P.find((x) => x.p === p); if (!pl || pl.out) return;
      if (d.a === 'ang' && Number.isFinite(+d.r)) { pl.target = +d.r; if (!pl.moving && pl.freeze <= 0) { pl.moving = true; pl.ang = pl.target; } }
    },
    onLeave(p) { const pl = P.find((x) => x.p === p); if (pl) pl.moving = false; },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', resize); window.__turf = null; },
  };
}
