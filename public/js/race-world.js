// Everything you see in Turbo Clash: terrain, road, scenery, sky, cars and particles. All built in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Free CC0 models by Kenney (see public/assets/CREDITS.txt). If a model fails to load, the game falls back to shapes built in code.
const CAR_MODEL = { bolt: 'race-future', phantom: 'sedan-sports', titan: 'truck', frost: 'hatchback-sports', warp: 'race' };
export const BOT_MODELS = ['taxi', 'police', 'van'];
const PROPS = {
  all: ['cone', 'decoration-tents'],
  beach: ['tree_palmDetailedTall', 'tree_palmBend', 'tree_palmShort', 'plant_bushDetailed', 'rock_largeA', 'rock_tallH', 'tent_detailedOpen', 'canoe'],
  desert: ['cactus_tall', 'cactus_short', 'rock_tallA', 'rock_tallH', 'stone_tallB', 'statue_obelisk'],
  snow: ['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineRoundA', 'tree_pineDefaultA', 'stone_tallB', 'rock_largeA'],
  neon: [],
};
const modelCache = new Map();
export async function loadAssets(theme) {
  const loader = new GLTFLoader(), out = { cars: {}, props: {} };
  const get = (url) => { if (!modelCache.has(url)) modelCache.set(url, loader.loadAsync(url).then((g) => g.scene).catch(() => null)); return modelCache.get(url); };
  await Promise.all([
    ...[...Object.values(CAR_MODEL), ...BOT_MODELS].map(async (n) => { out.cars[n] = await get(`/assets/cars/${n}.glb`); }),
    ...[...PROPS.all, ...(PROPS[theme] || [])].map(async (n) => { out.props[n] = await get(`/assets/props/${n}.glb`); }),
  ]);
  return out;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const THEMES = {
  beach:  { sky: [0x1f7fe0, 0xbfe9ff], fog: [0xbfe9ff, 300, 1500], road: '#4b4b55', line: '#ffffff', kerb: [0xff4b2b, 0xffffff], barrier: [0xff4b2b, 0xf4f4f4], hemi: [0xffffff, 0xd9c08a, 0.95], sun: [0xfff0cc, 2.1], sunDir: [-0.55, 0.75, 0.35], hill: [3, 26], dust: 0xe8cf95 },
  desert: { sky: [0x4a3596, 0xffb066], fog: [0xffb878, 260, 1400], road: '#56443b', line: '#ffe9c2', kerb: [0xffc62b, 0x3a2a22], barrier: [0xffc62b, 0x3a2a22], hemi: [0xffd9b0, 0xb5653a, 0.85], sun: [0xffb070, 2.4], sunDir: [-0.7, 0.42, -0.45], hill: [2, 34], dust: 0xd99a5c },
  snow:   { sky: [0x5f86bd, 0xe9f2fb], fog: [0xe9f2fb, 200, 1100], road: '#7f93ab', line: '#ffffff', kerb: [0x2b7bff, 0xffffff], barrier: [0x2b7bff, 0xffffff], hemi: [0xffffff, 0xbfd2ea, 1.05], sun: [0xfff4e6, 1.7], sunDir: [0.5, 0.6, 0.5], hill: [4, 40], dust: 0xffffff },
  neon:   { sky: [0x05030f, 0x3a0f5c], fog: [0x1a0730, 200, 1100], road: '#15122a', line: '#7a5cff', kerb: [0x00f0ff, 0xff2bd6], barrier: [0x00f0ff, 0xff2bd6], hemi: [0x9f8cff, 0x30104a, 0.9], sun: [0xff9af0, 1.1], sunDir: [0.2, 0.8, -0.5], hill: [0, 0], dust: 0x8a6cff },
};

// ---------- small helpers ----------
function M(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
function merge(parts) { // coloured parts -> one flat-shaded geometry (one draw call per prop type)
  const pos = [], col = [];
  for (const { g, c, m } of parts) {
    const gg = g.index ? g.toNonIndexed() : g.clone(); if (m) gg.applyMatrix4(m);
    const p = gg.attributes.position.array, cc = new THREE.Color(c);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); col.push(cc.r, cc.g, cc.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals(); return out;
}
function instanced(geo, mat, list, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => im.setMatrixAt(i, M(t.x, t.y || 0, t.z, t.s * (t.sx || 1), t.s * (t.sy || 1), t.s * (t.sz || 1), 0, t.ry || 0, 0)));
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = shadow; return im;
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); }
const fbm = (x, y) => (vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125) / 0.875;
const glowTex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
export function glow(color, size, opacity = 1) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false })); s.scale.setScalar(size); return s; }

// ---------- track ----------
export function buildTrack(def) {
  // one corner-cutting pass rounds off the hand-placed points so no corner is tighter than the road is wide
  const raw = def.pts, sm = [];
  for (let i = 0; i < raw.length; i++) { const a = raw[i], b = raw[(i + 1) % raw.length]; sm.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
  const curve = new THREE.CatmullRomCurve3(sm.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const N = Math.round(curve.getLength() / 2.5), pts = curve.getSpacedPoints(N);
  const px = new Float32Array(N), pz = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N);
  for (let i = 0; i < N; i++) { px[i] = pts[i].x; pz[i] = pts[i].z; }
  for (let i = 0; i < N; i++) { const a = (i + N - 1) % N, b = (i + 1) % N, dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
  const T = { def, N, px, pz, tx, tz, hw: def.width / 2, wall: def.width / 2 + 7 };
  // distance-to-road lookup, used for terrain shaping and prop placement
  const CELL = 8, HALF = 1200, DN = Math.ceil((HALF * 2) / CELL) + 1, df = new Float32Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) { const x = -HALF + i * CELL, z = -HALF + j * CELL; let m = 1e12; for (let k = 0; k < N; k += 2) { const d = (px[k] - x) ** 2 + (pz[k] - z) ** 2; if (d < m) m = d; } df[j * DN + i] = Math.sqrt(m); }
  T.dist = (x, z) => { const fx = clamp((x + HALF) / CELL, 0, DN - 1.001), fz = clamp((z + HALF) / CELL, 0, DN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; return lerp(lerp(df[j * DN + i], df[j * DN + i + 1], u), lerp(df[(j + 1) * DN + i], df[(j + 1) * DN + i + 1], u), v); };
  const th = THEMES[def.theme], seed = def.name.length * 7.3;
  T.height = (x, z) => {
    const d = T.dist(x, z) - T.hw; let h = smooth(16, 120, d) * (th.hill[0] + th.hill[1] * fbm(x * 0.0055 + seed, z * 0.0055 + seed));
    if (def.theme === 'beach') h = lerp(h, -9, smooth(420, 560, Math.hypot(x, z)));
    if (def.theme === 'snow') h += smooth(60, 300, d) * 14 * vnoise(x * 0.02, z * 0.02);
    return h;
  };
  return T;
}
function ribbon(T, inner, outer, y, colorFn, uvLen) { // quads along the road between two lateral offsets
  const { N, px, pz, tx, tz } = T, pos = [], col = [], uv = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, c = colorFn ? colorFn(i) : null; if (colorFn && !c) continue;
    const ax = px[i] + tz[i] * inner, az = pz[i] - tx[i] * inner, bx = px[i] + tz[i] * outer, bz = pz[i] - tx[i] * outer;
    const cx = px[j] + tz[j] * inner, cz = pz[j] - tx[j] * inner, dx = px[j] + tz[j] * outer, dz = pz[j] - tx[j] * outer;
    pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx, y, dz);
    if (c) for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    if (uvLen) { const v0 = (i * 2.5) / uvLen, v1 = ((i + 1) * 2.5) / uvLen; uv.push(0, v0, 0, v1, 1, v0, 1, v0, 0, v1, 1, v1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
function wallRibbon(T, off, h, cA, cB) { // striped crash barrier standing along the road edge
  const { N, px, pz, tx, tz } = T, pos = [], col = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, c = Math.floor(i / 3) % 2 ? cA : cB;
    const ax = px[i] + tz[i] * off, az = pz[i] - tx[i] * off, bx = px[j] + tz[j] * off, bz = pz[j] - tx[j] * off;
    pos.push(ax, 0, az, bx, 0, bz, ax, h, az, ax, h, az, bx, 0, bz, bx, h, bz);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}

// ---------- particles (dust, smoke, sparks, flame): one draw call ----------
export class Particles {
  constructor(scene, max = 1400) {
    this.max = max; this.n = 0; this.p = [];
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { scale: { value: 400 } },
      vertexShader: 'attribute vec4 pcolor; attribute float psize; uniform float scale; varying vec4 vc; void main(){ vc = pcolor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = psize*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vc; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.12,d)*vc.a; if(a<0.01) discard; gl_FragColor = vec4(vc.rgb,a);\n#include <colorspace_fragment>\n}' });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh); this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 0.8, grow = 1.5, grav = 0) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, t: 0, life, size, r: color.r, g: color.g, b: color.b, alpha, grow, grav });
  }
  update(dt) {
    let k = 0; const P = this.p;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; q.t += dt; if (q.t >= q.life) continue;
      q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.y < 0.05) { q.y = 0.05; q.vy *= -0.3; }
      const f = q.t / q.life; P[k] = q;
      this.pos[k * 3] = q.x; this.pos[k * 3 + 1] = q.y; this.pos[k * 3 + 2] = q.z;
      this.col[k * 4] = q.r; this.col[k * 4 + 1] = q.g; this.col[k * 4 + 2] = q.b; this.col[k * 4 + 3] = q.alpha * (1 - f);
      this.size[k] = q.size * (1 + f * q.grow); k++;
    }
    P.length = k; this.geo.setDrawRange(0, k);
    for (const a of ['position', 'pcolor', 'psize']) this.geo.attributes[a].needsUpdate = true;
  }
}

