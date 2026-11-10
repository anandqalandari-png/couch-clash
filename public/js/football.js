// Car Football: cars and one big ball, seen from above. Teams are reshuffled after every goal,
// so the score that counts is personal: 1 point for everyone on the scoring team, 1 extra for the scorer.
import * as THREE from 'three';
import { showResults } from './host.js';
import { loadAssets, buildCar, nameTag, glow, canvasTex, Particles, clamp, rnd } from './race-world.js';

const MATCH_TIME = 180, FL = 54, FW = 33, GOAL_W = 11, CH = 10, BALL_R = 2.8, RANK_POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const ACC = 75, TOP = 42, BOOST_TOP = 68, BOOST_CD = 3;
const TEAMS = [{ name: 'RED', color: '#ff4b2b' }, { name: 'BLUE', color: '#2b7bff' }]; // RED defends the left goal, BLUE the right
const MODELS = ['race-future', 'sedan-sports', 'hatchback-sports', 'race', 'taxi', 'police', 'van', 'truck'];

export function start(ctx) {
  const stage = ctx.stage, n = ctx.players.length;
  const P = ctx.players.map((p, i) => ({ p, i, name: p.name, color: p.color, team: i % 2, x: 0, z: 0, h: 0, vx: 0, vz: 0, jx: 0, jz: 0, boostCd: 0, boostT: 0, pts: 0, goals: 0, mesh: null, ring: null, touchT: 0 }));
  const ball = { x: 0, z: 0, y: BALL_R, vx: 0, vz: 0, vy: 0, last: null, mesh: null };
  const tally = [0, 0];
  let phase = 'loading', stopped = false, raf = 0, last = performance.now(), left = MATCH_TIME, wait = 0, clock = 0, pointRows = [], renderer, scene, cam, FX, layout = () => {};

  // ---------- on-screen HUD ----------
  const hud = document.createElement('div'); hud.className = 'fb';
  hud.innerHTML = `<div class="fb-top"><div class="fb-team t0"><b>RED <em>0</em></b><span></span></div><div class="fb-clock"></div><div class="fb-team t1"><b><em>0</em> BLUE</b><span></span></div></div><div class="fb-scores"></div><div class="fb-banner"></div>`;
  const big = document.createElement('div'); big.className = 'bigmsg'; big.style.background = '#0e1430'; big.innerHTML = '<span style="font-size:9vh">Loading stadium…</span>';
  const q = (s) => hud.querySelector(s);
  function renderHud() {
    for (const t of [0, 1]) { q('.t' + t + ' span').textContent = P.filter((c) => c.team === t).map((c) => c.name).join(' · '); q('.t' + t + ' em').textContent = tally[t]; }
    const el = q('.fb-scores'); el.innerHTML = '';
    for (const c of [...P].sort((a, b) => b.pts - a.pts)) { const d = document.createElement('div'); d.innerHTML = `<i style="background:${c.color}"></i><span></span><b>${c.pts}</b>`; d.children[1].textContent = c.name; d.style.borderColor = TEAMS[c.team].color; el.appendChild(d); }
  }
  function banner(html, ms = 2200) { const b = q('.fb-banner'); b.innerHTML = html; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), ms); }

  // ---------- teams and kick-off ----------
  function newTeams(first) {
    const before = P.map((c) => c.team).join('');
    for (let tries = 0; tries < 12; tries++) { // reshuffle until the line-ups actually change; the bigger side alternates at random
      const order = [...P].sort(() => Math.random() - 0.5), flip = Math.random() < 0.5 ? 0 : 1; order.forEach((c, i) => { c.team = (i + flip) % 2; });
      if (first || n < 3 || P.map((c) => c.team).join('') !== before) break;
    }
    for (const c of P) {
      if (c.ring) c.ring.material.color.set(TEAMS[c.team].color);
      ctx.to(c.p.id, { e: 'pad', bg: TEAMS[c.team].color, title: TEAMS[c.team].name + ' TEAM', sub: c.team === 0 ? 'Score in the BLUE goal (right side)' : 'Score in the RED goal (left side)', buzz: first ? 0 : 60 });
    }
    renderHud();
  }
  function kickoff() {
    for (const t of [0, 1]) { const m = P.filter((c) => c.team === t); m.forEach((c, k) => { c.x = (t ? 1 : -1) * FL * (0.38 + 0.16 * (k % 2)); c.z = (k - (m.length - 1) / 2) * 12; c.h = t ? -Math.PI / 2 : Math.PI / 2; c.vx = c.vz = 0; c.boostT = 0; c.boostCd = 0; }); }
    Object.assign(ball, { x: 0, z: 0, y: BALL_R, vx: 0, vz: 0, vy: 0, last: null });
  }

  // ---------- physics ----------
  function corner(o, r, rest) { // the four corners of the pitch are cut off so the ball never gets stuck in one
    const ax = Math.abs(o.x), az = Math.abs(o.z); if (ax <= FL - CH || az <= FW - CH) return;
    const over = (ax - (FL - CH)) + (az - (FW - CH)) - (CH - r * 1.414); if (over <= 0) return;
    const sx = Math.sign(o.x), sz = Math.sign(o.z); o.x -= sx * over / 2; o.z -= sz * over / 2;
    const nx = sx * 0.7071, nz = sz * 0.7071, vn = o.vx * nx + o.vz * nz; if (vn > 0) { o.vx -= (1 + rest) * vn * nx; o.vz -= (1 + rest) * vn * nz; }
  }
  function goal(team) {
    phase = 'goal'; wait = 3.2; tally[team]++;
    const scorer = ball.last && ball.last.team === team ? ball.last : null, own = ball.last && ball.last.team !== team ? ball.last : null;
    for (const c of P) if (c.team === team) c.pts++;
    if (scorer) { scorer.pts++; scorer.goals++; }
    banner(`<h3 style="color:${TEAMS[team].color}">GOAL!</h3><p></p>`, 3000); q('.fb-banner p').textContent = scorer ? scorer.name + ' scores for ' + TEAMS[team].name : own ? 'Own goal by ' + own.name : TEAMS[team].name + ' score';
    const col = new THREE.Color(TEAMS[team].color), wh = new THREE.Color(0xffffff);
    for (let k = 0; k < 260; k++) FX.emit(ball.x + rnd(-4, 4), rnd(2, 8), ball.z + rnd(-10, 10), rnd(-30, 30), rnd(20, 60), rnd(-30, 30), rnd(1, 2.4), rnd(1.2, 2.4), Math.random() < 0.6 ? col : wh, 1, 0.1, 55);
    ctx.sfx('coin'); ctx.beep(660, 0.15); setTimeout(() => ctx.beep(990, 0.15), 150); setTimeout(() => ctx.beep(1320, 0.4), 300);
    for (const c of P) ctx.to(c.p.id, { e: 'pad', buzz: c.team === team ? [80, 60, 80, 60, 200] : 250 });
    renderHud();
  }
  function step(dt) {
    for (const c of P) {
      const jm = Math.hypot(c.jx, c.jz), fx0 = Math.sin(c.h), fz0 = Math.cos(c.h);
      if (jm > 0.15) {
        let d = Math.atan2(c.jx, c.jz) - c.h; d = Math.atan2(Math.sin(d), Math.cos(d)); c.h += clamp(d, -6 * dt, 6 * dt);
        const thr = Math.min(1, jm) * (Math.abs(d) > 2 ? 0.3 : 1) * (c.boostT > 0 ? 1.8 : 1); c.vx += Math.sin(c.h) * ACC * thr * dt; c.vz += Math.cos(c.h) * ACC * thr * dt;
      }
      const fx = Math.sin(c.h), fz = Math.cos(c.h); let vf = c.vx * fx + c.vz * fz, vl = c.vx * fz - c.vz * fx; // split speed into "along the car" and "sideways"
      vf *= Math.exp(-(jm > 0.15 ? 0.9 : 2.4) * dt); vl *= Math.exp(-7 * dt); vf = clamp(vf, -25, c.boostT > 0 ? BOOST_TOP : TOP);
      c.vx = fx * vf + fz * vl; c.vz = fz * vf - fx * vl; c.x += c.vx * dt; c.z += c.vz * dt; c.vf = vf; c.dh = (c.h - (c.ph ?? c.h)); c.ph = c.h;
      if (Math.abs(c.x) > FL - 2.6) { c.x = Math.sign(c.x) * (FL - 2.6); c.vx *= -0.3; }
      if (Math.abs(c.z) > FW - 2.6) { c.z = Math.sign(c.z) * (FW - 2.6); c.vz *= -0.3; }
      corner(c, 2.6, 0.3);
      if (c.boostT > 0) c.boostT -= dt; if (c.boostCd > 0) c.boostCd -= dt; if (c.touchT > 0) c.touchT -= dt;
    }
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) { // cars bump each other
      const A = P[a], B = P[b], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), min = 5;
      if (d < min && d > 1e-4) { const nx = dx / d, nz = dz / d, o = (min - d) / 2; A.x -= nx * o; A.z -= nz * o; B.x += nx * o; B.z += nz * o; const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz; if (rv < 0) { const j = -0.8 * rv; A.vx -= nx * j; A.vz -= nz * j; B.vx += nx * j; B.vz += nz * j; } }
    }
    const b = ball, drag = Math.exp(-0.45 * dt); b.vx *= drag; b.vz *= drag; b.x += b.vx * dt; b.z += b.vz * dt;
    b.vy -= 70 * dt; b.y += b.vy * dt; if (b.y < BALL_R) { b.y = BALL_R; b.vy = b.vy < -10 ? -b.vy * 0.5 : 0; }
    for (const c of P) { // each car is two circles, so the nose and the tail both hit the ball
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      for (const off of [1.5, -1.5]) {
        const dx = b.x - (c.x + fx * off), dz = b.z - (c.z + fz * off), d = Math.hypot(dx, dz), min = BALL_R + 2.3;
        if (d >= min || d < 1e-4 || b.y > BALL_R + 4) continue;
        const nx = dx / d, nz = dz / d; b.x += nx * (min - d); b.z += nz * (min - d);
        const vn = (b.vx - c.vx) * nx + (b.vz - c.vz) * nz; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; }
        b.vx += nx * 5; b.vz += nz * 5; const sp = Math.hypot(c.vx, c.vz); if (sp > 34) b.vy = Math.max(b.vy, sp * 0.3);
        b.last = c; if (c.touchT <= 0) { c.touchT = 0.25; ctx.sfx('impact', Math.min(1, sp / 60)); }
      }
    }
    const bs = Math.hypot(b.vx, b.vz); if (bs > 130) { b.vx *= 130 / bs; b.vz *= 130 / bs; }
    if (Math.abs(b.z) > FW - BALL_R) { b.z = Math.sign(b.z) * (FW - BALL_R); b.vz *= -0.82; }
    if (Math.abs(b.x) > FL - BALL_R) {
      if (Math.abs(b.z) < GOAL_W - 1) { if (Math.abs(b.x) > FL + BALL_R * 0.5 && phase === 'play') goal(b.x > 0 ? 0 : 1); if (Math.abs(b.x) > FL + 6) { b.x = Math.sign(b.x) * (FL + 6); b.vx *= -0.3; } }
      else if (Math.abs(b.x) < FL + BALL_R) { b.x = Math.sign(b.x) * (FL - BALL_R); b.vx *= -0.82; }
    }
    if (Math.abs(b.x) > FL) b.z = clamp(b.z, -(GOAL_W - BALL_R * 0.6), GOAL_W - BALL_R * 0.6);
    corner(b, BALL_R, 0.82);
  }

  // ---------- scene ----------
  async function init() {
    stage.appendChild(big);
    for (const c of P) ctx.to(c.p.id, { m: 'pad', btn: 'BOOST', color: c.color, title: 'Loading…', sub: '' });
    const assets = await loadAssets('neon'); if (stopped) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; stage.appendChild(renderer.domElement); stage.appendChild(hud);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e1430); scene.fog = new THREE.Fog(0x0e1430, 260, 520);
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x24402a, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-50, 130, 70); sun.castShadow = true; scene.add(sun);
    const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 70; sc.bottom = -70; sc.near = 20; sc.far = 320; sc.updateProjectionMatrix(); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
    const lam = (o) => new THREE.MeshLambertMaterial(o);
    // pitch
    const S = 8, pitchTex = canvasTex(2 * FL * S, 2 * FW * S, (c, w, h) => {
      for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#2f9a4a' : '#37aa53'; c.fillRect(i * w / 14, 0, w / 14 + 1, h); }
      c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 6; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(CH * S, 4); c.lineTo(w - CH * S, 4); c.lineTo(w - 4, CH * S); c.lineTo(w - 4, h - CH * S); c.lineTo(w - CH * S, h - 4); c.lineTo(CH * S, h - 4); c.lineTo(4, h - CH * S); c.lineTo(4, CH * S); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke(); c.beginPath(); c.arc(w / 2, h / 2, 10 * S, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, h / 2, 8, 0, 7); c.fill();
      for (const sx of [0, 1]) { const bw = 16 * S, bh = 2 * (GOAL_W + 7) * S; c.strokeRect(sx ? w - bw : 0, h / 2 - bh / 2, bw, bh); c.fillStyle = sx ? 'rgba(43,123,255,.28)' : 'rgba(255,75,43,.28)'; c.fillRect(sx ? w - bw : 0, h / 2 - bh / 2, bw, bh); }
    });
    pitchTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * FL, 2 * FW), lam({ map: pitchTex })); pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(700, 500), lam({ color: 0x1d5f33 })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; apron.receiveShadow = true; scene.add(apron);
    // boards: straight sides, cut corners, gaps for the goals
    const adTex = canvasTex(1024, 64, (c, w, h) => { const cols = ['#ff4b2b', '#ffc62b', '#19c2a0', '#2b7bff', '#b455ff', '#f6efe2']; for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 6]; c.fillRect(i * 128, 0, 128, h); c.fillStyle = i % 6 === 1 || i % 6 === 5 ? '#14110f' : '#fff'; c.font = '900 34px "Bowlby One","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(['COUCH', 'CLASH', 'BOOST!', 'GOAL', 'GG', 'SEND IT', 'NO REF', 'WOW'][i], i * 128 + 64, h / 2 + 2, 116); } });
    adTex.wrapS = THREE.RepeatWrapping;
    const board = (x1, z1, x2, z2) => { const len = Math.hypot(x2 - x1, z2 - z1), t = adTex.clone(); t.needsUpdate = true; t.repeat.x = len / 60; const m = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.8), new THREE.MeshBasicMaterial({ map: t })); m.position.set((x1 + x2) / 2, 1.1, (z1 + z2) / 2); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); m.castShadow = true; scene.add(m); };
    for (const s of [-1, 1]) { board(-(FL - CH), s * FW, FL - CH, s * FW); board(s * FL, -(FW - CH), s * FL, -GOAL_W); board(s * FL, GOAL_W, s * FL, FW - CH); for (const t of [-1, 1]) board(s * (FL - CH), t * FW, s * FL, t * (FW - CH)); }
    // goals
    const netTex = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.strokeRect(0, 0, 64, 64); }); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(10, 4);
    for (const s of [-1, 1]) {
      const col = TEAMS[s < 0 ? 0 : 1].color, post = lam({ color: 0xffffff }), g = new THREE.Group(); g.position.x = s * FL;
      for (const z of [-GOAL_W, GOAL_W]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 12), post); p.position.set(0, 4.5, z); p.castShadow = true; g.add(p); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, GOAL_W * 2 + 1.2, 12), post); bar.rotation.x = Math.PI / 2; bar.position.y = 9; bar.castShadow = true; g.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(9, 9, GOAL_W * 2), new THREE.MeshBasicMaterial({ map: netTex, color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); net.position.set(s * 4.5, 4.5, 0); g.add(net);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, GOAL_W * 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45 })); floor.rotation.x = -Math.PI / 2; floor.position.set(s * 4.5, 0.06, 0); g.add(floor);
      const gl = glow(col, 60, 0.35); gl.position.set(s * 4, 6, 0); g.add(gl); scene.add(g);
    }
    // stands with a crowd, and floodlights
    const crowdTex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#161c3a'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y, w, 2); } const cols = ['#8fa0c8', '#c9d3ee', '#5f6f9e', '#ffc62b', '#ff7a5a', '#6aa8ff']; for (let y = 8; y < h; y += 16) for (let x = 5 + (y % 32 ? 6 : 0); x < w; x += 12) { if (Math.random() < 0.18) continue; c.fillStyle = cols[Math.floor(Math.random() * cols.length)]; c.globalAlpha = rnd(0.25, 0.6); c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill(); } });
    crowdTex.wrapS = THREE.RepeatWrapping;
    const stand = (w, x, z, ry) => { const t = crowdTex.clone(); t.needsUpdate = true; t.repeat.x = w / 90; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, 10, z); m.rotation.order = 'YXZ'; m.rotation.set(-0.8, ry, 0); scene.add(m); };
    stand(2 * FL + 70, 0, -(FW + 20), 0); stand(2 * FW + 60, -(FL + 26), 0, Math.PI / 2); stand(2 * FW + 60, FL + 26, 0, -Math.PI / 2); stand(2 * FL + 70, 0, FW + 20, Math.PI);
    for (const sx of [-1, 1]) for (const sz of [-1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 60, 8), lam({ color: 0x3a4266 })); pole.position.set(sx * (FL + 10), 30, sz * (FW + 40)); scene.add(pole); const l = glow(0xfff6d8, 60, 0.95); l.position.set(sx * (FL + 10), 62, sz * (FW + 40)); scene.add(l); }
    // ball
    const ballTex = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#14110f'; for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) { const x = (k + (r % 2) * 0.5) * w / 8, y = (r + 0.5) * h / 4; c.beginPath(); for (let a = 0; a < 5; a++) { const an = a * 1.2566 - 1.57; c.lineTo(x + Math.cos(an) * 22 / Math.max(0.45, Math.sin((r + 0.5) / 4 * Math.PI)), y + Math.sin(an) * 22); } c.closePath(); c.fill(); } });
    ball.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, metalness: 0.05 })); ball.mesh.castShadow = true; scene.add(ball.mesh);
    ball.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); ball.shadow.rotation.x = -Math.PI / 2; ball.shadow.position.y = 0.08; scene.add(ball.shadow);
    // cars
    P.forEach((c, i) => {
      c.mesh = buildCar('bolt', TEAMS[c.team].color, assets, MODELS[i % MODELS.length]); scene.add(c.mesh);
      c.ring = c.mesh.children.find((o) => o.isMesh && o.geometry.type === 'RingGeometry') || null; if (c.ring) { c.ring.material = c.ring.material.clone(); c.ring.scale.multiplyScalar(1.25); }
      const tag = nameTag(c.name, c.color); tag.position.y = c.mesh.userData.tagY + 1.4; tag.scale.multiplyScalar(2.3); c.mesh.add(tag);
    });
    FX = new Particles(scene, 1200);
    cam = new THREE.PerspectiveCamera(28, 1, 1, 900);
    layout = () => { const w = innerWidth, h = innerHeight, a = w / h, k = Math.max(1, 1.78 / a); renderer.setSize(w, h); cam.aspect = a; cam.position.set(0, 150 * k, 68 * k); cam.lookAt(0, 0, 0.5); cam.updateProjectionMatrix(); FX.mat.uniforms.scale.value = h * renderer.getPixelRatio() * 1.5; };
    layout(); addEventListener('resize', layout);
    big.remove(); newTeams(true); kickoff(); phase = 'kickoff'; wait = 3.999;
    raf = requestAnimationFrame(frame);
  }

  const fire = new THREE.Color(0xffb02a), fire2 = new THREE.Color(0xff5a1a), white = new THREE.Color(0xffffff);
  function finish() {
    phase = 'done';
    const ranked = [...P].sort((a, b) => b.pts - a.pts || b.goals - a.goals); pointRows = ranked.map((c, i) => ({ id: c.p.id, pts: RANK_POINTS[i] || 1 }));
    showResults(stage, 'FULL TIME', `RED ${tally[0]} – ${tally[1]} BLUE`, ranked.map((c, i) => ({ name: c.name, color: c.color, pts: pointRows[i].pts, extra: `${c.pts} pts · ${c.goals} goal${c.goals === 1 ? '' : 's'}` })));
    const v = ctx.vip(); for (const p of ctx.players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Full time', text: 'Results are on the big screen.' });
    ctx.beep(880, 0.6, 'triangle');
  }
  let lastNum = 4;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    if (phase === 'kickoff') { wait -= dt; const s = Math.ceil(wait); if (s !== lastNum) { lastNum = s; if (s > 0) { banner(`<h3>${s}</h3>`, 900); ctx.beep(440, 0.12); } else { banner('<h3>GO!</h3>', 700); ctx.beep(880, 0.3); phase = 'play'; } } }
    else if (phase === 'play') { for (let k = 0; k < 2; k++) step(dt / 2); left -= dt; if (left <= 0) finish(); }
    else if (phase === 'goal') { for (let k = 0; k < 2; k++) step(dt / 2); wait -= dt; if (wait <= 0) { if (left <= 0.5) finish(); else { newTeams(false); kickoff(); phase = 'kickoff'; wait = 2.999; lastNum = 3; banner('<h3>NEW TEAMS</h3>', 1200); } } }
    // draw
    for (const c of P) {
      const u = c.mesh.userData; c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h;
      for (const w of u.wheels) w.rotation.x += (c.vf || 0) * dt / 0.55; for (const f of u.fronts) f.rotation.y = clamp((c.dh || 0) * 6, -0.5, 0.5);
      u.flame.visible = u.flameGlow.visible = c.boostT > 0;
      if (c.boostT > 0) for (let k = 0; k < 3; k++) FX.emit(c.x - Math.sin(c.h) * 3 + rnd(-0.4, 0.4), 1 + rnd(-0.2, 0.3), c.z - Math.cos(c.h) * 3 + rnd(-0.4, 0.4), -c.vx * 0.2 + rnd(-3, 3), rnd(0, 4), -c.vz * 0.2 + rnd(-3, 3), rnd(0.2, 0.5), 1.3, Math.random() < 0.5 ? fire : fire2, 0.9, 0.7);
    }
    const b = ball, sp = Math.hypot(b.vx, b.vz); b.mesh.position.set(b.x, b.y, b.z); b.shadow.position.set(b.x, 0.08, b.z); b.shadow.scale.setScalar(Math.max(0.5, 1 - (b.y - BALL_R) * 0.05));
    if (sp > 0.5) b.mesh.rotateOnWorldAxis(new THREE.Vector3(b.vz / sp, 0, -b.vx / sp), sp * dt / BALL_R);
    if (sp > 60) FX.emit(b.x, b.y, b.z, rnd(-2, 2), rnd(0, 3), rnd(-2, 2), 0.35, 1.6, white, 0.5, 1);
    FX.update(dt);
    const tot = Math.max(0, Math.ceil(left)), t = `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`, ce = q('.fb-clock'); if (ce.textContent !== t) { ce.textContent = t; ce.classList.toggle('low', tot <= 10); }
    renderer.render(scene, cam);
  }
  init();
  window.__fb = { P, ball, tally, step, goal, newTeams, get phase() { return phase; }, setPhase: (p) => { phase = p; }, setLeft: (v) => { left = v; } };

  return {
    onMsg(p, d) {
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      const c = P.find((x) => x.p === p); if (!c) return;
      if (d.a === 'joy') { c.jx = clamp(+d.x || 0, -1, 1); c.jz = clamp(+d.y || 0, -1, 1); }
      if (d.a === 'btn' && d.d && phase === 'play' && c.boostCd <= 0) { c.boostCd = BOOST_CD; c.boostT = 0.9; c.vx += Math.sin(c.h) * 30; c.vz += Math.cos(c.h) * 30; ctx.sfx('jump', 0.6); ctx.to(p.id, { e: 'pad', cd: BOOST_CD }); }
    },
    onLeave(p) { const c = P.find((x) => x.p === p); if (c) c.jx = c.jz = 0; },
    onHostKey() { if (phase === 'done') ctx.end(pointRows); },
    stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('resize', layout); if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); } window.__fb = null; },
  };
}
