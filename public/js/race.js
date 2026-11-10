// Turbo Clash: split-screen 3D racing. Everything (physics, AI, rendering) runs on the laptop.
import * as THREE from 'three';
import { showResults } from './host.js';
import { buildTrack, buildWorld, buildCar, nameTag, clamp, rnd } from './race-world.js';

const MAX_RACERS = 5, POINTS = [10, 7, 5, 3, 2];

export const CARS = [
  { key: 'bolt',    name: 'Bolt',    power: 'Nitro',     blurb: 'A long burst of raw speed',            top: 66, acc: 26, turn: 2.05, cd: 9,  stats: [5, 3, 2] },
  { key: 'phantom', name: 'Phantom', power: 'Ghost',     blurb: 'Pass through cars, immune to powers',  top: 61, acc: 30, turn: 2.45, cd: 11, stats: [3, 4, 4] },
  { key: 'titan',   name: 'Titan',   power: 'Shockwave', blurb: 'Blasts nearby cars off their line',    top: 57, acc: 24, turn: 2.15, cd: 10, stats: [2, 2, 3] },
  { key: 'frost',   name: 'Frost',   power: 'Freeze',    blurb: 'Ices the car ahead of you',            top: 59, acc: 33, turn: 2.7,  cd: 12, stats: [3, 5, 5] },
  { key: 'warp',    name: 'Warp',    power: 'Blink',     blurb: 'Teleports you up the track',           top: 62, acc: 28, turn: 2.3,  cd: 11, stats: [4, 3, 3] },
];

export const TRACKS = [
  { name: 'Sunny Shores', laps: 3, theme: 'beach', blurb: 'Wide and flowing', width: 30, grip: 1,
    pts: [[0,-160],[120,-170],[215,-120],[240,-20],[185,60],[100,50],[50,110],[80,185],[0,225],[-110,190],[-200,100],[-185,0],[-230,-90],[-140,-160]],
    pads: [0.12, 0.47, 0.8] },
  { name: 'Dune Canyon', laps: 2, theme: 'desert', blurb: 'Twisty, lots of corners', width: 27, grip: 1,
    pts: [[0,-190],[140,-185],[250,-110],[200,-10],[100,-45],[20,10],[100,95],[225,105],[225,205],[70,225],[-40,150],[-135,215],[-250,160],[-215,45],[-105,5],[-150,-100],[-90,-175]],
    pads: [0.05, 0.36, 0.62, 0.9] },
  { name: 'Frost Peak', laps: 2, theme: 'snow', blurb: 'Slippery hairpins', width: 28, grip: 0.8,
    pts: [[-210,-125],[-60,-180],[90,-155],[225,-180],[265,-65],[160,-15],[30,-60],[-55,15],[50,95],[195,75],[262,170],[125,225],[-30,190],[-150,225],[-255,130],[-170,35],[-255,-45]],
    pads: [0.08, 0.5, 0.74] },
  { name: 'Neon Circuit', laps: 2, theme: 'neon', blurb: 'Fast straights at night', width: 26, grip: 1,
    pts: [[-220,-175],[0,-195],[215,-175],[265,-75],[185,5],[165,85],[245,150],[205,225],[40,215],[-50,130],[-140,215],[-255,165],[-235,60],[-150,-5],[-225,-85]],
    pads: [0.06, 0.3, 0.55, 0.83] },
];

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const QUALITY = new URLSearchParams(location.search).get('q'); // ?q=high or ?q=low locks the graphics level; otherwise it adapts to the laptop