// ---------- world ----------
export function buildWorld(scene, T, renderer, assets) {
  const theme = T.def.theme, th = THEMES[theme], neon = theme === 'neon', hw = T.hw;
  const lam = (o) => new THREE.MeshLambertMaterial(o), vcol = lam({ vertexColors: true });
  const C = (h) => new THREE.Color(h);

  // sky, fog, light
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, depthWrite: false,
    uniforms: { top: { value: C(th.sky[0]) }, bot: { value: C(th.sky[1]) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ float t = smoothstep(-0.02,0.5,h); gl_FragColor = vec4(mix(bot,top,pow(t,0.8)),1.0);\n#include <colorspace_fragment>\n}' });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 12), skyMat));
  scene.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
  scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
  const sd = new THREE.Vector3(...th.sunDir).normalize();
  const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; for (let i = 0; i < T.N; i++) { mnx = Math.min(mnx, T.px[i]); mxx = Math.max(mxx, T.px[i]); mnz = Math.min(mnz, T.pz[i]); mxz = Math.max(mxz, T.pz[i]); }
  const cxm = (mnx + mxx) / 2, czm = (mnz + mxz) / 2, ext = Math.max(mxx - mnx, mxz - mnz) / 2 + 70;
  sun.position.set(cxm + sd.x * 700, sd.y * 700, czm + sd.z * 700); sun.target.position.set(cxm, 0, czm); scene.add(sun, sun.target);
  sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 50; sc.far = 1600; sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;

  // environment for the car paint reflections
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat));
  const gd = new THREE.Mesh(new THREE.CircleGeometry(50, 24), new THREE.MeshBasicMaterial({ color: neon ? 0x1a1038 : theme === 'snow' ? 0xdfe8f2 : theme === 'desert' ? 0xb97a44 : 0xd9c08a })); gd.rotation.x = -Math.PI / 2; gd.position.y = -1; envScene.add(gd);
  if (neon) for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(6, rnd(8, 26), 1), new THREE.MeshBasicMaterial({ color: k % 2 ? 0x00f0ff : 0xff2bd6 })); const a = k / 10 * 6.28; b.position.set(Math.cos(a) * 40, 6, Math.sin(a) * 40); b.lookAt(0, 6, 0); envScene.add(b); }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.03, 0.1, 200).texture; pm.dispose();

  // ---------- terrain ----------
  const SEG = 220, SIZE = 2400, tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), col = new THREE.Color(), c2 = new THREE.Color();
  const pal = {
    beach: (h, d, nz) => { col.set(0xf3dfa8).lerp(c2.set(0xe2c383), nz); if (d < 15) col.lerp(c2.set(0xd8bb80), 0.6); col.lerp(c2.set(0x7cc566).lerp(new THREE.Color(0x3f8f45), nz), smooth(2.5, 8, h)); if (h < 0.2) col.lerp(c2.set(0xc7ad72), smooth(0.2, -1.5, h)); },
    desert: (h, d, nz) => { col.set(0xe5a660).lerp(c2.set(0xc77b42), nz); if (d < 15) col.lerp(c2.set(0xb9713f), 0.5); col.lerp(c2.set(0xa8492f), smooth(18, 34, h) * 0.8); },
    snow: (h, d, nz) => { col.set(0xffffff).lerp(c2.set(0xdbe7f5), nz); if (d < 15) col.lerp(c2.set(0xc9d8ea), 0.6); col.lerp(c2.set(0xa9bfdc), smooth(20, 48, h) * 0.7); },
    neon: (h, d, nz) => { col.set(0x0c0918).lerp(c2.set(0x150f2c), nz); },
  }[theme];
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = T.height(x, z); tp.setY(i, h);
    pal(h, T.dist(x, z) - hw, fbm(x * 0.03 + 5, z * 0.03 + 9)); tc[i * 3] = col.r; tc[i * 3 + 1] = col.g; tc[i * 3 + 2] = col.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, vcol); terrain.receiveShadow = true; scene.add(terrain);

  let water = null;
  if (theme === 'beach') {
    water = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, fogC: { value: C(th.fog[0]) } },
      vertexShader: 'varying vec3 wp; void main(){ wp = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.0); }',
      fragmentShader: 'uniform float time; uniform vec3 fogC; varying vec3 wp; void main(){ float w = sin(wp.x*0.045+time*0.9)*sin(wp.z*0.05-time*0.7); float s = sin(wp.x*0.19-time*1.6+wp.z*0.11)*sin(wp.z*0.23+time*1.1); vec3 c = mix(vec3(0.02,0.36,0.62), vec3(0.08,0.62,0.78), 0.5+0.5*w); c += 0.22*smoothstep(0.82,1.0,s); float f = smoothstep(350.0,1500.0,length(wp-cameraPosition)); gl_FragColor = vec4(mix(c,fogC,f),1.0);\n#include <colorspace_fragment>\n}' }));
    water.rotation.x = -Math.PI / 2; water.position.y = -2.2; scene.add(water);
  }
  if (neon) { const grid = new THREE.GridHelper(2400, 120, 0xff2bd6, 0x4a1a80); grid.position.y = 0.04; scene.add(grid); }

  // ---------- road ----------
  const roadTex = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = th.road; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = 'rgba(0,0,0,.10)'; for (const x of [70, 92, 164, 186]) c.fillRect(x - 7, 0, 14, h);   // rubbered-in racing lines
    c.fillStyle = th.line; c.fillRect(9, 0, 7, h); c.fillRect(w - 16, 0, 7, h); c.globalAlpha = 0.85; c.fillRect(w / 2 - 4, 40, 8, 200);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const roadMat = neon ? new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.28, metalness: 0.35 }) : lam({ map: roadTex });
  const road = new THREE.Mesh(ribbon(T, -hw, hw, 0.09, null, 18), roadMat); road.receiveShadow = true; scene.add(road);
  const kA = C(th.kerb[0]), kB = C(th.kerb[1]), kc = (i) => (Math.floor(i / 2) % 2 ? kA : kB), kerbMat = neon ? new THREE.MeshBasicMaterial({ vertexColors: true }) : vcol;
  for (const s of [-1, 1]) { const k = new THREE.Mesh(ribbon(T, s > 0 ? hw : -hw - 2, s > 0 ? hw + 2 : -hw, 0.14, kc), kerbMat); k.receiveShadow = true; scene.add(k); }
  const bA = C(th.barrier[0]), bB = C(th.barrier[1]), barMat = neon ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) : lam({ vertexColors: true, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(wallRibbon(T, s * (T.wall + 1.2), neon ? 1.1 : 1.5, s > 0 ? bA : bB, s > 0 ? bB : bA), barMat); b.castShadow = !neon; scene.add(b); }

  // start line, gantry, boost pads
  const h0 = Math.atan2(T.tx[0], T.tz[0]);
  const checker = canvasTex(256, 32, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 4), new THREE.MeshBasicMaterial({ map: checker })); line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, h0, 0); line.position.set(T.px[0], 0.15, T.pz[0]); scene.add(line);
  const gantry = new THREE.Group(); gantry.position.set(T.px[0], 0, T.pz[0]); gantry.rotation.y = h0;
  const pmat = lam({ color: neon ? 0x2a2050 : 0x2c2c33 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 14, 1.4), pmat); p.position.set(s * (hw + 4), 7, 0); p.castShadow = true; gantry.add(p); }
  const bannerTex = canvasTex(1024, 128, (c, w, h) => { c.fillStyle = '#14110f'; c.fillRect(0, 0, w, h); for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) { if ((x + y) % 2) { c.fillStyle = '#fff'; c.fillRect(x * 20, y * 32, 20, 32); c.fillRect(w - 160 + x * 20, y * 32, 20, 32); } } c.fillStyle = '#ffc62b'; c.font = '900 84px "Bowlby One","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TURBO CLASH', w / 2, h / 2 + 4); });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 10, 3.6, 1), [pmat, pmat, pmat, pmat, new THREE.MeshBasicMaterial({ map: bannerTex }), new THREE.MeshBasicMaterial({ map: bannerTex })]); banner.position.y = 13.4; banner.castShadow = true; gantry.add(banner);
  for (let k = -2; k <= 2; k++) { const l = glow(0xff3322, 3.2, 0.9); l.position.set(k * 3.2, 11.1, -0.8); gantry.add(l); }
  scene.add(gantry);
  const padTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = neon ? '#00f0ff' : '#ffc62b'; c.fillRect(0, 0, w, h); c.strokeStyle = '#14110f'; c.lineWidth = 12; for (let y = 104; y > -10; y -= 38) { c.beginPath(); c.moveTo(8, y + 16); c.lineTo(32, y - 8); c.lineTo(56, y + 16); c.stroke(); } });
  const pads = T.def.pads.map((f, k) => {
    const i = Math.floor(f * T.N) % T.N, lat = (k % 2 ? 1 : -1) * hw * 0.38, x = T.px[i] + T.tz[i] * lat, z = T.pz[i] - T.tx[i] * lat;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 11), new THREE.MeshBasicMaterial({ map: padTex })); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.atan2(T.tx[i], T.tz[i]) + Math.PI, 0); m.position.set(x, 0.17, z); scene.add(m);
    const gl = glow(neon ? 0x00f0ff : 0xffc62b, 16, 0.5); gl.position.set(x, 1.2, z); scene.add(gl);
    return { x, z };
  });

  // trackside billboards
  const ads = ['COUCH CLASH', 'NITRO', 'NO BRAKES', 'SEND IT', 'GG', 'TILT!'];
  for (let k = 0; k < 6; k++) {
    const i = Math.floor(((k + 0.5) / 6) * T.N), s = k % 2 ? 1 : -1, o = s * (T.wall + 9), x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o;
    const tex = canvasTex(512, 160, (c, w, h) => { const cols = [['#ff4b2b', '#fff'], ['#ffc62b', '#14110f'], ['#19c2a0', '#14110f'], ['#2b7bff', '#fff'], ['#14110f', '#ffc62b'], ['#b455ff', '#fff']][k]; c.fillStyle = cols[0]; c.fillRect(0, 0, w, h); c.fillStyle = cols[1]; c.font = '900 92px "Bowlby One","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ads[k], w / 2, h / 2 + 6, w - 40); c.lineWidth = 10; c.strokeStyle = cols[1]; c.strokeRect(5, 5, w - 10, h - 10); });
    const bb = new THREE.Group(); bb.position.set(x, T.height(x, z), z); bb.rotation.y = Math.atan2(-s * T.tz[i], s * T.tx[i]);
    const face = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 0.5), [pmat, pmat, pmat, pmat, new THREE.MeshBasicMaterial({ map: tex }), pmat]); face.position.y = 7; face.castShadow = true; bb.add(face);
    for (const sx of [-6, 6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), pmat); p.position.set(sx, 2.5, 0); p.castShadow = true; bb.add(p); }
    scene.add(bb);
  }

  // ---------- scenery ----------
  const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s), cyl = (a, b, h, s = 7) => new THREE.CylinderGeometry(a, b, h, s);
  const near = hw + 15;
  const put = (o) => { o.y = T.height(o.x, o.z) - 0.25; return o; };
  const scatter = (n, minD, rMin, rMax, mk, ok) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 30) { const a = Math.random() * 6.28, r = Math.sqrt(rnd(rMin * rMin, rMax * rMax)), x = Math.cos(a) * r, z = Math.sin(a) * r; if (T.dist(x, z) < minD) continue; const o = put({ x, z, ry: Math.random() * 6.28, ...mk() }); if (ok && !ok(o)) continue; out.push(o); } return out; };
  const along = (n, minD, maxD, mk, ok) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 30) { const i = Math.floor(Math.random() * T.N), off = rnd(minD, maxD) * (Math.random() < 0.5 ? -1 : 1), x = T.px[i] + T.tz[i] * off, z = T.pz[i] - T.tx[i] * off; if (T.dist(x, z) < minD - 1) continue; const o = put({ x, z, ry: Math.random() * 6.28, ...mk() }); if (ok && !ok(o)) continue; out.push(o); } return out; };
  const add = (geo, list, mat = vcol, shadow = true) => scene.add(instanced(geo, mat, list, shadow));
  // place downloaded models: the list is shared out between the named models; returns false if any is missing so the caller can fall back
  const A = (assets && assets.props) || {};
  const useProps = (names, list, k, opts = {}) => {
    if (!names.every((nm) => A[nm])) return false;
    names.forEach((nm, ni) => {
      const src = A[nm], mine = list.filter((_, i) => i % names.length === ni).map((o) => ({ ...o, s: o.s * k })); if (!mine.length) return;
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld), mat = new THREE.MeshLambertMaterial({ color: o.material.color.clone(), map: o.material.map || null });
        if (opts.recolor && opts.recolor[o.material.name] !== undefined) mat.color.set(opts.recolor[o.material.name]);
        if (opts.tint) mat.color.lerp(new THREE.Color(opts.tint[0]), opts.tint[1]);
        scene.add(instanced(geo, mat, mine, opts.shadow !== false));
      });
    });
    return true;
  };
  const rock = merge([{ g: new THREE.DodecahedronGeometry(1, 0), c: theme === 'snow' ? 0xcbd9ea : theme === 'desert' ? 0x9c5a3c : neon ? 0x2a2050 : 0x8d8578, m: M(0, 0.45, 0, 1, 0.75, 1.1) }, { g: new THREE.DodecahedronGeometry(0.6, 0), c: theme === 'snow' ? 0xe6eef8 : theme === 'desert' ? 0xb06a48 : neon ? 0x3a2c6a : 0xa39b8c, m: M(0.8, 0.3, 0.4) }]);

  if (theme === 'beach') {
    const dry = (o) => o.y > 0.1;
    const leaves = []; for (let k = 0; k < 7; k++) leaves.push({ g: cone(0.95, 7, 4), c: k % 2 ? 0x2a9a45 : 0x45c260, m: new THREE.Matrix4().multiplyMatrices(M(0, 9.6, 0, 1, 1, 1, 0, k * 0.9, 0), M(2.6, -1.0, 0, 1, 1, 0.34, 0, 0, -1.95)) });
    const palm = merge([{ g: cyl(0.3, 0.42, 3.4), c: 0x8a5a2b, m: M(0, 1.7, 0, 1, 1, 1, 0, 0, 0.05) }, { g: cyl(0.27, 0.32, 3.4), c: 0x9a6a36, m: M(-0.2, 5.0, 0, 1, 1, 1, 0, 0, 0.1) }, { g: cyl(0.23, 0.28, 3.2), c: 0x8a5a2b, m: M(-0.45, 8.1, 0, 1, 1, 1, 0, 0, 0.04) }, { g: new THREE.SphereGeometry(0.55, 6, 5), c: 0x5a3a1b, m: M(-0.5, 9.5, 0) }, ...leaves.map((l) => ({ ...l, m: new THREE.Matrix4().multiplyMatrices(M(-0.5, 0, 0), l.m) }))]);
    { const L = [...scatter(80, near, 0, 440, () => ({ s: rnd(0.9, 1.5) }), dry), ...along(150, near, near + 36, () => ({ s: rnd(0.9, 1.7) }), dry)]; if (!useProps(['tree_palmDetailedTall', 'tree_palmBend', 'tree_palmShort'], L, 9, { recolor: { leafsGreen: 0x3fae4f, woodBark: 0x9a6a36 } })) add(palm, L); }
    { const L = [...scatter(50, near - 4, 0, 470, () => ({ s: rnd(1, 3.5) })), ...along(30, near - 5, near + 20, () => ({ s: rnd(0.8, 2) }))]; if (!useProps(['rock_largeA', 'rock_tallH'], L, 2.6)) add(rock, L); }
    useProps(['tent_detailedOpen'], along(12, near + 1, near + 12, () => ({ s: rnd(0.9, 1.2) }), dry), 9);
    useProps(['canoe'], scatter(10, 70, 405, 432, () => ({ s: 1 })), 7);
    const bush = merge([{ g: new THREE.IcosahedronGeometry(1, 1), c: 0x4faa5c, m: M(0, 0.6, 0, 1.3, 0.8, 1.3) }, { g: new THREE.IcosahedronGeometry(0.7, 1), c: 0x74cf86, m: M(0.9, 0.5, 0.3) }, { g: new THREE.IcosahedronGeometry(0.6, 1), c: 0x3f9550, m: M(-0.8, 0.4, -0.4) }]);
    { const L = [...scatter(90, near - 5, 0, 430, () => ({ s: rnd(0.8, 2.2) }), dry), ...along(110, near - 5, near + 28, () => ({ s: rnd(0.8, 1.9) }), dry)]; if (!useProps(['plant_bushDetailed'], L, 5.5)) add(bush, L); }
    const umb = merge([{ g: cyl(0.07, 0.07, 3, 5), c: 0xffffff, m: M(0, 1.5, 0) }, { g: cone(2.2, 0.9, 8), c: 0xff4b2b, m: M(0, 3.2, 0) }, { g: cone(2.25, 0.3, 8), c: 0xffffff, m: M(0, 2.8, 0) }, { g: new THREE.BoxGeometry(0.9, 0.12, 2.2), c: 0x2b7bff, m: M(1.6, 0.3, 0) }]);
    add(umb, along(26, near - 2, near + 16, () => ({ s: rnd(0.9, 1.2) }), dry));
    const isle = merge([{ g: cone(60, 50, 9), c: 0x5f9d5e, m: M(0, 18, 0) }, { g: cone(34, 30, 7), c: 0x77b46f, m: M(34, 8, 12) }, { g: cyl(74, 82, 6, 12), c: 0xf0d79b, m: M(0, -2, 0) }]);
    scene.add(instanced(isle, vcol, Array.from({ length: 10 }, (_, k) => { const a = k / 10 * 6.28 + rnd(-0.2, 0.2), r = rnd(850, 1500); return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: -1, s: rnd(0.8, 2), ry: rnd(0, 6) }; }), false));
  }
  if (theme === 'desert') {
    const mesa = merge([{ g: cyl(0.78, 1, 1, 9), c: 0xb5553a, m: M(0, 0.5, 0) }, { g: cyl(0.74, 0.8, 0.12, 9), c: 0xd98a5c, m: M(0, 0.62, 0) }, { g: cyl(0.6, 0.72, 0.5, 9), c: 0xc96a45, m: M(0.05, 1.22, 0) }, { g: cyl(0.63, 0.63, 0.07, 9), c: 0xe6aa78, m: M(0.05, 1.0, 0) }, { g: cyl(0.3, 0.42, 0.35, 7), c: 0xb5553a, m: M(-0.1, 1.6, 0.1) }]);
    add(mesa, [...scatter(30, near + 26, 0, 560, () => ({ s: rnd(12, 28), sy: rnd(0.9, 2.3) })), ...along(22, near + 18, near + 70, () => ({ s: rnd(5, 11), sy: rnd(1, 2.6) }))]);
    scene.add(instanced(mesa, vcol, scatter(26, 0, 750, 1500, () => ({ s: rnd(60, 130), sy: rnd(0.8, 1.7) })), false));
    const cactus = merge([{ g: cyl(0.5, 0.58, 6, 8), c: 0x3f8f4f, m: M(0, 3, 0) }, { g: new THREE.SphereGeometry(0.5, 8, 5), c: 0x3f8f4f, m: M(0, 6, 0) }, { g: cyl(0.32, 0.32, 2.2, 6), c: 0x4aa35c, m: M(1.2, 3.7, 0) }, { g: cyl(0.3, 0.3, 1.2, 6), c: 0x4aa35c, m: M(0.7, 2.7, 0, 1, 1, 1, 0, 0, 1.57) },
      { g: cyl(0.3, 0.3, 1.8, 6), c: 0x4aa35c, m: M(-1.1, 3.0, 0) }, { g: cyl(0.28, 0.28, 1.1, 6), c: 0x4aa35c, m: M(-0.65, 2.2, 0, 1, 1, 1, 0, 0, 1.57) }, { g: new THREE.SphereGeometry(0.2, 5, 4), c: 0xff7ac8, m: M(0, 6.5, 0) }]);
    { const L = [...scatter(70, near - 3, 0, 520, () => ({ s: rnd(0.8, 1.8) })), ...along(130, near - 4, near + 32, () => ({ s: rnd(0.8, 1.9) }))]; if (!useProps(['cactus_tall', 'cactus_short'], L, 9)) add(cactus, L); }
    const sandstone = { grass: 0xe0a066, dirt: 0xb5653a, stone: 0xc98a5a, stoneDark: 0x9c5a3c, _defaultMat: 0xb5653a };
    { const L = [...scatter(110, near - 5, 0, 600, () => ({ s: rnd(0.8, 4.5) })), ...along(70, near - 6, near + 24, () => ({ s: rnd(0.7, 2.4) }))]; if (!useProps(['rock_tallA', 'rock_tallH', 'stone_tallB'], L, 2.6, { recolor: sandstone })) add(rock, L); }
    useProps(['statue_obelisk'], along(9, near + 4, near + 22, () => ({ s: rnd(0.9, 1.4) })), 16, { recolor: sandstone });
    const shrub = merge([{ g: new THREE.IcosahedronGeometry(1, 0), c: 0x9aa85a, m: M(0, 0.4, 0, 1.2, 0.6, 1.2) }, { g: new THREE.IcosahedronGeometry(0.6, 0), c: 0xb7c070, m: M(0.8, 0.3, 0.2) }]);
    add(shrub, along(140, near - 6, near + 40, () => ({ s: rnd(0.6, 1.6) })));
  }
  if (theme === 'snow') {
    const pine = merge([{ g: cyl(0.4, 0.5, 2.2, 6), c: 0x5a3a22, m: M(0, 1.1, 0) }, { g: cone(3.1, 4.2, 8), c: 0x1b5f41, m: M(0, 3.9, 0) }, { g: cone(3.15, 0.9, 8), c: 0xf4f9ff, m: M(0, 2.5, 0, 1, -1, 1) }, { g: cone(2.4, 3.8, 8), c: 0x237550, m: M(0, 6.1, 0) }, { g: cone(2.45, 0.7, 8), c: 0xf4f9ff, m: M(0, 4.8, 0, 1, -1, 1) }, { g: cone(1.6, 3.2, 8), c: 0x2c8a5e, m: M(0, 8.3, 0) }, { g: cone(1.0, 1.6, 8), c: 0xffffff, m: M(0, 9.3, 0) }]);
    { const L = [...scatter(170, near, 0, 620, () => ({ s: rnd(0.9, 2.1) })), ...along(230, near - 2, near + 44, () => ({ s: rnd(0.9, 2.2) }))]; if (!useProps(['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineRoundA', 'tree_pineDefaultA'], L, 6.5, { tint: [0xffffff, 0.2] })) add(pine, L); }
    { const L = [...scatter(70, near - 5, 0, 560, () => ({ s: rnd(1, 4.5) })), ...along(50, near - 6, near + 22, () => ({ s: rnd(0.8, 2.2) }))]; if (!useProps(['stone_tallB', 'rock_largeA'], L, 2.6, { recolor: { grass: 0xffffff, dirt: 0x9fb4cf, stone: 0xb9c8dc, _defaultMat: 0x9fb4cf } })) add(rock, L); }
    const peak = merge([{ g: cone(1, 1.5, 7), c: 0x7f97b8, m: M(0, 0.75, 0) }, { g: cone(0.46, 0.69, 7), c: 0xffffff, m: M(0, 1.16, 0) }, { g: cone(0.6, 0.9, 6), c: 0x8ea6c4, m: M(0.7, 0.45, 0.2) }, { g: cone(0.24, 0.36, 6), c: 0xffffff, m: M(0.7, 0.72, 0.2) }]);
    scene.add(instanced(peak, vcol, scatter(30, 0, 800, 1600, () => ({ s: rnd(130, 260), sy: rnd(0.8, 1.5) })).map((o) => ({ ...o, y: 0 })), false));
    const snowman = merge([{ g: new THREE.SphereGeometry(0.9, 10, 8), c: 0xffffff, m: M(0, 0.8, 0) }, { g: new THREE.SphereGeometry(0.65, 10, 8), c: 0xffffff, m: M(0, 2.0, 0) }, { g: new THREE.SphereGeometry(0.45, 10, 8), c: 0xffffff, m: M(0, 2.95, 0) }, { g: cone(0.1, 0.5, 5), c: 0xff9a2b, m: M(0, 2.95, 0.55, 1, 1, 1, 1.57) }, { g: cyl(0.35, 0.35, 0.4, 8), c: 0x14110f, m: M(0, 3.5, 0) }]);
    add(snowman, along(14, near - 4, near + 10, () => ({ s: rnd(1.1, 1.6) })));
    const crystal = merge([{ g: new THREE.OctahedronGeometry(1, 0), c: 0x9fe8ff, m: M(0, 1.6, 0, 0.7, 1.8, 0.7) }, { g: new THREE.OctahedronGeometry(0.6, 0), c: 0xc8f4ff, m: M(0.8, 0.9, 0.3, 0.6, 1.4, 0.6, 0, 0, 0.3) }]);
    add(crystal, along(60, near - 6, near + 30, () => ({ s: rnd(0.8, 2.4) })), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85, emissive: 0x2f6f9f }));
  }
  // every track: cones in the run-off and a paddock of tents beside the start line
  { const cl = []; for (let i = 0; i < T.N; i += 7) { const s = Math.floor(i / 7) % 2 ? 1 : -1, o = s * (hw + 4.6); cl.push({ x: T.px[i] + T.tz[i] * o, z: T.pz[i] - T.tx[i] * o, y: 0.05, s: 1, ry: 0 }); } useProps(['cone'], cl, 2.4, { shadow: false }); }
  { const tl = []; for (const s of [-1, 1]) for (const k of [4, 14]) { const i = (T.N - k) % T.N, o = s * (T.wall + 17), x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o; if (T.dist(x, z) > T.wall + 13) tl.push({ x, z, y: T.height(x, z) + 0.1, s: 1, ry: Math.atan2(T.tx[i], T.tz[i]) }); } useProps(['decoration-tents'], tl, 2.1); }
  let lamps = null;
  if (neon) {
    const win = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#0d0a1c'; c.fillRect(0, 0, w, h); const cols = ['#00f0ff', '#ff2bd6', '#ffd23a', '#7a5cff']; for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) if (Math.random() < 0.45) { c.fillStyle = cols[Math.floor(Math.random() * 4)]; c.globalAlpha = rnd(0.5, 1); c.fillRect(x, y, 6, 6); } });
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const bm = new THREE.MeshBasicMaterial({ map: win });
    scene.add(instanced(box, bm, [...scatter(110, near + 22, 0, 640, () => ({ s: rnd(14, 30), sy: rnd(1.5, 6) })), ...along(100, near + 14, near + 64, () => ({ s: rnd(10, 20), sy: rnd(1.2, 5) }))], false));
    scene.add(instanced(box, bm, scatter(70, 0, 720, 1400, () => ({ s: rnd(40, 90), sy: rnd(2, 7) })), false));
    const arch = new THREE.TorusGeometry(hw + 9, 0.8, 8, 32, Math.PI);
    for (let k = 1; k < 10; k++) { const i = Math.floor((k / 10) * T.N), cc = k % 2 ? 0x00f0ff : 0xff2bd6, a = new THREE.Mesh(arch, new THREE.MeshBasicMaterial({ color: cc })); a.position.set(T.px[i], 0, T.pz[i]); a.rotation.y = Math.atan2(T.tx[i], T.tz[i]); scene.add(a);
      for (const s of [-1, 1]) { const g2 = glow(cc, 26, 0.55); g2.position.set(T.px[i] + T.tz[i] * s * (hw + 9), 2, T.pz[i] - T.tx[i] * s * (hw + 9)); scene.add(g2); } }
    const sunTex = canvasTex(256, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe14a'); g.addColorStop(1, '#ff2bd6'); c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; for (let y = 120, t = 4; y < 256; y += 20, t += 2.5) c.fillRect(0, y, w, t); });
    const rs = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false })); rs.position.set(0, 280, -2200); scene.add(rs);
    const sgl = glow(0xff5ad0, 1900, 0.5); sgl.position.set(0, 280, -2210); scene.add(sgl);
    const st = []; for (let i = 0; i < 1100; i++) { const a = Math.random() * 6.28, e = rnd(0.1, 1.4); st.push(Math.cos(a) * Math.cos(e) * 2300, Math.sin(e) * 2300, Math.sin(a) * Math.cos(e) * 2300); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(st, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, fog: false })));
    // street lamps: glowing dots lining the road
    const lp = []; for (let i = 0; i < T.N; i += 9) for (const s of [-1, 1]) lp.push(T.px[i] + T.tz[i] * s * (T.wall + 2.2), 5.5, T.pz[i] - T.tx[i] * s * (T.wall + 2.2));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lamps = new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffd7fb, size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(lamps);
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 5); pole.translate(0, 2.75, 0);
    const pl = []; for (let i = 0; i < lp.length; i += 3) pl.push({ x: lp[i], z: lp[i + 2], s: 1 });
    scene.add(instanced(pole, new THREE.MeshBasicMaterial({ color: 0x3a2c6a }), pl, false));
  } else {
    const sp = sd.clone().multiplyScalar(2300), sdisc = new THREE.Mesh(new THREE.SphereGeometry(theme === 'desert' ? 150 : 80, 20, 14), new THREE.MeshBasicMaterial({ color: theme === 'desert' ? 0xffe6b0 : 0xfffbe6, fog: false })); sdisc.position.copy(sp); scene.add(sdisc);
    const halo = glow(theme === 'desert' ? 0xffa050 : 0xfff2c0, theme === 'desert' ? 1700 : 1100, theme === 'snow' ? 0.5 : 0.75); halo.position.copy(sp); scene.add(halo);
    const cloud = merge([{ g: new THREE.IcosahedronGeometry(1, 2), c: 0xffffff, m: M(0, 0, 0, 2.2, 0.8, 1.3) }, { g: new THREE.IcosahedronGeometry(1, 2), c: 0xffffff, m: M(1.6, 0.3, 0.2, 1.4, 0.9, 1) }, { g: new THREE.IcosahedronGeometry(1, 2), c: 0xf2f6fb, m: M(-1.5, 0.1, -0.2, 1.3, 0.7, 1) }, { g: new THREE.IcosahedronGeometry(1, 2), c: 0xffffff, m: M(0.4, 0.5, -0.3, 1.2, 0.9, 0.9) }]);
    const cl = []; for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = rnd(350, 1700); cl.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rnd(210, 420), s: rnd(24, 70), ry: Math.random() * 6 }); }
    scene.add(instanced(cloud, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, transparent: true, opacity: theme === 'desert' ? 0.6 : 0.95, emissive: theme === 'desert' ? 0x6a3320 : 0x7f8fa5 }), cl, false));
  }
  let snow = null;
  if (theme === 'snow') {
    const p = []; for (let i = 0; i < 3200; i++) p.push(rnd(-440, 440), rnd(0, 90), rnd(-440, 440));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xffffff, size: 1.6, transparent: true, opacity: 0.9, depthWrite: false })); snow.frustumCulled = false; scene.add(snow);
  }
  const particles = new Particles(scene);
  return { pads, sun, particles, dust: C(th.dust), theme,
    update(dt, clock) {
      if (water) water.material.uniforms.time.value = clock;
      if (snow) { const a = snow.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - 13 * dt; if (y < 0) y += 90; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(clock + i) * 2 * dt); } a.needsUpdate = true; }
      particles.update(dt);
    } };
}

