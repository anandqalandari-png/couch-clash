// Blast Zone: classic bomb arena. Blow up crates, grab pickups, trap your friends.
// Knocked-out players become ghosts who run along the outer wall and lob bombs back in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { showResults } from './host.js';
import { nameTag, glow, canvasTex, Particles, clamp, rnd } from './race-world.js';

const WIN_ROUNDS = 3, FUSE = 2.2, FLAME = 0.5, SUDDEN = 75, GHOST_CD = 3.5, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const CHARS = ['male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c', 'male-d', 'female-d'];
const PICKUPS = { b: ['💣', '#2b7bff', '+1 bomb'], r: ['🔥', '#ff4b2b', 'Bigger blast'], s: ['👟', '#19c2a0', 'Faster'] };

export function start(ctx) {
  const stage = ctx.stage, n = ctx.players.length, C = n > 5 ? 21 : 17, R = 11; // a wide arena to suit a laptop or TV screen; it gets wider with six or more players
  const P = ctx.players.map((p, i) => ({ p, i, name: p.name, color: p.color, x: 1, y: 1, face: 0, jx: 0, jy: 0, alive: true, s: 0, ghostCd: 0, maxB: 1, range: 2, speed: 4.2, active: 0, wins: 0, kills: 0, node: null, mixer: null, acts: {}, cur: '', mats: [] }));
  const SPAWNS = [[1, 1], [C - 2, R - 2], [C - 2, 1], [1, R - 2], [(C - 1) / 2, 1], [(C - 1) / 2, R - 2], [1, (R - 1) / 2], [C - 2, (R - 1) / 2]];
  const X = (c) => c - (C - 1) / 2, Z = (r) => r - (R - 1) / 2, PER = 2 * (C - 1) + 2 * (R - 1);
  let grid = [], crates = new Map(), bombs = [], flames = new Map(), pickups = new Map(), fallen = [], spiral = [], spiralT = 0, roundT = 0;
  let phase = 'loading', stopped = false, raf = 0, last = performance.now(), wait = 0, lastNum = 4, pointRows = [], renderer, scene, cam, FX, layout = () => {}, crateGeo, crateMat, level;

  // ---------- HUD ----------
  const hud = document.createElement('div'); hud.className = 'bz';
  hud.innerHTML = `<div class="bz-top"><div class="bz-clock"></div><div class="bz-chips"></div></div><div class="fb-banner"></div>`;
  const big = document.createElement('div'); big.className = 'bigmsg'; big.style.background = '#1c2a4a'; big.innerHTML = '<span style="font-size:9vh">Loading arena…</span>';
  const q = (s) => hud.querySelector(s);
  function renderHud() {
    const el = q('.bz-chips'); el.innerHTML = '';
    for (const c of P) { const d = document.createElement('div'); d.className = c.alive ? '' : 'dead'; d.innerHTML = `<i style="background:${c.color}"></i><span></span><b>${'★'.repeat(c.wins)}${'☆'.repeat(WIN_ROUNDS - c.wins)}</b>`; d.children[1].textContent = (c.alive ? '' : '👻 ') + c.name; el.appendChild(d); }
  }
  function banner(html, ms = 2200) { const b = q('.fb-banner'); b.innerHTML = html; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), ms); }
  const tell = (c) => ctx.to(c.p.id, { e: 'pad', title: c.alive ? '' : 'GHOST', sub: c.alive ? `💣 ${c.maxB}   🔥 ${c.range}   👟 ${Math.round((c.speed - 4.2) / 0.6)}` : 'Run along the wall and throw bombs in' });

  // ---------- grid helpers ----------
  const key = (c, r) => r * C + c;
  const solidAt = (c, r) => c < 0 || r < 0 || c >= C || r >= R || grid[r][c] !== 0;
  const bombAt = (c, r) => bombs.find((b) => b.c === c && b.r === r);
  const blockedFor = (pl, c, r) => { if (solidAt(c, r)) return true; const b = bombAt(c, r); return !!b && !b.pass.has(pl); };
  function perim(s) { // a point on the outer wall, with the direction along the wall and the direction into the arena
    s = ((s % PER) + PER) % PER;
    if (s < C - 1) return { x: s, y: 0, tx: 1, ty: 0, nx: 0, ny: 1 };
    s -= C - 1; if (s < R - 1) return { x: C - 1, y: s, tx: 0, ty: 1, nx: -1, ny: 0 };
    s -= R - 1; if (s < C - 1) return { x: C - 1 - s, y: R - 1, tx: -1, ty: 0, nx: 0, ny: -1 };
    s -= C - 1; return { x: 0, y: R - 1 - s, tx: 0, ty: -1, nx: 1, ny: 0 };
  }

  // ---------- round setup ----------
  function newRound() {
    for (const m of crates.values()) level.remove(m); for (const b of bombs) level.remove(b.mesh); for (const f of flames.values()) level.remove(f.mesh); for (const p of pickups.values()) level.remove(p.mesh); for (const f of fallen) level.remove(f.mesh);
    crates = new Map(); bombs = []; flames = new Map(); pickups = new Map(); fallen = []; grid = []; roundT = 0; spiralT = 0;
    for (let r = 0; r < R; r++) { grid.push([]); for (let c = 0; c < C; c++) grid[r].push(r === 0 || c === 0 || r === R - 1 || c === C - 1 || (r % 2 === 0 && c % 2 === 0) ? 1 : 0); }
    const safe = new Set(); P.forEach((pl, i) => { const [sc, sr] = SPAWNS[i]; for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) safe.add(key(sc + dc, sr + dr)); });
    for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) if (grid[r][c] === 0 && !safe.has(key(c, r)) && Math.random() < 0.72) {
      grid[r][c] = 2; const m = new THREE.Mesh(crateGeo, crateMat); m.position.set(X(c), 0, Z(r)); m.rotation.y = Math.floor(Math.random() * 4) * Math.PI / 2; m.castShadow = m.receiveShadow = true; level.add(m); crates.set(key(c, r), m);
    }
    // the order in which the arena closes in during sudden death: a spiral from the outside
    spiral = []; let c0 = 1, r0 = 1, c1 = C - 2, r1 = R - 2;
    while (c0 <= c1 && r0 <= r1) { for (let c = c0; c <= c1; c++) spiral.push([c, r0]); for (let r = r0 + 1; r <= r1; r++) spiral.push([c1, r]); if (r1 > r0) for (let c = c1 - 1; c >= c0; c--) spiral.push([c, r1]); if (c1 > c0) for (let r = r1 - 1; r > r0; r--) spiral.push([c0, r]); c0++; r0++; c1--; r1--; }
    P.forEach((pl, i) => {
      const [sc, sr] = SPAWNS[i]; Object.assign(pl, { x: sc, y: sr, alive: true, maxB: 1, range: 2, speed: 4.2, active: 0, jx: 0, jy: 0, ghostCd: 0, face: Math.atan2(-X(sc), -Z(sr)) });
      pl.node.scale.setScalar(1.85); for (const m of pl.mats) { m.transparent = false; m.opacity = 1; m.needsUpdate = true; } play(pl, 'idle'); tell(pl);
    });
    renderHud(); phase = 'count'; wait = 3.999; lastNum = 4;
  }
  function play(pl, name) {
    if (pl.cur === name || !pl.acts[name]) return; const prev = pl.acts[pl.cur], next = pl.acts[name]; pl.cur = name;
    next.reset(); next.play(); if (prev) prev.crossFadeTo(next, 0.12, false);
  }

  // ---------- bombs ----------
  function addBomb(c, r, owner, range, thrown) {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.35, metalness: 0.4 })); body.castShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0x8a8f9c, metalness: 0.7, roughness: 0.3 })); cap.position.y = 0.38; g.add(cap);
    const sp = glow(0xffa21a, 0.9, 1); sp.position.y = 0.56; g.add(sp);
    g.position.set(X(c), thrown ? 5 : 0.4, Z(r)); level.add(g);
    const b = { c, r, owner, range, t: FUSE, mesh: g, spark: sp, pass: new Set(P.filter((pl) => pl.alive && Math.abs(pl.x - c) < 0.95 && Math.abs(pl.y - r) < 0.95)), thrown };
    bombs.push(b); return b;
  }
  function explode(b) {
    const i = bombs.indexOf(b); if (i < 0) return; bombs.splice(i, 1); level.remove(b.mesh); if (!b.thrown) b.owner.active = Math.max(0, b.owner.active - 1);
    const cells = [[b.c, b.r]];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= b.range; k++) {
      const c = b.c + dc * k, r = b.r + dr * k, g = grid[r] ? grid[r][c] : 1; if (g === 1 || g === undefined) break; cells.push([c, r]);
      if (g === 2) { breakCrate(c, r); break; }
      const o = bombAt(c, r); if (o) o.t = Math.min(o.t, 0.09); // chain reaction
    }
    for (const [c, r] of cells) {
      const k = key(c, r), old = flames.get(k); if (old) level.remove(old.mesh);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.7, 0.92), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(X(c), 0.4, Z(r)); m.add(glow(0xff7a1a, 3.2, 0.9)); level.add(m);
      flames.set(k, { t: FLAME, mesh: m, owner: b.owner });
      for (let e = 0; e < 7; e++) FX.emit(X(c) + rnd(-0.4, 0.4), rnd(0.2, 0.8), Z(r) + rnd(-0.4, 0.4), rnd(-1.5, 1.5), rnd(1.5, 5), rnd(-1.5, 1.5), rnd(0.35, 0.8), rnd(0.25, 0.5), Math.random() < 0.5 ? fire : fire2, 1, 1.2);
    }
    ctx.sfx('break', 0.7); ctx.beep(80, 0.25, 'sawtooth', 0.05); shake = 0.25;
  }
  function breakCrate(c, r) {
    const k = key(c, r), m = crates.get(k); if (m) level.remove(m); crates.delete(k); grid[r][c] = 0;
    for (let e = 0; e < 12; e++) FX.emit(X(c) + rnd(-0.3, 0.3), rnd(0.2, 0.9), Z(r) + rnd(-0.3, 0.3), rnd(-3, 3), rnd(2, 6), rnd(-3, 3), rnd(0.4, 0.8), 0.22, wood, 1, 0.2, 14);
    if (Math.random() < 0.34) { const t = ['b', 'r', 'r', 's', 'b'][Math.floor(Math.random() * 5)], s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickTex[t] })); s.scale.setScalar(0.78); s.position.set(X(c), 0.55, Z(r)); level.add(s); pickups.set(k, { t, mesh: s, born: roundT }); }
  }
  function kill(pl, by) {
    if (!pl.alive || phase !== 'play') return; pl.alive = false; pl.jx = pl.jy = 0;
    if (by && by !== pl) by.kills++;
    for (let e = 0; e < 30; e++) FX.emit(X(pl.x) + rnd(-0.3, 0.3), rnd(0.2, 1.2), Z(pl.y) + rnd(-0.3, 0.3), rnd(-4, 4), rnd(2, 8), rnd(-4, 4), rnd(0.5, 1), 0.3, new THREE.Color(pl.color), 1, 0.3, 12);
    let best = 0, bd = 1e9; for (let s = 0; s < PER; s += 0.5) { const q2 = perim(s), d = (q2.x - pl.x) ** 2 + (q2.y - pl.y) ** 2; if (d < bd) { bd = d; best = s; } } pl.s = best; pl.ghostCd = 2;
    pl.node.scale.setScalar(1.4); for (const m of pl.mats) { m.transparent = true; m.opacity = 0.5; m.needsUpdate = true; } play(pl, 'idle');
    ctx.sfx('fall', 0.8); ctx.to(pl.p.id, { e: 'pad', buzz: [100, 60, 250] }); tell(pl); renderHud();
    banner(`<p></p>`, 1600); q('.fb-banner p').textContent = by && by !== pl ? `${by.name} blew up ${pl.name}` : `${pl.name} blew themselves up`;
  }

  // ---------- movement ----------
  function move(pl, dx, dy, dist) { // grid movement with corner help: pressing sideways while between two rows slides you into the open one
    const ax = dx ? 'x' : 'y', bx = dx ? 'y' : 'x', d = dx || dy;
    const next = d > 0 ? Math.floor(pl[ax] + 1e-6) + 1 : Math.ceil(pl[ax] - 1e-6) - 1, near = Math.round(pl[bx]);
    const cell = (line) => (dx ? blockedFor(pl, next, line) : blockedFor(pl, line, next));
    let line = near; const off0 = pl[bx] - near;
    if (cell(near) && Math.abs(off0) > 0.08) { const other = near + Math.sign(off0); if (!cell(other)) line = other; }
    const off = line - pl[bx];
    if (Math.abs(off) > 1e-3) { const s = Math.min(dist, Math.abs(off)); pl[bx] += Math.sign(off) * s; dist -= s; if (dist <= 1e-6 || cell(line)) return; }
    let np = pl[ax] + d * dist; if (cell(line)) { const lim = next - d; np = d > 0 ? Math.min(np, Math.max(lim, pl[ax])) : Math.max(np, Math.min(lim, pl[ax])); }
    pl[ax] = np;
  }
  function step(dt) {
    roundT += dt;
    for (const pl of P) {
      const m = Math.hypot(pl.jx, pl.jy);
      if (pl.alive) {
        if (m > 0.3) { const h = Math.abs(pl.jx) > Math.abs(pl.jy), dx = h ? Math.sign(pl.jx) : 0, dy = h ? 0 : Math.sign(pl.jy); move(pl, dx, dy, pl.speed * dt); pl.face = Math.atan2(dx, dy); play(pl, 'walk'); } else play(pl, 'idle');
        const c = Math.round(pl.x), r = Math.round(pl.y), pk = pickups.get(key(c, r));
        if (pk) { pickups.delete(key(c, r)); level.remove(pk.mesh); if (pk.t === 'b') pl.maxB = Math.min(6, pl.maxB + 1); else if (pk.t === 'r') pl.range = Math.min(8, pl.range + 1); else pl.speed = Math.min(6, pl.speed + 0.6); ctx.sfx('coin', 0.7); tell(pl); ctx.to(pl.p.id, { e: 'pad', buzz: 25 }); }
        const f = flames.get(key(c, r)); if (f) kill(pl, f.owner);
      } else { // ghost on the wall
        const g = perim(pl.s); if (m > 0.3) { pl.s += (pl.jx * g.tx + pl.jy * g.ty) / m * 6 * dt; pl.face = Math.atan2(g.nx, g.ny); }
        if (pl.ghostCd > 0) pl.ghostCd -= dt;
      }
    }
    for (const b of [...bombs]) {
      b.t -= dt; for (const pl of [...b.pass]) if (!pl.alive || Math.abs(pl.x - b.c) >= 0.95 || Math.abs(pl.y - b.r) >= 0.95) b.pass.delete(pl);
      if (b.mesh.position.y > 0.4) b.mesh.position.y = Math.max(0.4, b.mesh.position.y - 14 * dt);
      const pulse = 1 + Math.sin((FUSE - b.t) * (6 + (FUSE - b.t) * 5)) * 0.12; b.mesh.scale.setScalar(pulse); b.spark.material.opacity = 0.6 + 0.4 * Math.random();
      if (b.t <= 0) explode(b);
    }
    for (const [k, f] of flames) { f.t -= dt; f.mesh.material.opacity = Math.max(0, f.t / FLAME) * 0.9; f.mesh.scale.y = 0.6 + (f.t / FLAME) * 0.8; if (f.t <= 0) { level.remove(f.mesh); flames.delete(k); } }
    if (roundT > SUDDEN && spiral.length) { // sudden death: the arena fills in from the outside
      spiralT -= dt; if (spiralT <= 0) { spiralT = 0.32; let cell; do { cell = spiral.shift(); } while (cell && grid[cell[1]][cell[0]] === 1); if (cell) {
        const [c, r] = cell, k = key(c, r); if (crates.has(k)) { level.remove(crates.get(k)); crates.delete(k); } const pk = pickups.get(k); if (pk) { level.remove(pk.mesh); pickups.delete(k); } const b = bombAt(c, r); if (b) { bombs.splice(bombs.indexOf(b), 1); level.remove(b.mesh); if (!b.thrown) b.owner.active = Math.max(0, b.owner.active - 1); }
        grid[r][c] = 1; const m = new THREE.Mesh(blockGeo, blockMat2); m.position.set(X(c), 9, Z(r)); m.castShadow = true; level.add(m); fallen.push({ mesh: m });
        for (const pl of P) if (pl.alive && Math.round(pl.x) === c && Math.round(pl.y) === r) kill(pl, null); ctx.beep(140, 0.06, 'square', 0.03);
      } }
    }
    for (const f of fallen) if (f.mesh.position.y > 0.5) f.mesh.position.y = Math.max(0.5, f.mesh.position.y - 30 * dt);
    const alive = P.filter((pl) => pl.alive);
    if (phase === 'play' && alive.length <= (n > 1 ? 1 : 0)) {
      phase = 'roundEnd'; wait = 3.2; const w = alive[0];
      if (w) { w.wins++; play(w, 'win'); banner(`<h3 style="color:${w.color}"></h3><p>wins the round</p>`, 3000); q('.fb-banner h3').textContent = w.name; ctx.beep(660, 0.15); setTimeout(() => ctx.beep(990, 0.3), 150); } else banner('<h3>DRAW</h3><p>nobody survived</p>', 3000);
      renderHud();
    }
  }
  function dropBomb(pl) {
    if (phase !== 'play') return;
    if (pl.alive) { const c = Math.round(pl.x), r = Math.round(pl.y); if (pl.active >= pl.maxB || bombAt(c, r) || grid[r][c] !== 0) return; pl.active++; addBomb(c, r, pl, pl.range, false); ctx.sfx('land', 0.5); return; }
    if (pl.ghostCd > 0) return; const g = perim(pl.s), c0 = Math.round(g.x), r0 = Math.round(g.y);
    for (let k = 1; k <= 3; k++) { const c = c0 + g.nx * k, r = r0 + g.ny * k; if (c <= 0 || r <= 0 || c >= C - 1 || r >= R - 1) break; if (grid[r][c] === 0 && !bombAt(c, r)) { addBomb(c, r, pl, 2, true); pl.ghostCd = GHOST_CD; ctx.sfx('jump', 0.5); ctx.to(pl.p.id, { e: 'pad', cd: GHOST_CD }); return; } }
  }

  // ---------- scene ----------
  const fire = new THREE.Color(0xffb02a), fire2 = new THREE.Color(0xff5a1a), wood = new THREE.Color(0xc98a4a);
  let shake = 0, blockGeo, blockMat2; const pickTex = {};
  async function init() {
    stage.appendChild(big);
    for (const c of P) ctx.to(c.p.id, { m: 'pad', btn: 'BOMB', color: c.color, title: 'Loading…', sub: '', four: 1 });
    const loader = new GLTFLoader(), safe = (u) => loader.loadAsync(u).catch(() => null);
    const [brick, ...chars] = await Promise.all([safe('/assets/blocks/brick.glb'), ...P.map((pl, i) => safe(`/assets/chars/character-${CHARS[i % CHARS.length]}.glb`))]);
    if (stopped) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; stage.appendChild(renderer.domElement); stage.appendChild(hud);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1c2a4a); level = new THREE.Group(); scene.add(level);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a8a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.0); sun.position.set(-7, 18, 9); sun.castShadow = true; scene.add(sun);
    const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 10; sc.bottom = -10; sc.near = 2; sc.far = 50; sc.updateProjectionMatrix(); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
    const lam = (o) => new THREE.MeshLambertMaterial(o);
    // floor
    const floorTex = canvasTex(C * 48, R * 48, (c) => { for (let r = 0; r < R; r++) for (let x = 0; x < C; x++) { c.fillStyle = (r + x) % 2 ? '#6fc267' : '#7dcf73'; c.fillRect(x * 48, r * 48, 48, 48); c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(x * 48, r * 48 + 44, 48, 4); } });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C, R), lam({ map: floorTex })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const table = new THREE.Mesh(new THREE.BoxGeometry(C + 1.2, 1.2, R + 1.2), lam({ color: 0x24375f })); table.position.y = -0.62; table.receiveShadow = true; scene.add(table);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), lam({ color: 0x17233f })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2; scene.add(ground);
    // fixed blocks (outer wall and pillars)
    const stoneTex = canvasTex(64, 64, (c) => { c.fillStyle = '#7d8aa6'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#93a0bb'; c.fillRect(4, 4, 56, 52); c.fillStyle = '#6b7791'; c.fillRect(4, 52, 56, 8); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(8, 8, 48, 6); });
    blockGeo = new THREE.BoxGeometry(1, 1, 1); const blockMat = lam({ map: stoneTex }); blockMat2 = lam({ map: stoneTex, color: 0xff9a8a });
    const solids = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (r === 0 || c === 0 || r === R - 1 || c === C - 1 || (r % 2 === 0 && c % 2 === 0)) solids.push([c, r]);
    const im = new THREE.InstancedMesh(blockGeo, blockMat, solids.length); const mtx = new THREE.Matrix4(); solids.forEach(([c, r], i) => { mtx.makeTranslation(X(c), 0.5, Z(r)); im.setMatrixAt(i, mtx); }); im.castShadow = im.receiveShadow = true; scene.add(im);
    // crates: Kenney's brick block, or a plain wooden box if the model is missing
    const bm = brick && (() => { let f = null; brick.scene.updateMatrixWorld(true); brick.scene.traverse((o) => { if (o.isMesh && !f) f = o; }); return f; })();
    if (bm) { crateGeo = bm.geometry.clone().applyMatrix4(bm.matrixWorld); crateGeo.scale(0.94, 0.94, 0.94); crateMat = lam({ map: bm.material.map, color: 0xffffff }); }
    else { crateGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92); crateGeo.translate(0, 0.46, 0); crateMat = lam({ color: 0xc98a4a }); }
    for (const [t, [icon, col]] of Object.entries(PICKUPS)) pickTex[t] = canvasTex(128, 128, (c) => { c.fillStyle = col; c.beginPath(); c.roundRect(8, 8, 112, 112, 28); c.fill(); c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke(); c.font = '72px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon, 64, 70); });
    // characters
    P.forEach((pl, i) => {
      const g = chars[i], node = new THREE.Group(); pl.node = node; scene.add(node);
      if (g) {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); pl.mats.push(o.material); } }); node.add(g.scene);
        pl.mixer = new THREE.AnimationMixer(g.scene); const clip = (nm) => g.animations.find((a) => a.name === nm);
        for (const [k, nm] of [['idle', 'idle'], ['walk', 'sprint'], ['win', 'emote-yes']]) { const cl = clip(nm) || clip('walk') || clip('idle'); if (cl) pl.acts[k] = pl.mixer.clipAction(cl); }
      } else { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 6, 12), new THREE.MeshStandardMaterial({ color: pl.color })); m.position.y = 0.37; m.castShadow = true; node.add(m); pl.mats.push(m.material); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.29, 28), new THREE.MeshBasicMaterial({ color: pl.color, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; node.add(ring);
      const tag = nameTag(pl.name, pl.color); tag.scale.set(0.96, 0.24, 1); tag.position.y = 0.95; node.add(tag);
    });
    FX = new Particles(scene, 1200);
    cam = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
    layout = () => { const w = innerWidth, h = innerHeight, a = w / h, k = Math.max(1, (C + 5.5) / (11.7 * a)); renderer.setSize(w, h); cam.aspect = a; cam.position.set(0, 17.6 * k, 7.9 * k); cam.lookAt(0, 0, 0.25); cam.updateProjectionMatrix(); FX.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 1.6; };
    layout(); addEventListener('resize', layout);
    big.remove(); newRound(); raf = requestAnimationFrame(frame);
  }
  function finish() {
    phase = 'done';
    const ranked = [...P].sort((a, b) => b.wins - a.wins || b.kills - a.kills); pointRows = ranked.map((c, i) => ({ id: c.p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(stage, 'BLAST ZONE', `First to ${WIN_ROUNDS} rounds`, ranked.map((c, i) => ({ name: c.name, color: c.color, pts: pointRows[i].pts, extra: `${c.wins} round${c.wins === 1 ? '' : 's'} · ${c.kills} KO` })));
    const v = ctx.vip(); for (const p of ctx.players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Blast Zone is over', text: 'Results are on the big screen.' });
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (phase === 'count') { wait -= dt; const s = Math.ceil(wait); if (s !== lastNum) { lastNum = s; if (s > 0) { banner(`<h3>${s}</h3>`, 900); ctx.beep(440, 0.12); } else { banner('<h3>GO!</h3>', 700); ctx.beep(880, 0.3); phase = 'play'; } } }
    else if (phase === 'play') step(dt);
    else if (phase === 'roundEnd') { step(dt); wait -= dt; if (wait <= 0) { if (P.some((pl) => pl.wins >= WIN_ROUNDS)) finish(); else newRound(); } }
    for (const pl of P) {
      if (pl.alive) pl.node.position.set(X(pl.x), 0, Z(pl.y)); else { const g = perim(pl.s); pl.node.position.set(X(g.x), 1 + Math.sin(now / 300 + pl.i) * 0.08, Z(g.y)); }
      let d = pl.face - pl.node.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); pl.node.rotation.y += d * Math.min(1, dt * 16);
      if (pl.mixer) pl.mixer.update(dt);
    }
    for (const p of pickups.values()) p.mesh.position.y = 0.55 + Math.sin(now / 250 + p.mesh.position.x) * 0.08;
    FX.update(dt);
    const tl = Math.max(0, Math.ceil(SUDDEN - roundT)), ce = q('.bz-clock'), txt = phase === 'play' || phase === 'roundEnd' ? (tl > 0 ? `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}` : 'SUDDEN DEATH') : ''; if (ce.textContent !== txt) { ce.textContent = txt; ce.classList.toggle('low', tl <= 10); }
    if (shake > 0) { shake -= dt; cam.position.x = rnd(-0.08, 0.08); } else cam.position.x = 0;
    renderer.render(scene, cam);
  }
  init();
  window.__bz = { P, step, dropBomb, move, kill, get grid() { return grid; }, get bombs() { return bombs; }, get flames() { return flames; }, get pickups() { return pickups; }, get phase() { return phase; }, setPhase: (p) => { phase = p; }, setRoundT: (v) => { roundT = v; }, C, R };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      const pl = P.find((x) => x.p === p); if (!pl) return;
      if (d.a === 'joy') { pl.jx = clamp(+d.x || 0, -1, 1); pl.jy = clamp(+d.y || 0, -1, 1); }
      if (d.a === 'btn' && d.d) dropBomb(pl);
    },
    onLeave(p) { const pl = P.find((x) => x.p === p); if (pl) pl.jx = pl.jy = 0; },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('resize', layout); if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); } window.__bz = null; },
  };
}