// ============================================================
export function start(ctx) {
  const stage = ctx.stage;
  const racers = [...ctx.players].sort((a, b) => a.races - b.races).slice(0, MAX_RACERS);
  const picks = new Map(racers.map((p, i) => [p.id, i % CARS.length]));
  let trackIdx = Math.floor(Math.random() * TRACKS.length), phase = 'pick', raf = 0, game = null, resultRows = null, pointRows = [];

  // ---------- pick screen ----------
  const pickEl = document.createElement('div'); pickEl.className = 'pick';
  pickEl.innerHTML = `<h2>TURBO CLASH</h2><p class="sub">Pick your car on your phone. The host picks the track and hits GO.</p><div class="tracks"></div><div class="grid"></div>`;
  stage.appendChild(pickEl);
  function renderPick() {
    const tr = pickEl.querySelector('.tracks'); tr.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const b = document.createElement('button'); b.className = 'trk ' + t.theme + (i === trackIdx ? ' on' : '');
      b.innerHTML = `<b>${t.name}</b><span>${t.blurb}</span>`; b.onclick = () => { trackIdx = i; renderPick(); sendPick(); }; tr.appendChild(b);
    });
    const gr = pickEl.querySelector('.grid'); gr.innerHTML = '';
    for (const p of racers) {
      const c = CARS[picks.get(p.id)], d = document.createElement('div'); d.className = 'drv';
      d.innerHTML = `<i style="background:${p.color}"></i><b></b><span>${c.name}</span><em>${c.power}</em>`; d.querySelector('b').textContent = p.name; gr.appendChild(d);
    }
  }
  function sendPick() {
    const v = ctx.vip();
    for (const p of ctx.players) {
      if (!racers.includes(p)) { ctx.to(p.id, { m: 'wait', title: 'Sitting this one out', text: 'Five racers max. You are first in line for the next race.' }); continue; }
      ctx.to(p.id, { m: 'pick', vip: p === v, color: p.color, car: picks.get(p.id), track: trackIdx,
        cars: CARS.map((c) => ({ name: c.name, power: c.power, blurb: c.blurb, stats: c.stats })), tracks: TRACKS.map((t) => t.name) });
    }
  }
  renderPick(); sendPick();

  // ---------- race ----------
  function beginRace() {
    phase = 'countdown'; pickEl.remove();
    for (const p of racers) p.races++;
    const T = buildTrack(TRACKS[trackIdx]), LAPS = T.def.laps;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    let level = QUALITY === 'low' ? 3 : 0; // 0 = full, 1 = lower resolution, 2 = no real shadows, 3 = lowest
    const baseRatio = Math.min(devicePixelRatio || 1, racers.length > 2 ? 1.5 : 2);
    const applyLevel = () => { renderer.setPixelRatio(level === 0 ? baseRatio : level < 3 ? Math.min(baseRatio, 1) : 0.75); world.sun.castShadow = level < 2; renderer.shadowMap.needsUpdate = true; for (const c of cars) c.mesh.userData.blob.material.opacity = level < 2 ? 0.28 : 0.6; };
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true); stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const world = buildWorld(scene, T, renderer), FX = world.particles;
    const white = new THREE.Color(0xffffff), smoke = new THREE.Color(0xd8d8d8), fire = new THREE.Color(0xffb02a), fire2 = new THREE.Color(0xff5a1a), cyan = new THREE.Color(0x8ff4ff), spark = new THREE.Color(0xffe14a);
    const overlay = document.createElement('div'); overlay.className = 'overlay'; stage.appendChild(overlay);
    const big = document.createElement('div'); big.className = 'bigmsg'; stage.appendChild(big);

    // cars: humans first, then CPU cars so there are always at least four on track
    const cars = [];
    const mk = (p, typeIdx, color, name) => {
      const type = CARS[typeIdx], mesh = buildCar(type.key, color); scene.add(mesh);
      const tag = nameTag(name, color); tag.position.y = mesh.userData.tagY; mesh.add(tag); mesh.userData.blob = mesh.children.find((o) => o.isMesh && o.geometry.type === 'PlaneGeometry');
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
      const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.8, depthWrite: false })); flash.visible = false; scene.add(flash);
      const beamG = new THREE.BufferGeometry(); beamG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const beam = new THREE.Line(beamG, new THREE.LineBasicMaterial({ color: 0x9fe8ff })); beam.visible = false; beam.frustumCulled = false; scene.add(beam);
      const c = { p, bot: !p, name, color, type, mesh, tag, ring, flash, beam, x: 0, z: 0, h: 0, speed: 0, idx: 0, total: 0, lat: 0, steer: 0, gas: false, brake: false,
        boostT: 0, ghostT: 0, frozenT: 0, spinT: 0, kx: 0, kz: 0, cd: 4, finished: false, place: 0, stuckT: 0, lastTotal: 0, ringT: 0, flashT: 0, beamT: 0, noteT: 0,
        skill: rnd(0.86, 0.95), botLat: rnd(-0.5, 0.5), botPw: rnd(3, 9), ready: false, emit: 0 };
      cars.push(c); return c;
    };
    racers.forEach((p) => mk(p, picks.get(p.id), p.color, p.name));
    const botCols = ['#b9bec6', '#d6c38a', '#8fa0bd'];
    for (let b = 0; cars.length < 4; b++) mk(null, (b * 2 + 1) % CARS.length, botCols[b % 3], 'CPU ' + (b + 1));
    cars.forEach((c, i) => {
      const row = Math.floor(i / 2), side = i % 2 ? 1 : -1, idx = (T.N - 6 - row * 5 + T.N) % T.N, lat = side * T.hw * 0.4;
      c.idx = idx; c.total = idx - T.N; c.x = T.px[idx] + T.tz[idx] * lat; c.z = T.pz[idx] - T.tx[idx] * lat; c.h = Math.atan2(T.tx[idx], T.tz[idx]); c.lastTotal = c.total;
    });

    // views
    const humans = cars.filter((c) => !c.bot), n = humans.length;
    humans.forEach((c, i) => {
      c.cam = new THREE.PerspectiveCamera(68, 1, 0.8, 4200); c.cam.layers.enableAll(); c.cam.layers.disable(1 + i); c.tag.layers.set(1 + i);
      c.camPos = new THREE.Vector3(c.x - Math.sin(c.h) * 30, 16, c.z - Math.cos(c.h) * 30); c.look = new THREE.Vector3(c.x, 1.5, c.z);
      const el = document.createElement('div'); el.className = 'rhud';
      el.innerHTML = `<div class="lines"></div><div class="who"><i style="background:${c.color}"></i><span></span></div><div class="pos"></div><div class="lap"></div><div class="spd"><b>0</b><small>km/h</small></div><div class="note"></div><div class="pw"><b>${c.type.power}</b><u><s></s></u></div>`;
      el.querySelector('.who span').textContent = c.name; overlay.appendChild(el);
      c.hud = { el, spd: el.querySelector('.spd b'), pos: el.querySelector('.pos'), lap: el.querySelector('.lap'), note: el.querySelector('.note'), pw: el.querySelector('.pw'), bar: el.querySelector('.pw s'), cache: {} };
    });
    cars.filter((c) => c.bot).forEach((c) => c.tag.layers.set(0));
    const info = document.createElement('div'); info.className = 'rinfo'; info.innerHTML = `<h3>${T.def.name}</h3><ol></ol><canvas></canvas>`; overlay.appendChild(info);
    const mapC = info.querySelector('canvas'), mapX = mapC.getContext('2d'), standEl = info.querySelector('ol');
    let cells = [];
    function layout() {
      const W = innerWidth, H = innerHeight; renderer.setSize(W, H);
      const cols = n === 1 ? 1 : n <= 4 && n !== 3 ? 2 : n === 3 ? 2 : 3, rows = n <= 2 ? 1 : 2;
      cells = []; for (let i = 0; i < cols * rows; i++) cells.push({ x: (i % cols) * W / cols, y: Math.floor(i / cols) * H / rows, w: W / cols, h: H / rows });
      humans.forEach((c, i) => { const r = cells[i]; Object.assign(c.hud.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); c.cam.aspect = r.w / r.h; c.cam.updateProjectionMatrix(); });
      const spare = cells[n];
      if (spare) { info.classList.remove('float'); Object.assign(info.style, { left: spare.x + 'px', top: spare.y + 'px', width: spare.w + 'px', height: spare.h + 'px', transform: 'none', bottom: 'auto' }); }
      else { info.classList.add('float'); info.classList.toggle('mid', n === 4); info.removeAttribute('style'); }
    }
    applyLevel(); layout(); addEventListener('resize', layout);
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (let i = 0; i < T.N; i++) { mnx = Math.min(mnx, T.px[i]); mxx = Math.max(mxx, T.px[i]); mnz = Math.min(mnz, T.pz[i]); mxz = Math.max(mxz, T.pz[i]); }

    for (const c of humans) ctx.to(c.p.id, { m: 'race', color: c.color, power: c.type.power, car: c.type.name });

    // ---------- simulation ----------
    let fAcc = 0, fN = 0, clock = 0, cdT = 3.999, lastCd = 4, finishCount = 0, endT = -1, raceTime = 0, last = performance.now();
    const note = (c, t) => { if (c.hud) { c.hud.note.textContent = t; c.noteT = 1.6; } };
    function locate(c) {
      let best = 1e12, bi = c.idx;
      for (let k = -14; k <= 14; k++) { const j = (c.idx + k + T.N) % T.N, d = (T.px[j] - c.x) ** 2 + (T.pz[j] - c.z) ** 2; if (d < best) { best = d; bi = j; } }
      const dl = ((bi - c.idx + T.N + T.N / 2) % T.N) - T.N / 2; c.total += dl; c.idx = bi;
      c.lat = (c.x - T.px[bi]) * T.tz[bi] - (c.z - T.pz[bi]) * T.tx[bi];
    }
    function usePower(c) {
      if (phase !== 'race' || c.cd > 0 || c.finished || c.frozenT > 0) return;
      c.cd = c.type.cd; c.ready = false; if (c.p) ctx.to(c.p.id, { e: 'pw', ready: false, cd: c.type.cd });
      const k = c.type.key; ctx.beep(k === 'frost' ? 1200 : 300, 0.2, 'sawtooth', 0.05);
      if (k === 'bolt') c.boostT = 2.8;
      else if (k === 'phantom') c.ghostT = 4.5;
      else if (k === 'titan') {
        c.ring.visible = true; c.ringT = 0.5; c.ring.position.set(c.x, 0.5, c.z);
        for (let k = 0; k < 60; k++) { const a = Math.random() * 6.28, v = rnd(20, 60); FX.emit(c.x, 1, c.z, Math.cos(a) * v, rnd(4, 16), Math.sin(a) * v, rnd(0.4, 0.8), 0.9, spark, 1, 0.2, 30); }
        for (const o of cars) { if (o === c || o.ghostT > 0 || o.finished) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d < 34) { o.kx = dx / (d || 1) * 34; o.kz = dz / (d || 1) * 34; o.spinT = 1.1; o.speed *= 0.45; note(o, 'SHOCKED!'); if (o.p) ctx.to(o.p.id, { e: 'hit' }); } }
      } else if (k === 'frost') {
        let t = null, bd = 1e9;
        for (const o of cars) { if (o === c || o.ghostT > 0 || o.finished) continue; const ahead = o.total - c.total, d = Math.hypot(o.x - c.x, o.z - c.z); if (ahead > 0 && ahead < 110 && ahead < bd) { bd = ahead; t = o; } else if (!t && d < 45) t = o; }
        if (t) { t.frozenT = 2.8; c.beamT = 0.35; c.beamTarget = t; c.beam.visible = true; note(t, 'FROZEN!'); if (t.p) ctx.to(t.p.id, { e: 'hit' }); } else { c.cd = 3; note(c, 'NO TARGET'); }
      } else if (k === 'warp') {
        c.flash.position.set(c.x, 1.5, c.z); c.flash.visible = true; c.flashT = 0.4;
        for (let k = 0; k < 40; k++) FX.emit(c.x + rnd(-2, 2), rnd(0.5, 3), c.z + rnd(-2, 2), rnd(-6, 6), rnd(2, 12), rnd(-6, 6), rnd(0.4, 0.9), 0.8, cyan, 1, 0.3);
        const j = (c.idx + 20) % T.N, lat = clamp(c.lat, -T.hw * 0.7, T.hw * 0.7);
        c.x = T.px[j] + T.tz[j] * lat; c.z = T.pz[j] - T.tx[j] * lat; c.h = Math.atan2(T.tx[j], T.tz[j]); c.total += 20; c.idx = j; c.speed = Math.max(c.speed, c.type.top * 0.8);
        if (c.camPos) { c.camPos.set(c.x - Math.sin(c.h) * 12, 6, c.z - Math.cos(c.h) * 12); }
      }
    }
    function botDrive(c) {
      const j = (c.idx + 9) % T.N, lat = c.botLat * T.hw * 0.55, txp = T.px[j] + T.tz[j] * lat, tzp = T.pz[j] - T.tx[j] * lat;
      let diff = Math.atan2(txp - c.x, tzp - c.z) - c.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.steer = clamp(-diff * 2.6, -1, 1); c.gas = Math.abs(diff) < 1.1; c.brake = Math.abs(diff) > 1.3 && c.speed > 25;
      if (c.bot && !c.finished) { c.botPw -= 1 / 60; if (c.botPw <= 0 && c.cd <= 0) { usePower(c); c.botPw = rnd(4, 12); } }
    }
    function stepCar(c, dt) {
      if (c.bot || c.finished) botDrive(c);
      const frozen = c.frozenT > 0, spin = c.spinT > 0, off = Math.abs(c.lat) > T.hw + 1.5;
      let top = c.type.top * (c.bot ? c.skill : 1) * (c.finished ? 0.6 : 1);
      if (c.boostT > 0) top *= 1.5; if (c.ghostT > 0) top *= 1.12; if (off) top *= 0.5; if (frozen) top *= 0.3;
      const gas = c.gas && !frozen && !spin, brake = c.brake;
      if (gas && c.speed < top) c.speed += c.type.acc * (c.boostT > 0 ? 2.4 : 1) * dt;
      else if (!gas) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 13 * dt);
      if (brake) c.speed -= (c.speed > 0 ? 62 : 22) * dt;
      if (c.speed > top) c.speed -= Math.min(c.speed - top, (frozen ? 90 : 45) * dt);
      c.speed = Math.max(c.speed, -16);
      const sf = clamp(c.speed / 16, -1, 1) * (1 - 0.32 * clamp(Math.abs(c.speed) / c.type.top, 0, 1.2));
      if (spin) c.h += 9 * dt; else c.h -= c.type.turn * T.def.grip * c.steer * sf * dt;
      c.x += (Math.sin(c.h) * c.speed + c.kx) * dt; c.z += (Math.cos(c.h) * c.speed + c.kz) * dt;
      const kd = Math.exp(-4 * dt); c.kx *= kd; c.kz *= kd;
      locate(c);
      if (Math.abs(c.lat) > T.wall) { // soft wall: slide along it
        const s = Math.sign(c.lat), over = Math.abs(c.lat) - T.wall; c.x -= T.tz[c.idx] * s * over; c.z += T.tx[c.idx] * s * over; c.lat = s * T.wall;
        c.speed *= Math.exp(-1.6 * dt); const th = Math.atan2(T.tx[c.idx], T.tz[c.idx]); let d = th - c.h; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 1.6) c.h += d * Math.min(1, 3 * dt);
      }
      for (const p of world.pads) if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 30) { if (c.boostT < 1.2) { c.boostT = 1.5; if (c.p) ctx.beep(700, 0.1, 'triangle'); for (let k = 0; k < 24; k++) FX.emit(c.x, 0.4, c.z, rnd(-14, 14), rnd(4, 18), rnd(-14, 14), rnd(0.3, 0.6), 0.6, spark, 1, 0.2, 40); } }
      for (const k of ['boostT', 'ghostT', 'frozenT', 'spinT', 'noteT']) if (c[k] > 0) c[k] -= dt;
      if (c.cd > 0) { c.cd -= dt; if (c.cd <= 0 && !c.ready) { c.ready = true; if (c.p) ctx.to(c.p.id, { e: 'pw', ready: true }); } }
      // rescue a stuck car
      if (!c.finished) { c.stuckT += dt; if (c.total > c.lastTotal + 2) { c.lastTotal = c.total; c.stuckT = 0; } if (c.stuckT > 4.5) { c.x = T.px[c.idx]; c.z = T.pz[c.idx]; c.h = Math.atan2(T.tx[c.idx], T.tz[c.idx]); c.speed = 0; c.stuckT = 0; c.lat = 0; note(c, 'RESET'); } }
      if (!c.finished && c.total >= LAPS * T.N) {
        c.finished = true; c.place = ++finishCount; c.time = raceTime;
        if (c.p) { ctx.beep(880, 0.15); setTimeout(() => ctx.beep(1320, 0.3), 140); ctx.to(c.p.id, { m: 'wait', title: 'Finished ' + ORD[c.place - 1] + '!', text: 'Watch the others come in.' }); }
        if (endT < 0) endT = 25;
      }
    }
    function collide() {
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b]; if (A.ghostT > 0 || B.ghostT > 0) continue;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), min = 4.6;
        if (d < min && d > 0.001) { const o = (min - d) / 2, ux = dx / d, uz = dz / d; A.x -= ux * o; A.z -= uz * o; B.x += ux * o; B.z += uz * o; const s = (A.speed + B.speed) / 2; A.speed += (s - A.speed) * 0.25; B.speed += (s - B.speed) * 0.25; }
      }
    }
    const order = () => [...cars].sort((a, b) => (a.finished && b.finished ? a.place - b.place : a.finished ? -1 : b.finished ? 1 : b.total - a.total));

    function visuals(dt) {
      for (const c of cars) {
        const m = c.mesh, u = m.userData;
        m.position.set(c.x, c.type.key === 'warp' ? 0.35 + Math.sin(clock * 5 + c.x) * 0.08 : 0, c.z); m.rotation.y = c.h;
        u.chassis.rotation.z = c.steer * clamp(c.speed / 40, 0, 1) * 0.09;
        for (const w of u.wheels) w.rotation.x += c.speed * dt / 0.6;
        for (const f of u.fronts) f.rotation.y = -c.steer * 0.45;
        if (u.rings) for (const r of u.rings) r.scale.setScalar(1 + Math.sin(clock * 12) * 0.12);
        u.flame.visible = u.flameGlow.visible = c.boostT > 0; if (u.flame.visible) u.flame.scale.set(1, rnd(0.7, 1.4), 1);
        // particles: flame, tyre smoke, dust, snow spray
        const sh = Math.sin(c.h), ch = Math.cos(c.h), rx = c.x - sh * 2.6, rz = c.z - ch * 2.6, off = Math.abs(c.lat) > T.hw + 1.5, spd = Math.abs(c.speed);
        c.emit += dt * (spd > 8 ? 60 : 0);
        while (c.emit > 1) {
          c.emit -= 1; const side = (Math.random() < 0.5 ? -1 : 1) * 1.2, wx = rx + ch * side, wz = rz - sh * side;
          if (c.boostT > 0) FX.emit(rx + rnd(-0.3, 0.3), u.flame.position.y * 1.15 + rnd(-0.2, 0.2), rz + rnd(-0.3, 0.3), -sh * c.speed * 0.3 + rnd(-2, 2), rnd(0, 3), -ch * c.speed * 0.3 + rnd(-2, 2), rnd(0.2, 0.45), 1.1, Math.random() < 0.5 ? fire : fire2, 0.9, 0.6);
          else if (off) { if (Math.random() < 0.7) FX.emit(wx, 0.4, wz, rnd(-3, 3), rnd(2, 6), rnd(-3, 3), rnd(0.5, 1.1), 1.4, world.dust, 0.55, 2.4); }
          else if (world.theme === 'snow') { if (Math.random() < 0.5) FX.emit(wx, 0.3, wz, rnd(-2, 2) - sh * 3, rnd(2, 5), rnd(-2, 2) - ch * 3, rnd(0.3, 0.6), 0.55, white, 0.45, 1.6); }
          else if ((Math.abs(c.steer) > 0.7 && spd > 34) || (c.brake && spd > 20) || c.spinT > 0) FX.emit(wx, 0.35, wz, rnd(-2, 2), rnd(1.5, 4), rnd(-2, 2), rnd(0.5, 1), 1.2, smoke, 0.45, 2.6);
        }
        u.iceBlock.visible = c.frozenT > 0;
        const ghost = c.ghostT > 0; if (ghost !== c._g) { c._g = ghost; for (const mt of u.mats) { mt.transparent = ghost; mt.opacity = ghost ? 0.3 : 1; mt.needsUpdate = true; } }
        if (c.ringT > 0) { c.ringT -= dt; const s = (1 - c.ringT / 0.5) * 34; c.ring.scale.setScalar(s); c.ring.material.opacity = c.ringT / 0.5; if (c.ringT <= 0) c.ring.visible = false; }
        if (c.flashT > 0) { c.flashT -= dt; c.flash.scale.setScalar(1 + (1 - c.flashT / 0.4) * 7); c.flash.material.opacity = c.flashT / 0.4; if (c.flashT <= 0) c.flash.visible = false; }
        if (c.beamT > 0) { c.beamT -= dt; const t = c.beamTarget, a = c.beam.geometry.attributes.position; a.setXYZ(0, c.x, 1.6, c.z); a.setXYZ(1, t.x, 1.6, t.z); a.needsUpdate = true; if (c.beamT <= 0) c.beam.visible = false; }
        if (c.cam) {
          const back = 11.5 + (c.boostT > 0 ? 2.5 : 0), sh = Math.sin(c.h), ch = Math.cos(c.h);
          const tx = c.x - sh * back, tz = c.z - ch * back, k = 1 - Math.exp(-7 * dt);
          c.camPos.x += (tx - c.camPos.x) * k; c.camPos.z += (tz - c.camPos.z) * k; c.camPos.y += (5.6 - c.camPos.y) * k;
          c.look.x += (c.x + sh * 7 - c.look.x) * (1 - Math.exp(-12 * dt)); c.look.z += (c.z + ch * 7 - c.look.z) * (1 - Math.exp(-12 * dt));
          const shk = c.boostT > 0 ? 0.07 : c.spinT > 0 || c.frozenT > 0 ? 0.12 : 0; c.cam.position.set(c.camPos.x + rnd(-shk, shk), c.camPos.y + rnd(-shk, shk), c.camPos.z + rnd(-shk, shk)); c.cam.lookAt(c.look.x, 1.8, c.look.z);
          const fov = 68 + clamp((c.speed - 50) / 40, 0, 1) * 16; if (Math.abs(fov - c.cam.fov) > 0.3) { c.cam.fov += (fov - c.cam.fov) * 0.1; c.cam.updateProjectionMatrix(); }
        }
      }
      world.update(dt, clock);
    }
    function hud() {
      const ord = order();
      for (const c of humans) {
        const h = c.hud, place = ord.indexOf(c), lap = clamp(Math.floor(c.total / T.N) + 1, 1, LAPS);
        const set = (k, v, fn) => { if (h.cache[k] !== v) { h.cache[k] = v; fn(v); } };
        set('pos', place, (v) => { h.pos.innerHTML = `${v + 1}<small>${ORD[v].slice(-2)}</small>`; });
        set('lap', c.finished ? 'FINISHED' : `LAP ${lap}/${LAPS}`, (v) => { h.lap.textContent = v; });
        set('rdy', c.cd <= 0, (v) => h.pw.classList.toggle('ready', v));
        set('spd', Math.round(Math.abs(c.speed) * 3.2 / 5) * 5, (v) => { h.spd.textContent = v; });
        set('bst', c.boostT > 0, (v) => h.el.classList.toggle('boost', v));
        h.bar.style.width = (c.cd <= 0 ? 100 : (1 - c.cd / c.type.cd) * 100) + '%';
        set('note', c.finished ? ORD[c.place - 1].toUpperCase() + ' PLACE' : c.noteT > 0 ? h.note.textContent : '', (v) => { h.note.textContent = v; });
      }
      const key = ord.map((c) => c.name).join('|');
      if (standEl._k !== key) { standEl._k = key; standEl.innerHTML = ''; ord.forEach((c, i) => { const li = document.createElement('li'); li.innerHTML = `<span>${i + 1}</span><i style="background:${c.color}"></i><span></span>`; li.lastChild.textContent = c.name; standEl.appendChild(li); }); }
      // minimap
      const w = mapC.clientWidth, hh = mapC.clientHeight; if (!w || !hh) return;
      if (mapC.width !== w * 2 || mapC.height !== hh * 2) { mapC.width = w * 2; mapC.height = hh * 2; }
      const s = Math.min((w * 2 - 40) / (mxx - mnx), (hh * 2 - 40) / (mxz - mnz)), ox = w - (mnx + mxx) / 2 * -s, oz = hh - (mnz + mxz) / 2 * s;
      const X = (x) => ox - x * s, Z = (z) => oz + z * s; // mirror x so the map matches what drivers see
      mapX.clearRect(0, 0, w * 2, hh * 2); mapX.lineJoin = 'round'; mapX.beginPath();
      for (let i = 0; i <= T.N; i += 2) { const j = i % T.N; i ? mapX.lineTo(X(T.px[j]), Z(T.pz[j])) : mapX.moveTo(X(T.px[j]), Z(T.pz[j])); }
      mapX.closePath(); mapX.strokeStyle = '#f6efe2'; mapX.lineWidth = Math.max(8, T.def.width * s * 0.9); mapX.stroke(); mapX.strokeStyle = '#14110f'; mapX.lineWidth = Math.max(4, T.def.width * s * 0.9 - 6); mapX.stroke();
      mapX.fillStyle = '#fff'; mapX.fillRect(X(T.px[0]) - 3, Z(T.pz[0]) - 9, 6, 18);
      for (const c of [...cars].reverse()) { mapX.beginPath(); mapX.arc(X(c.x), Z(c.z), c.bot ? 7 : 10, 0, 7); mapX.fillStyle = c.color; mapX.fill(); mapX.lineWidth = 3; mapX.strokeStyle = '#000'; mapX.stroke(); }
    }
    function finish() {
      phase = 'done';
      const ord = order(); let hp = 0; pointRows = [];
      resultRows = ord.map((c) => {
        const pts = c.bot ? 0 : POINTS[hp++] || 1; if (!c.bot) pointRows.push({ id: c.p.id, pts });
        return { name: c.name, color: c.color, pts, extra: c.finished ? c.time.toFixed(1) + 's · ' + c.type.name : 'DNF · ' + c.type.name };
      });
      showResults(stage, 'RACE OVER', T.def.name + ' · ' + LAPS + ' laps', resultRows);
      const v = ctx.vip(); for (const p of ctx.players) ctx.to(p.id, { m: 'done', vip: p === v, title: 'Race over', text: 'Results are on the big screen.' });
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
      if (phase === 'countdown') {
        cdT -= dt; const s = Math.ceil(cdT);
        if (s !== lastCd) { lastCd = s; if (s > 0) { big.innerHTML = `<span>${s}</span>`; ctx.beep(440, 0.15); } else { big.innerHTML = '<span>GO!</span>'; ctx.beep(880, 0.4); phase = 'race'; setTimeout(() => { big.innerHTML = ''; }, 900); } }
      }
      if (phase === 'race') {
        raceTime += dt;
        for (const c of cars) stepCar(c, dt);
        collide();
        if (endT > 0) { endT -= dt; if (endT <= 0 || humans.every((c) => c.finished)) finish(); }
      }
      visuals(dt); hud();
      const H = innerHeight, pr = renderer.getPixelRatio();
      renderer.shadowMap.needsUpdate = level < 2;
      if (!QUALITY && phase === 'race') { fAcc += dt; fN++; if (fN >= 100) { const avg = fAcc / fN; fAcc = fN = 0; if (avg > 0.028 && level < 3) { level++; applyLevel(); } } }
      humans.forEach((c, i) => { const r = cells[i]; FX.mat.uniforms.scale.value = r.h * pr * 0.74; renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h); renderer.render(scene, c.cam); });
    }
    raf = requestAnimationFrame(frame);
    const sim = (steps, dt = 1 / 60) => { for (let i = 0; i < steps && phase === 'race'; i++) { raceTime += dt; for (const c of cars) stepCar(c, dt); collide(); } };
    game = { cars, T, humans, usePower, renderer, layout, sim, get phase() { return phase; }, setPhase: (p) => { phase = p; } };
    window.__race = game;
  }

  return {
    onMsg(p, d) {
      if (phase === 'pick') {
        if (d.a === 'car' && picks.has(p.id)) { picks.set(p.id, clamp(d.i | 0, 0, CARS.length - 1)); renderPick(); sendPick(); }
        if (p === ctx.vip()) { if (d.a === 'track') { trackIdx = clamp(d.i | 0, 0, TRACKS.length - 1); renderPick(); sendPick(); } if (d.a === 'go') beginRace(); }
        return;
      }
      if (phase === 'done') { if (d.a === 'back' && p === ctx.vip()) ctx.end(pointRows); return; }
      const c = game?.cars.find((x) => x.p === p); if (!c) return;
      if (d.a === 'in') { c.steer = clamp(+d.s || 0, -1, 1); c.gas = !!d.g; c.brake = !!d.b; }
      if (d.a === 'pw') game.usePower(c);
    },
    onHostKey() { if (phase === 'pick') beginRace(); else if (phase === 'done') ctx.end(pointRows); },
    onLeave(p) { const c = game?.cars.find((x) => x.p === p); if (c) { c.gas = false; c.steer = 0; } },
    stop() {
      cancelAnimationFrame(raf); if (game) { removeEventListener('resize', game.layout); game.renderer.dispose(); game.renderer.forceContextLoss?.(); }
      window.__race = null;
    },
  };
}