// ---------- cars ----------
function profile(bottomY, rear, front, top, width, bevel = 0.09) {
  // side silhouette (x = along the car, y = up), extruded across the car's width with rounded edges
  const sh = new THREE.Shape(); sh.moveTo(rear, bottomY); sh.lineTo(front, bottomY); sh.splineThru(top.map(([x, y]) => new THREE.Vector2(x, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g;
}
function buildCarProc(type, color) {
  const g = new THREE.Group(), chassis = new THREE.Group(); g.add(chassis);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.26, envMapIntensity: 1.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1220, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde4, metalness: 0.95, roughness: 0.2 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.9, metalness: 0 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2020 }), ice = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  const mats = [paint, dark, glass, chrome, tyre];
  const addM = (geo, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); chassis.add(b); return b; };
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = addM(new THREE.BoxGeometry(w, h, d), m, x, y, z); b.rotation.x = rx; return b; };
  const wheels = [], fronts = [];
  const wheel = (r, w, x, z, front, chunky) => {
    const pivot = new THREE.Group(); pivot.position.set(x, r, z); const spin = new THREE.Group(); pivot.add(spin);
    const pr = [[r * 0.62, -w / 2], [r * 0.92, -w / 2], [r, -w / 2 + r * 0.14], [r, w / 2 - r * 0.14], [r * 0.92, w / 2], [r * 0.62, w / 2]].map(([a, b]) => new THREE.Vector2(a, b));
    const t = new THREE.Mesh(new THREE.LatheGeometry(pr, chunky ? 12 : 22), tyre); t.rotation.z = Math.PI / 2; if (chunky) t.material = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95, flatShading: true }); spin.add(t);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w * 0.72, 18), dark); rim.rotation.z = Math.PI / 2; spin.add(rim);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 0.86, 10), chrome); cap.rotation.z = Math.PI / 2; spin.add(cap);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, r * 0.6, r * 0.13), chrome); s.rotation.x = k * Math.PI * 2 / 5; s.position.set(0, Math.cos(k * Math.PI * 2 / 5) * r * 0.32, Math.sin(k * Math.PI * 2 / 5) * r * 0.32); spin.add(s); }
    g.add(pivot); wheels.push(spin); if (front) fronts.push(pivot);
  };
  const lights = (xs, y, z, rear) => { for (const x of xs) { box(0.42, 0.14, 0.08, rear ? tail : head, x, y, z); const gl = glow(rear ? 0xff2020 : 0xfff0b0, rear ? 1.5 : 2.2, rear ? 0.8 : 0.9); gl.position.set(x, y, z + (rear ? -0.15 : 0.2)); chassis.add(gl); } };
  let flameZ = -2.5, flameY = 0.6, tagY = 3.2;
  if (type === 'bolt') { // open-wheel racer
    addM(profile(0.2, -2.0, 2.95, [[2.95, 0.3], [2.2, 0.42], [1.1, 0.6], [0.55, 0.86], [-0.15, 0.92], [-0.6, 1.16], [-1.3, 0.86], [-2.0, 0.62]], 0.84, 0.12), paint);
    for (const s of [-1, 1]) addM(profile(0.2, -1.55, 0.8, [[0.8, 0.36], [0.45, 0.62], [-0.9, 0.7], [-1.55, 0.5]], 0.62, 0.1), paint, s * 0.78);
    box(0.5, 0.3, 0.8, dark, 0, 0.9, 0.15); addM(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), 0, 1.02, 0.02);
    box(2.7, 0.07, 0.6, dark, 0, 0.22, 2.85); for (const s of [-1, 1]) box(0.07, 0.34, 0.66, paint, s * 1.35, 0.34, 2.85); box(1.9, 0.06, 0.34, paint, 0, 0.36, 2.72);
    box(2.2, 0.08, 0.62, dark, 0, 1.32, -2.05); box(2.2, 0.06, 0.4, paint, 0, 1.08, -2.12); for (const s of [-1, 1]) box(0.07, 0.62, 0.8, paint, s * 1.1, 1.08, -2.05); box(0.12, 0.6, 0.3, dark, 0, 0.9, -1.9);
    for (const s of [-1, 1]) { box(0.9, 0.05, 0.08, dark, s * 0.75, 0.5, 1.85); box(0.9, 0.05, 0.08, dark, s * 0.75, 0.56, -1.5); }
    for (const s of [-1, 1]) { wheel(0.56, 0.5, s * 1.22, 1.85, true); wheel(0.62, 0.7, s * 1.22, -1.5, false); }
    lights([0], 0.72, -2.02, true); flameZ = -2.2; tagY = 2.9;
  } else if (type === 'phantom') { // low coupe
    addM(profile(0.3, -2.3, 2.3, [[2.3, 0.52], [2.12, 0.7], [1.25, 0.84], [0.6, 0.9], [-1.4, 0.97], [-2.2, 0.95], [-2.34, 0.7]], 2.04, 0.14), paint);
    addM(profile(0.86, -1.8, 0.95, [[0.95, 0.88], [0.4, 1.3], [-0.45, 1.4], [-1.1, 1.3], [-1.8, 0.94]], 1.66, 0.12), glass);
    box(1.2, 0.04, 1.1, paint, 0, 1.43, -0.45); box(2.06, 0.1, 0.5, dark, 0, 0.3, 2.15); box(2.06, 0.12, 0.3, dark, 0, 0.32, -2.2); box(1.9, 0.07, 0.42, paint, 0, 1.08, -2.12, 0.2);
    for (const s of [-1, 1]) box(0.08, 0.16, 2.6, dark, s * 1.03, 0.36, 0);
    for (const s of [-1, 1]) { wheel(0.47, 0.36, s * 0.99, 1.45, true); wheel(0.49, 0.4, s * 0.99, -1.45, false); }
    lights([-0.72, 0.72], 0.66, 2.3, false); box(1.7, 0.09, 0.06, tail, 0, 0.78, -2.33); const tg = glow(0xff2020, 2.4, 0.6); tg.position.set(0, 0.78, -2.5); chassis.add(tg); tagY = 2.9;
  } else if (type === 'titan') { // monster truck
    addM(profile(1.2, -2.35, 2.35, [[2.35, 1.72], [2.2, 2.02], [0.9, 2.1], [-2.25, 2.08], [-2.38, 1.72]], 2.34, 0.14), paint);
    addM(profile(2.0, -0.8, 1.05, [[1.05, 2.05], [0.72, 2.72], [-0.5, 2.78], [-0.8, 2.08]], 2.08, 0.12), glass); box(1.9, 0.08, 1.2, paint, 0, 2.82, 0.1);
    box(2.0, 0.34, 3.4, dark, 0, 1.12, 0); box(2.7, 0.5, 0.3, chrome, 0, 1.5, 2.45); box(2.7, 0.3, 0.3, dark, 0, 1.4, -2.45);
    for (const s of [-1, 1]) { box(0.1, 0.9, 0.1, chrome, s * 0.95, 2.6, -1.0); box(0.14, 0.7, 0.14, chrome, s * 1.0, 0.9, 1.5, 0.3); box(0.14, 0.7, 0.14, chrome, s * 1.0, 0.9, -1.5, -0.3); }
    box(2.0, 0.1, 0.1, chrome, 0, 3.05, -1.0); for (const x of [-0.7, -0.23, 0.23, 0.7]) { addM(new THREE.SphereGeometry(0.17, 8, 6), head, x, 3.22, -0.95); }
    for (const s of [-1, 1]) { wheel(1.08, 0.92, s * 1.48, 1.55, true, true); wheel(1.08, 0.92, s * 1.48, -1.55, false, true); }
    lights([-0.85, 0.85], 1.78, 2.38, false); lights([-0.9, 0.9], 1.8, -2.4, true); flameY = 1.5; tagY = 4.6;
  } else if (type === 'frost') { // rally hatch
    addM(profile(0.42, -2.0, 2.05, [[2.05, 0.68], [1.9, 0.94], [0.9, 1.04], [-1.95, 1.08], [-2.06, 0.74]], 1.98, 0.13), paint);
    addM(profile(1.0, -1.85, 0.9, [[0.9, 1.02], [0.36, 1.58], [-1.25, 1.62], [-1.85, 1.06]], 1.72, 0.11), glass); box(1.5, 0.05, 1.4, paint, 0, 1.66, -0.45);
    box(0.5, 0.16, 0.6, dark, 0, 1.76, 0.0); for (const x of [-0.6, -0.2, 0.2, 0.6]) { const l = addM(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), head, x, 1.12, 1.75); l.rotation.x = Math.PI / 2; }
    box(0.34, 0.03, 4.0, ice, 0.42, 1.09, 0.02); box(0.34, 0.03, 4.0, ice, -0.42, 1.09, 0.02);
    box(1.9, 0.07, 0.5, dark, 0, 1.92, -1.75); for (const s of [-1, 1]) { box(0.06, 0.3, 0.3, dark, s * 0.7, 1.78, -1.7); box(0.5, 0.36, 0.05, dark, s * 0.95, 0.38, -1.75); }
    box(2.1, 0.24, 0.26, dark, 0, 0.5, 2.05); box(2.05, 0.2, 0.2, dark, 0, 0.52, -2.05);
    for (const s of [-1, 1]) { wheel(0.56, 0.42, s * 1.02, 1.3, true); wheel(0.56, 0.42, s * 1.02, -1.3, false); }
    lights([-0.72, 0.72], 0.82, 2.08, false); lights([-0.75, 0.75], 0.86, -2.08, true); flameZ = -2.1; tagY = 3.1;
  } else { // warp: hover pod
    const hull = addM(new THREE.SphereGeometry(1.5, 28, 18), paint, 0, 0.95, 0); hull.scale.set(1, 0.34, 1.8);
    const dome = addM(new THREE.SphereGeometry(0.78, 20, 14), glass, 0, 1.22, 0.3); dome.scale.set(1, 0.72, 1.5);
    box(0.1, 0.9, 1.1, paint, 0, 1.65, -1.75, -0.3); box(2.9, 0.08, 0.5, dark, 0, 1.0, -2.1); for (const s of [-1, 1]) box(0.08, 0.4, 0.6, paint, s * 1.45, 1.1, -2.1);
    const ringM = new THREE.MeshBasicMaterial({ color: 0x66f6ff }); g.userData.rings = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const r = addM(new THREE.TorusGeometry(0.5, 0.13, 8, 20), ringM, sx * 1.35, 0.42, sz * 1.55); r.rotation.x = Math.PI / 2; g.userData.rings.push(r); const gl = glow(0x66f6ff, 2.6, 0.7); gl.position.set(sx * 1.35, 0.3, sz * 1.55); chassis.add(gl); }
    lights([-0.5, 0.5], 0.95, 2.6, false); flameY = 0.95; flameZ = -2.8; tagY = 3.0;
  }
  chassis.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // effects shared by every car
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(type === 'titan' ? 5.4 : 4.2, type === 'titan' ? 7.6 : 6.6), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.2; g.add(shadow);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 10), new THREE.MeshBasicMaterial({ color: 0xffb02a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, flameY, flameZ - 1.6); flame.visible = false; chassis.add(flame);
  const fg = glow(0xff8a1a, 7, 0.9); fg.position.set(0, flameY, flameZ - 0.6); fg.visible = false; chassis.add(fg);
  const iceBlock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbff2ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, depthWrite: false, flatShading: true }));
  iceBlock.scale.set(2.3, type === 'titan' ? 2.6 : 1.8, 3.6); iceBlock.position.y = type === 'titan' ? 1.9 : 1.2; iceBlock.visible = false; g.add(iceBlock);
  g.scale.setScalar(1.15);
  Object.assign(g.userData, { chassis, wheels, fronts, mats, flame, flameGlow: fg, iceBlock, tagY, rearZ: flameZ, wheelY: type === 'titan' ? 0.3 : 0.15 });
  return g;
}
// A car from the downloaded Kenney models, rigged so wheels spin and steer. Falls back to the code-built car if the model is missing.
export function buildCar(type, color, assets, botModel) {
  const src = assets && assets.cars && assets.cars[botModel || CAR_MODEL[type]];
  if (!src) return buildCarProc(type, color);
  const g = new THREE.Group(), rig = new THREE.Group(), chassis = new THREE.Group(); g.add(rig); rig.add(chassis);
  rig.scale.setScalar(type === 'titan' && !botModel ? 2.2 : 1.85);
  const model = src.clone(true); model.updateMatrixWorld(true);
  const matMap = new Map(), mats = [];
  model.traverse((o) => { if (!o.isMesh) return; let m = matMap.get(o.material); if (!m) { m = o.material.clone(); m.roughness = 0.42; m.metalness = 0.12; m.envMapIntensity = 1.1; matMap.set(o.material, m); mats.push(m); } o.material = m; o.castShadow = true; });
  const wheels = [], fronts = [], wheelNodes = [];
  model.traverse((o) => { if (o !== model && /^wheel/i.test(o.name)) wheelNodes.push(o); });
  for (const w of wheelNodes) {
    const pos = new THREE.Vector3().setFromMatrixPosition(w.matrixWorld), q = new THREE.Quaternion().setFromRotationMatrix(w.matrixWorld);
    const pivot = new THREE.Group(), spin = new THREE.Group(); pivot.position.copy(pos); pivot.add(spin);
    w.removeFromParent(); w.position.set(0, 0, 0); w.quaternion.copy(q); spin.add(w);
    rig.add(pivot); wheels.push(spin); if (/front/i.test(w.name)) fronts.push(pivot);
  }
  chassis.add(model); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig), H = box.max.y, Wd = box.max.x - box.min.x, L = box.max.z - box.min.z;
  // contact shadow, a ring in the player's colour so cars are easy to tell apart, lights, and the shared effects
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.9, L * 1.45), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.2; g.add(blob);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.scale.set(Wd * 0.95, L * 0.62, 1); ring.position.y = 0.24; g.add(ring);
  for (const sx of [-1, 1]) { const hl = glow(0xfff0b0, 2.0, 0.85); hl.position.set(sx * Wd * 0.3, H * 0.4, box.max.z + 0.1); g.add(hl); const tl = glow(0xff2020, 1.6, 0.85); tl.position.set(sx * Wd * 0.3, H * 0.45, box.min.z - 0.1); g.add(tl); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 10), new THREE.MeshBasicMaterial({ color: 0xffb02a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, H * 0.36, box.min.z - 1.6); flame.visible = false; g.add(flame);
  const fg = glow(0xff8a1a, 7, 0.9); fg.position.set(0, H * 0.36, box.min.z - 0.6); fg.visible = false; g.add(fg);
  const iceBlock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbff2ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, depthWrite: false, flatShading: true }));
  iceBlock.scale.set(Wd * 0.85, H * 0.8, L * 0.68); iceBlock.position.y = H * 0.5; iceBlock.visible = false; g.add(iceBlock);
  Object.assign(g.userData, { chassis, wheels, fronts, mats, flame, flameGlow: fg, iceBlock, tagY: H + 1.5, blob });
  return g;
}
export function nameTag(name, color) {
  const tex = canvasTex(256, 64, (c, w) => {
    c.font = '900 34px "DM Sans", system-ui, sans-serif'; const tw = Math.min(232, c.measureText(name).width + 34);
    c.fillStyle = color; c.beginPath(); c.roundRect((w - tw) / 2, 8, tw, 48, 24); c.fill(); c.lineWidth = 5; c.strokeStyle = '#14110f'; c.stroke();
    c.fillStyle = '#14110f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w / 2, 34, 210);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false })); s.scale.set(5.2, 1.3, 1); return s;
}
