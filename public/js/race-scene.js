// The racing world: light, sky, terrain, road, walls, scenery. Downloaded models (Quaternius nature and
// village packs, Kenney racing kit) are placed with instancing in map-sized chunks, so each split-screen
// camera only draws the chunks it can see. Anything that fails to load is simply left out.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { THEMES, M, merge, canvasTex, glow, glowTex, Particles, ribbon, wallRibbon, clamp, rnd, lerp, smooth, fbm, vnoise } from './race-world.js';

const NATURE = {
  beach: ['NormalTree_5', 'PineTree_5', 'PalmTree_1', 'Bush', 'Bush_Flowers', 'Flower_2_Clump', 'Plant_Flowers', 'Rock_1', 'Rock_5'],
  snow: ['PineTree_1', 'PineTree_5', 'Rock_1', 'Rock_2', 'Rock_5'],
  desert: ['PalmTree_1', 'PalmTree_2', 'Rock_1', 'Rock_2', 'Rock_5'],
  neon: [],
};
const TEXS = {
  beach: { NormalTree_Leaves: 'png', PineTree_Leaves: 'png', PalmTree_Leaves: 'png', Bush_Leaves: 'png', Flowers: 'png', Rocks: 'jpg' },
  snow: { PineTree_Leaves: 'png', Rocks: 'jpg' }, desert: { PalmTree_Leaves: 'png', Rocks_Desert: 'jpg' }, neon: {},
};
const TOWN = { beach: ['House_1', 'House_2', 'Inn', 'Bell_Tower', 'Townhouse', 'Well'] };
const KIT = ['grandStandAwning', 'tent', 'lightPostLarge', 'bannerTowerRed', 'flagCheckers'];
const OLD = { all: ['cone'], desert: ['cactus_tall', 'cactus_short', 'statue_obelisk'] };
const LOOK = {
  beach: { env: 'rooitou_park_1k', envI: 1.0, fill: 0.5, horizon: 0xfff1d6, cloud: ['#ffffff', '#f3d6c8'] },
  desert: { env: 'kiara_1_dawn_1k', envI: 1.15, fill: 0.3, horizon: 0xffc88e, cloud: ['#ffe6cc', '#d98f6e'] },
  snow: { env: 'rooitou_park_1k', envI: 0.9, fill: 0.3, horizon: 0xf4f9ff, cloud: ['#ffffff', '#c8d6ea'] },
  neon: { env: null, envI: 1, horizon: 0x3a0f5c, cloud: null },
};

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn().catch(() => null)); return cache.get(key); };
export async function loadRaceAssets(theme) {
  const gl = new GLTFLoader(), tl = new THREE.TextureLoader(), out = { models: {}, tex: {}, env: null, theme }, jobs = [];
  const model = (dir, n) => jobs.push(once(dir + n, () => gl.loadAsync(`/assets/${dir}/${n}.glb`).then((g) => g.scene)).then((m) => { out.models[n] = m; }));
  for (const n of NATURE[theme] || []) model('nature2', n);
  for (const n of TOWN[theme] || []) model('town', n);
  for (const n of KIT) model('racekit', n);
  for (const n of [...OLD.all, ...(OLD[theme] || [])]) model('props', n);
  for (const [n, ext] of Object.entries(TEXS[theme] || {})) jobs.push(once('t' + n, () => tl.loadAsync(`/assets/nature2/tex/${n}.${ext}`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; })).then((t) => { out.tex[n] = t; }));
  const env = LOOK[theme].env; if (env) jobs.push(once('env' + env, () => new HDRLoader().loadAsync(`/assets/env/${env}.hdr`)).then((t) => { out.env = t; }));
  await Promise.all(jobs); return out;
}

// ---------- turning loaded models into something cheap to draw many times ----------
// a whole tree as one mesh: trunk faces are pointed at a few bark-coloured pixels in the corner of the leaf texture
// `keep` < 1 thins the foliage: that share of the leaf cards (pairs of triangles) is kept, chosen in a fixed scattered pattern
function treeGeo(model, pu = 0.006, pv = 0.006, keep = 1) {
  const geos = []; model.updateMatrixWorld(true);
  model.traverse((o) => { if (!o.isMesh) return; let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (/Bark|Trunk/i.test(o.material.name)) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pu, pv); }
    else if (keep < 1 && g.index) { const src = g.index.array, out = []; for (let q = 0; q < src.length; q += 6) { const r = Math.sin(q * 12.9898) * 43758.5453; if (r - Math.floor(r) < keep) for (let k = q; k < Math.min(q + 6, src.length); k++) out.push(src[k]); } g.setIndex(out); g = g.toNonIndexed(); g = BGU.mergeVertices(g); }
    geos.push(g); });
  return geos.length ? BGU.mergeGeometries(geos, false) : null;
}
// an untextured model as one mesh with its colours stored per corner (works for any source model, indexed or not)
function bakeGeo(model, pick) {
  const pos = [], nor = [], colr = []; model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return; const c = pick(o.material.name, o.material.color); if (c === null || c === undefined) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, col = new THREE.Color(c);
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); colr.push(col.r, col.g, col.b); }
  });
  if (!pos.length) return null;
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); return out;
}
const partGeo = (model, name) => { let out = null; model.updateMatrixWorld(true); model.traverse((o) => { if (o.isMesh && o.material.name === name) out = o.geometry.clone().applyMatrix4(o.matrixWorld); }); return out; };
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const mix = (t) => { const v = Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453; return v - Math.floor(v); };
const hOf = (g) => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.max.y; };
const shadeY = (g, lo, hi) => { const p = g.attributes.position, c = g.attributes.color; g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y; for (let i = 0; i < p.count; i++) { const k = lo + (hi - lo) * ((p.getY(i) - y0) / (y1 - y0)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } return g; };
// cheap stand-ins drawn instead of a full tree once it is far away: same size and colour, a few dozen triangles
function lodTree(geo, kind, leaf, bark) {
  geo.computeBoundingBox(); const b = geo.boundingBox, H = b.max.y, W = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const crown = kind === 'cone' ? shadeY(merge([{ g: new THREE.ConeGeometry(W * 0.36, H * 0.84, 7), c: leaf, m: M(0, H * 0.58, 0) }]), 0.72, 1.12)
    : shadeY(merge([{ g: new THREE.IcosahedronGeometry(1, 1), c: leaf, m: M(0, H * 0.7, 0, W * 0.33, H * 0.3, W * 0.33) }, { g: new THREE.IcosahedronGeometry(1, 0), c: leaf, m: M(W * 0.24, H * 0.56, W * 0.08, W * 0.22, H * 0.2, W * 0.22, 0.4, 0.7, 0) }, { g: new THREE.IcosahedronGeometry(1, 0), c: leaf, m: M(-W * 0.2, H * 0.6, -W * 0.14, W * 0.24, H * 0.2, W * 0.24, 0.2, 2.1, 0.5) }]), 0.7, 1.15);
  const trunk = merge([{ g: new THREE.CylinderGeometry(W * 0.03, W * 0.045, H * 0.5, 5), c: bark, m: M(0, H * 0.25, 0) }]);
  return BGU.mergeGeometries([crown, trunk], false);
}
// a cypress: one lumpy teardrop, darker at the foot and on the side away from the light. Unit height.
// a far-away house: walls and a hipped roof in the same colours, twenty triangles
function lodHouse(geo, wall, roof) {
  geo.computeBoundingBox(); const b = geo.boundingBox, W = (b.max.x - b.min.x) * 0.9, D = (b.max.z - b.min.z) * 0.9, H = b.max.y, cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
  const cone = new THREE.ConeGeometry(0.72, 1, 4); cone.rotateY(Math.PI / 4);
  return merge([{ g: new THREE.BoxGeometry(W, H * 0.62, D), c: wall, m: M(cx, H * 0.31, cz) }, { g: cone, c: roof, m: M(cx, H * 0.8, cz, W * 1.06, H * 0.38, D * 1.06) }]);
}
function cypressGeo() {
  const RS = 8, HS = 7, pos = [], col = [], idx = [], c = new THREE.Color(), c2 = new THREE.Color();
  for (let j = 0; j <= HS; j++) for (let i = 0; i <= RS; i++) {
    const t = j / HS, a = (i % RS) / RS * Math.PI * 2, lump = 1 + 0.13 * Math.sin(a * 3 + t * 11) + 0.16 * (vnoise(Math.cos(a) * 2 + 3, t * 8 + Math.sin(a) * 2) - 0.5);
    const r = 0.125 * lerp(0.62, 1, smooth(0, 0.28, t)) * Math.pow(1 - t, 0.62) * lump, y = 0.05 + t * 0.95;
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    c.set(0x1c4428).lerp(c2.set(0x4a8440), smooth(0.05, 1, t) * 0.8 + 0.2 * (lump - 0.85)); col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < HS; j++) for (let i = 0; i < RS; i++) { const a = j * (RS + 1) + i, b = a + RS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nm = g.attributes.normal; for (let j = 0; j <= HS; j++) { const a = j * (RS + 1), b = a + RS, x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); }
  const trunk = merge([{ g: new THREE.CylinderGeometry(0.014, 0.02, 0.09, 5), c: 0x5a4030, m: M(0, 0.045, 0) }]);
  return BGU.mergeGeometries([g.toNonIndexed(), trunk], false);
}

function stoneTexture(cap) { // hand-laid limestone blocks; `cap` adds a coping stone along the top fifth
  return canvasTex(512, 256, (c, w, h) => {
    const tones = ['#e9dcc0', '#e2d2b2', '#d8c6a2', '#efe4cc', '#dccaa6', '#e6d7b8'], rows = cap ? 4 : 5, y0 = cap ? h * 0.2 : 0, rh = (h - y0) / rows;
    c.fillStyle = '#b7a585'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) { let x = -rnd(0, 60); while (x < w) { const bw = rnd(44, 96); c.fillStyle = tones[Math.floor(Math.random() * tones.length)]; for (const xx of [x, x + w]) { c.beginPath(); c.roundRect(xx + 1.5, y0 + r * rh + 1.5, bw - 3, rh - 3, 5); c.fill(); } x += bw; } }
    if (cap) { c.fillStyle = '#f3ead6'; c.fillRect(0, 0, w, y0 - 2); c.fillStyle = 'rgba(120,100,70,.35)'; c.fillRect(0, y0 - 4, w, 4); for (let x = 0; x < w; x += 128) c.fillRect(x, 0, 2, y0); }
    for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(80,60,30,.07)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
}
function stoneWall(T, off, h, th) { // a low wall with thickness: road face, top, back face. v 0..0.8 = courses, 0.8..1 = coping
  const { N, px, pz, tx, tz } = T, pos = [], uv = []; let len = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, o2 = off + Math.sign(off) * th, u0 = len / 7; len += 2.5; const u1 = len / 7;
    const a = [px[i] + tz[i] * off, pz[i] - tx[i] * off], b = [px[j] + tz[j] * off, pz[j] - tx[j] * off], c = [px[i] + tz[i] * o2, pz[i] - tx[i] * o2], d = [px[j] + tz[j] * o2, pz[j] - tx[j] * o2];
    const quad = (p, q, r, s, y0, y1, y2, y3, v0, v1) => { pos.push(p[0], y0, p[1], q[0], y1, q[1], r[0], y2, r[1], r[0], y2, r[1], q[0], y1, q[1], s[0], y3, s[1]); uv.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1); };
    quad(a, b, a, b, 0, 0, h, h, 0.8, 0); quad(d, c, d, c, -1, -1, h, h, 0.8, 0); quad(a, b, c, d, h, h, h, h, 0.98, 0.82);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function mountainGeo(seed, snowLine, cols) {
  const RS = 22, HS = 8, pos = [], col = [], idx = [], c = new THREE.Color(), c2 = new THREE.Color();
  for (let j = 0; j <= HS; j++) for (let i = 0; i <= RS; i++) {
    const t = j / HS, a = (i % RS) / RS * Math.PI * 2, ridge = 1 + 0.26 * Math.sin(a * 3 + seed) + 0.15 * Math.sin(a * 7 + seed * 2.3) + 0.2 * (vnoise(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + t * 4) - 0.5);
    const r = Math.pow(1 - t, 0.82) * ridge, y = Math.pow(t, 1.12) * (1 + 0.1 * Math.sin(a * 5 + seed) * (1 - t));
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    const n = vnoise(a * 6 + seed, t * 9); c.set(cols[0]).lerp(c2.set(cols[1]), smooth(0.12, 0.45, t + n * 0.12)); c.lerp(c2.set(cols[2]), smooth(snowLine - 0.1, snowLine + 0.08, t + (n - 0.5) * 0.22));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < HS; j++) for (let i = 0; i < RS; i++) { const a = j * (RS + 1) + i, b = a + RS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nm = g.attributes.normal; for (let j = 0; j <= HS; j++) { const a = j * (RS + 1), b = a + RS, x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); }
  return g;
}

// ============================================================
export function buildScene(scene, T, renderer, A) {
  const theme = T.def.theme, th = THEMES[theme], look = LOOK[theme], neon = theme === 'neon', hw = T.hw, MD = (A && A.models) || {}, TX = (A && A.tex) || {};
  const lam = (o) => new THREE.MeshLambertMaterial(o), vcol = lam({ vertexColors: true }), C = (h) => new THREE.Color(h);
  const groups = [], stat = { tris: 0, instances: 0 }, _m4 = new THREE.Matrix4();
  // Instances are grouped by map square; each group gets its own bounds so off-screen squares are skipped per camera.
  function place(geo, mat, list, { shadow = true, detail = false, far = false, name = '', lod = null, lodK = 1 } = {}) {
    if (!geo || !list.length) return; const CH = lod ? 150 : tris(geo) < 400 && !detail ? 480 : 240; // cheap shapes go in bigger squares: fewer draw calls matter more than a few spare triangles
    const cells = new Map(); for (const t of list) { const k = far ? 'far' : Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
    for (const items of cells.values()) {
      items.sort((p, q) => mix(p) - mix(q)); // a fixed, scattered order: lower presets draw the first part of each list, which thins evenly
      const im = new THREE.InstancedMesh(geo, mat, items.length); im.name = name;
      items.forEach((t, i) => im.setMatrixAt(i, M(t.x, t.y || 0, t.z, t.s * (t.sx || 1), t.s * (t.sy || 1), t.s * (t.sz || 1), 0, t.ry || 0, 0)));
      im.instanceMatrix.needsUpdate = true; if (far) im.frustumCulled = false; else im.computeBoundingSphere(); im.castShadow = shadow; scene.add(im);
      let low = null; if (lod && !far) { low = new THREE.InstancedMesh(lod, vcol, items.length); for (let i = 0; i < items.length; i++) { im.getMatrixAt(i, _m4); low.setMatrixAt(i, _m4); } low.instanceMatrix.needsUpdate = true; low.boundingSphere = im.boundingSphere; low.castShadow = shadow; low.visible = false; low.name = name + ' (far)'; scene.add(low); }
      if (!far) groups.push({ im, low, lodK, n: items.length, detail, c: im.boundingSphere.center, r: im.boundingSphere.radius });
      stat.tris += tris(geo) * items.length; stat.instances += items.length;
    }
  }

  // ---------- sky, fog, light ----------
  const sd = new THREE.Vector3(...th.sunDir).normalize();
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, depthWrite: false,
    uniforms: { top: { value: C(th.sky[0]) }, bot: { value: C(th.sky[1]) }, hor: { value: C(look.horizon) }, sunDir: { value: sd }, glowK: { value: neon ? 0 : 1 } },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 hor; uniform vec3 sunDir; uniform float glowK; varying vec3 d; void main(){ vec3 n = normalize(d); float t = smoothstep(-0.02,0.55,n.y); vec3 c = mix(bot,top,pow(t,0.75)); c = mix(hor,c,smoothstep(-0.02,0.2,n.y)); float s = max(dot(n,sunDir),0.0); c += glowK*vec3(1.0,0.8,0.5)*(pow(s,5.0)*0.22+pow(s,60.0)*0.45); gl_FragColor = vec4(c,1.0);\n#include <colorspace_fragment>\n}' });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(2700, 28, 14), skyMat));
  scene.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
  scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
  const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; for (let i = 0; i < T.N; i++) { mnx = Math.min(mnx, T.px[i]); mxx = Math.max(mxx, T.px[i]); mnz = Math.min(mnz, T.pz[i]); mxz = Math.max(mxz, T.pz[i]); }
  const cxm = (mnx + mxx) / 2, czm = (mnz + mxz) / 2, ext = Math.max(mxx - mnx, mxz - mnz) / 2 + 80;
  sun.position.set(cxm + sd.x * 700, sd.y * 700, czm + sd.z * 700); sun.target.position.set(cxm, 0, czm); scene.add(sun, sun.target);
  sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 50; sc.far = 1700; sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  if (look.fill) { const fill = new THREE.DirectionalLight(0xc2d6ff, look.fill); fill.position.set(-sd.x, 0.45, -sd.z); scene.add(fill); } // sky light from the shaded side, so walls and trees away from the sun are not grey
  // reflections for the car paint: a real sky photograph where we have one, otherwise a simple painted room
  const pm = new THREE.PMREMGenerator(renderer);
  if (A && A.env) { A.env.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pm.fromEquirectangular(A.env).texture; }
  else {
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat));
    const gd = new THREE.Mesh(new THREE.CircleGeometry(50, 24), new THREE.MeshBasicMaterial({ color: neon ? 0x1a1038 : 0xd9c08a })); gd.rotation.x = -Math.PI / 2; gd.position.y = -1; envScene.add(gd);
    if (neon) for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(6, rnd(8, 26), 1), new THREE.MeshBasicMaterial({ color: k % 2 ? 0x00f0ff : 0xff2bd6 })); const a = k / 10 * 6.28; b.position.set(Math.cos(a) * 40, 6, Math.sin(a) * 40); b.lookAt(0, 6, 0); envScene.add(b); }
    scene.environment = pm.fromScene(envScene, 0.03, 0.1, 200).texture;
  }
  pm.dispose(); scene.environmentIntensity = look.envI;

  // ---------- terrain: tiles, finer near the track, each culled on its own ----------
  const col = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
  const pal = {
    beach: (h, d, nz, sl) => { col.set(0x6da548).lerp(c2.set(0x4a823c), nz); col.lerp(c2.set(0x97b856), smooth(0.62, 0.9, nz) * 0.5); col.lerp(c2.set(0x8fb659), 1 - smooth(7, 11, d)); col.lerp(c2.set(0x4a7a48), smooth(30, 70, h) * 0.6); col.lerp(c2.set(0x9a8f76), smooth(0.3, 0.55, sl)); if (h < 1.0) col.lerp(c2.set(0xe2d1a0), smooth(1.0, -0.2, h) * smooth(13, 30, d)); },
    desert: (h, d, nz) => { col.set(0xe5a660).lerp(c2.set(0xc77b42), nz); if (d < 15) col.lerp(c2.set(0xb9713f), 0.5); col.lerp(c2.set(0xa8492f), smooth(18, 34, h) * 0.8); },
    snow: (h, d, nz, sl) => { col.set(0xffffff).lerp(c2.set(0xdbe7f5), nz); if (d < 15) col.lerp(c2.set(0xc9d8ea), 0.6); col.lerp(c2.set(0xa9bfdc), smooth(20, 48, h) * 0.7); col.lerp(c2.set(0x8fa3bd), smooth(0.35, 0.6, sl) * 0.7); },
    neon: (h, d, nz) => { col.set(0x0c0918).lerp(c2.set(0x150f2c), nz); },
  }[theme];
  // fine mottling and blade marks laid over the ground colours, so grass, sand and snow are not flat
  const groundTex = neon ? null : canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#ececec'; c.fillRect(0, 0, w, h);
    const wrap = (fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
    for (let k = 0; k < 70; k++) { const x = rnd(0, w), y = rnd(0, h), r = rnd(10, 34), dark = Math.random() < 0.55; wrap((ox, oy) => { const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, dark ? 'rgba(120,130,110,.2)' : 'rgba(255,255,245,.24)'); g.addColorStop(1, 'rgba(200,200,200,0)'); c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }); }
    for (let k = 0; k < 1500; k++) { const x = rnd(0, w), y = rnd(0, h), l = rnd(2, 5), a = rnd(-0.5, 0.5); c.strokeStyle = Math.random() < 0.5 ? 'rgba(90,105,80,.2)' : 'rgba(255,255,240,.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); c.stroke(); }
  });
  if (groundTex) { groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.anisotropy = 8; }
  const groundMat = groundTex ? lam({ vertexColors: true, map: groundTex }) : vcol;
  { const SIZE = 2400, NT = 6, TS = SIZE / NT, E = 3, tiles = new Map();
    for (let ty = 0; ty < NT; ty++) for (let tx = 0; tx < NT; tx++) {
      const ring = Math.max(Math.abs(tx - 2.5), Math.abs(ty - 2.5)), seg = ring < 1 ? 44 : ring < 2 ? 18 : 8, n = seg + 3, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), cl = new Float32Array(n * n * 3), tuv = new Float32Array(n * n * 2), idx = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const skirt = i === 0 || j === 0 || i === n - 1 || j === n - 1, gi = clamp(i - 1, 0, seg), gj = clamp(j - 1, 0, seg), x = -SIZE / 2 + tx * TS + (gi / seg) * TS, z = -SIZE / 2 + ty * TS + (gj / seg) * TS, h = T.height(x, z), k = (j * n + i) * 3;
        const nx = T.height(x - E, z) - T.height(x + E, z), nz = T.height(x, z - E) - T.height(x, z + E), l = Math.hypot(nx, 2 * E, nz);
        pos[k] = x; pos[k + 1] = skirt ? h - 14 : h; pos[k + 2] = z; nor[k] = nx / l; nor[k + 1] = 2 * E / l; nor[k + 2] = nz / l;
        pal(h, T.dist(x, z) - hw, fbm(x * 0.03 + 5, z * 0.03 + 9), 1 - (2 * E) / l); cl[k] = col.r; cl[k + 1] = col.g; cl[k + 2] = col.b; tuv[(j * n + i) * 2] = x / 24; tuv[(j * n + i) * 2 + 1] = z / 24;
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.BufferAttribute(tuv, 2)); g.setIndex(idx);
      stat.tris += idx.length / 3; const key = ring < 1 ? 'in' + tx + ty : ring < 2 ? 'mid' + (tx < 3 ? 0 : 1) + (ty < 3 ? 0 : 1) : 'out'; if (!tiles.has(key)) tiles.set(key, []); tiles.get(key).push(g);
    }
    for (const [key, list] of tiles) { const m = new THREE.Mesh(list.length > 1 ? BGU.mergeGeometries(list, false) : list[0], groundMat); m.receiveShadow = key !== 'out'; scene.add(m); } }

  let water = null;
  if (theme === 'beach') {
    water = new THREE.Mesh(new THREE.CircleGeometry(2700, 48), new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, fogC: { value: C(th.fog[0]) }, sunDir: { value: sd } },
      vertexShader: 'varying vec3 wp; void main(){ wp = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.0); }',
      fragmentShader: 'uniform float time; uniform vec3 fogC; uniform vec3 sunDir; varying vec3 wp; void main(){ float w = sin(wp.x*0.06+time*0.9)*sin(wp.z*0.07-time*0.7); float s = sin(wp.x*0.23-time*1.5+wp.z*0.13)*sin(wp.z*0.27+time*1.1); vec3 c = mix(vec3(0.03,0.36,0.58), vec3(0.12,0.62,0.74), 0.5+0.5*w); c += 0.2*smoothstep(0.8,1.0,s); vec3 v = normalize(cameraPosition-wp); vec3 r = reflect(-v, normalize(vec3(w*0.08,1.0,s*0.08))); c += vec3(1.0,0.9,0.7)*pow(max(dot(r,sunDir),0.0),60.0)*0.7; float f = smoothstep(380.0,1700.0,length(wp-cameraPosition)); gl_FragColor = vec4(mix(c,fogC,f),1.0);\n#include <colorspace_fragment>\n}' }));
    water.rotation.x = -Math.PI / 2; water.position.y = -2.2; scene.add(water);
  }
  if (neon) { const grid = new THREE.GridHelper(2400, 120, 0xff2bd6, 0x4a1a80); grid.position.y = 0.04; scene.add(grid); }

  // ---------- road ----------
  const roadTex = canvasTex(512, 1024, (c, w, h) => {
    c.fillStyle = th.road; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.08)'; const s = Math.random() < 0.85 ? 1.5 : 3; c.fillRect(Math.random() * w, Math.random() * h, s, s); }
    for (let k = 0; k < 9; k++) { c.fillStyle = 'rgba(0,0,0,.05)'; c.beginPath(); c.ellipse(rnd(60, w - 60), rnd(0, h), rnd(30, 90), rnd(40, 160), 0, 0, 7); c.fill(); }          // old repairs
    for (const x of [150, 362]) { const g = c.createLinearGradient(x - 46, 0, x + 46, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 46, 0, 92, h); } // rubbered-in racing lines
    c.fillStyle = th.line; c.fillRect(20, 0, 9, h); c.fillRect(w - 29, 0, 9, h); c.globalAlpha = 0.9; c.fillRect(w / 2 - 4, 70, 8, 380);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const roadMat = neon ? new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.28, metalness: 0.35 }) : lam({ map: roadTex });
  const road = new THREE.Mesh(ribbon(T, -hw, hw, 0.09, null, 36), roadMat); road.receiveShadow = true; scene.add(road);
  const kA = C(th.kerb[0]), kB = C(th.kerb[1]), kc = (i) => (Math.floor(i / 2) % 2 ? kA : kB), kerbMat = neon ? new THREE.MeshBasicMaterial({ vertexColors: true }) : vcol;
  { const ks = [-1, 1].map((s) => ribbon(T, s > 0 ? hw : -hw - 2, s > 0 ? hw + 2 : -hw, 0.14, kc)); const k = new THREE.Mesh(BGU.mergeGeometries(ks, false), kerbMat); k.receiveShadow = true; scene.add(k); }
  const stoneCap = theme === 'beach' ? stoneTexture(true) : null, stonePlain = theme === 'beach' ? stoneTexture(false) : null;
  if (stoneCap) { stoneCap.wrapS = THREE.RepeatWrapping; stonePlain.wrapS = stonePlain.wrapT = THREE.RepeatWrapping; stoneCap.anisotropy = stonePlain.anisotropy = 8; }
  if (theme === 'beach') {
    // limestone walls with pillars and flower planters instead of plastic barriers
    const wallMat = lam({ map: stoneCap }), wo = T.wall + 1.2, w = new THREE.Mesh(BGU.mergeGeometries([stoneWall(T, wo, 1.75, 1.1), stoneWall(T, -wo, 1.75, 1.1)], false), wallMat); w.castShadow = true; w.receiveShadow = true; scene.add(w);
    const pg = new THREE.BoxGeometry(1.9, 2.6, 1.9); pg.translate(0, 1.3, 0); const pl = [], fl = [];
    for (let i = 0; i < T.N; i += 8) for (const s of [-1, 1]) { const o = s * (wo + 0.55), x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o, ry = Math.atan2(T.tx[i], T.tz[i]); pl.push({ x, z, y: 0, s: 1, ry }); if ((i / 8 + (s > 0 ? 1 : 0)) % 2 === 0) fl.push({ x, z, y: 2.55, s: rnd(3.6, 4.4), ry: rnd(0, 6.28) }); }
    place(pg, wallMat, pl);
    const fm = TX.Flowers && lam({ map: TX.Flowers, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
    if (fm && MD.Flower_2_Clump) place(treeGeo(MD.Flower_2_Clump), fm, fl, { shadow: false, detail: true, name: 'planter' });
  } else {
    const bA = C(th.barrier[0]), bB = C(th.barrier[1]), barMat = neon ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) : lam({ vertexColors: true, side: THREE.DoubleSide });
    const b = new THREE.Mesh(BGU.mergeGeometries([-1, 1].map((s) => wallRibbon(T, s * (T.wall + 1.2), neon ? 1.1 : 1.5, s > 0 ? bA : bB, s > 0 ? bB : bA)), false), barMat); b.castShadow = !neon; scene.add(b);
  }

  // ---------- start line, gantry, grandstands, boost pads ----------
  const h0 = Math.atan2(T.tx[0], T.tz[0]);
  const checker = canvasTex(256, 32, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 4), new THREE.MeshBasicMaterial({ map: checker })); line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, h0, 0); line.position.set(T.px[0], 0.15, T.pz[0]); scene.add(line);
  const gantry = new THREE.Group(); gantry.position.set(T.px[0], 0, T.pz[0]); gantry.rotation.y = h0;
  const pmat = lam({ color: neon ? 0x2a2050 : 0x2c2c33 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 14, 1.4), pmat); p.position.set(s * (hw + 4), 7, 0); p.castShadow = true; gantry.add(p); }
  const bannerTex = canvasTex(1024, 128, (c, w, h) => { c.fillStyle = '#14110f'; c.fillRect(0, 0, w, h); for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) { if ((x + y) % 2) { c.fillStyle = '#fff'; c.fillRect(x * 20, y * 32, 20, 32); c.fillRect(w - 160 + x * 20, y * 32, 20, 32); } } c.fillStyle = '#ffc62b'; c.font = '900 84px "Bowlby One","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TURBO CLASH', w / 2, h / 2 + 4); });
  const bmat = new THREE.MeshBasicMaterial({ map: bannerTex }), banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 10, 3.6, 1), [pmat, pmat, pmat, pmat, bmat, bmat]); banner.position.y = 13.4; banner.castShadow = true; gantry.add(banner);
  for (let k = -2; k <= 2; k++) { const l = glow(0xff3322, 3.2, 0.9); l.position.set(k * 3.2, 11.1, -0.8); gantry.add(l); }
  scene.add(gantry);
  // Kenney racing-kit pieces around the start: grandstands on one side, a paddock on the other, flags and light masts
  const kitPal = (accent) => (name) => ({ grey: 0xf1efe9, _defaultMat: 0xd9d6cf, red: accent, road: 0x4a4a52, glass: 0x9fc0dd, pylon: 0xffc62b, bark: 0x8a6a4a }[name] ?? null);
  const atStart = (k, side, off) => { const i = ((k % T.N) + T.N) % T.N, o = side * off, x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o; return { x, z, y: T.height(x, z), i, ok: T.dist(x, z) > Math.abs(off) - 3 }; };
  if (!neon) {
    const facing = (i, side) => Math.atan2(T.tx[i], T.tz[i]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (MD.grandStandAwning) { const g = bakeGeo(MD.grandStandAwning, kitPal(th.kerb[0])), L = []; for (const k of [-16, -10, -4, 2]) { const p = atStart(k, 1, T.wall + 13); if (p.ok) L.push({ ...p, s: 15, ry: facing(p.i, 1) + Math.PI }); } place(g, vcol, L); }
    if (MD.tent) { const g = bakeGeo(MD.tent, kitPal(th.kerb[0])), L = []; for (const k of [-14, -8, -2]) { const p = atStart(k, -1, T.wall + 12); if (p.ok) L.push({ ...p, s: 9, ry: facing(p.i, -1) }); } place(g, vcol, L); }
    if (MD.lightPostLarge) { const g = bakeGeo(MD.lightPostLarge, kitPal(0xd9432e)), L = []; for (const k of [-20, -6, 8]) for (const s of [-1, 1]) { const p = atStart(k, s, T.wall + 5); if (p.ok) L.push({ ...p, s: 22, ry: facing(p.i, s) }); } place(g, vcol, L); }
    if (MD.bannerTowerRed) { const g = bakeGeo(MD.bannerTowerRed, kitPal(th.kerb[0])), L = []; for (const k of [10, -24]) for (const s of [-1, 1]) { const p = atStart(k, s, T.wall + 6); if (p.ok) L.push({ ...p, s: 13, ry: facing(p.i, s) }); } place(g, vcol, L); }
    if (MD.flagCheckers) { const L = []; for (let k = -18; k <= 6; k += 4) for (const s of [-1, 1]) { const p = atStart(k, s, T.wall + 3.2); if (p.ok) L.push({ ...p, y: 0, s: 9, ry: facing(p.i, s) + Math.PI / 2 }); }
      place(bakeGeo(MD.flagCheckers, (n) => (n === 'checkers' ? null : kitPal(0)(n))), vcol, L, { shadow: false }); const fg = partGeo(MD.flagCheckers, 'checkers'); if (fg) place(fg, new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } }), side: THREE.DoubleSide }), L, { shadow: false }); }
  }
  const padTex = canvasTex(256, 512, (c, w, h) => { c.scale(4, 4); c.fillStyle = neon ? '#00f0ff' : '#ffc62b'; c.fillRect(0, 0, 64, 128); c.strokeStyle = '#14110f'; c.lineWidth = 12; for (let y = 104; y > -10; y -= 38) { c.beginPath(); c.moveTo(8, y + 16); c.lineTo(32, y - 8); c.lineTo(56, y + 16); c.stroke(); } }); padTex.anisotropy = 8;
  const pads = T.def.pads.map((f, k) => {
    const i = Math.floor(f * T.N) % T.N, lat = (k % 2 ? 1 : -1) * hw * 0.38, x = T.px[i] + T.tz[i] * lat, z = T.pz[i] - T.tx[i] * lat;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 11), new THREE.MeshBasicMaterial({ map: padTex })); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.atan2(T.tx[i], T.tz[i]) + Math.PI, 0); m.position.set(x, 0.17, z); scene.add(m);
    const gl = glow(neon ? 0x00f0ff : 0xffc62b, 16, 0.5); gl.position.set(x, 1.2, z); scene.add(gl);
    return { x, z };
  });
  // trackside signs: all six in one mesh, their artwork on one shared texture
  { const ads = ['COUCH CLASH', 'NITRO', 'NO BRAKES', 'SEND IT', 'GG', 'TILT!'], cols = [['#d9432e', '#f6f1e4'], ['#f2c14e', '#1b1a18'], ['#2f8f7a', '#f6f1e4'], ['#2b62c9', '#f6f1e4'], ['#1b1a18', '#f2c14e'], ['#f6f1e4', '#d9432e']];
    const tex = canvasTex(512, 1024, (c, w) => { c.fillStyle = '#2a2a30'; c.fillRect(0, 0, w, 1024); ads.forEach((t, k) => { const y = k * 160; c.fillStyle = cols[k][0]; c.fillRect(0, y, w, 152); c.fillStyle = cols[k][1]; c.font = '900 88px "Bowlby One","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, w / 2, y + 80, w - 40); c.lineWidth = 9; c.strokeStyle = cols[k][1]; c.strokeRect(5, y + 5, w - 10, 142); }); });
    const geos = [];
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(((k + 0.5) / 6) * T.N), s = k % 2 ? 1 : -1, o = s * (T.wall + 9), x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o, y = T.height(x, z); if (y < 0.5 || T.dist(x, z) < T.wall + 6) continue;
      const m = M(x, y, z, 1, 1, 1, 0, Math.atan2(-s * T.tz[i], s * T.tx[i]), 0), dark = (g) => { const uv = g.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, 0.5, 0.01); return g; };
      const face = new THREE.BoxGeometry(16, 5, 0.5), uv = face.attributes.uv; for (let q = 0; q < uv.count; q++) { const front = q >= 16 && q < 20; uv.setXY(q, front ? uv.getX(q) : 0.5, front ? 1 - (k * 160 + (1 - uv.getY(q)) * 152) / 1024 : 0.01); }
      geos.push(face.translate(0, 7, 0).applyMatrix4(m)); for (const sx of [-6, 6]) geos.push(dark(new THREE.BoxGeometry(0.6, 5, 0.6)).translate(sx, 2.5, 0).applyMatrix4(m));
    }
    if (geos.length) { const bb = new THREE.Mesh(BGU.mergeGeometries(geos, false), new THREE.MeshBasicMaterial({ map: tex })); bb.castShadow = true; scene.add(bb); } }

  // ---------- scenery ----------
  const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s), cyl = (a, b, h, s = 7) => new THREE.CylinderGeometry(a, b, h, s);
  const near = hw + 15;
  const put = (o) => { o.y = T.height(o.x, o.z) - 0.25; return o; };
  const scatter = (n, minD, rMin, rMax, mk, ok) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 30) { const a = Math.random() * 6.28, r = Math.sqrt(rnd(rMin * rMin, rMax * rMax)), x = Math.cos(a) * r, z = Math.sin(a) * r; if (T.dist(x, z) < minD) continue; const o = put({ x, z, ry: Math.random() * 6.28, ...mk() }); if (ok && !ok(o)) continue; out.push(o); } return out; };
  const along = (n, minD, maxD, mk, ok) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 30) { const i = Math.floor(((tries + Math.random()) / n) * T.N) % T.N, // spread evenly round the lap, so no stretch is left bare
      off = rnd(minD, maxD) * (Math.random() < 0.5 ? -1 : 1), x = T.px[i] + T.tz[i] * off, z = T.pz[i] - T.tx[i] * off; if (T.dist(x, z) < minD - 1) continue; const o = put({ x, z, ry: Math.random() * 6.28, ...mk() }); if (ok && !ok(o)) continue; out.push(o); } return out; };
  const add = (geo, list, mat = vcol, opts) => place(geo, mat, list, opts);
  // older Kenney props: one mesh per material, colours from the model
  const useProps = (names, list, k, opts = {}) => {
    if (!names.every((nm) => MD[nm])) return false;
    names.forEach((nm, ni) => { const mine = list.filter((_, i) => i % names.length === ni).map((o) => ({ ...o, s: o.s * k })); if (!mine.length) return; place(bakeGeo(MD[nm], (name, c) => (opts.all !== undefined ? opts.all : opts.recolor && opts.recolor[name] !== undefined ? opts.recolor[name] : c.getHex())), vcol, mine, opts); });
    return true;
  };
  const rockMat = (tex, tint = 0xffffff) => lam({ map: tex, color: tint });
  const rock = merge([{ g: new THREE.DodecahedronGeometry(1, 0), c: theme === 'snow' ? 0xcbd9ea : theme === 'desert' ? 0x9c5a3c : neon ? 0x2a2050 : 0x8d8578, m: M(0, 0.45, 0, 1, 0.75, 1.1) }, { g: new THREE.DodecahedronGeometry(0.6, 0), c: theme === 'snow' ? 0xe6eef8 : theme === 'desert' ? 0xb06a48 : neon ? 0x3a2c6a : 0xa39b8c, m: M(0.8, 0.3, 0.4) }]);
  const rocks = (names, list, tex, tint, k = 2.6) => { if (!tex || !names.every((n) => MD[n])) { add(rock, list); return; } names.forEach((n, ni) => place(treeGeo(MD[n]), rockMat(tex, tint), list.filter((_, i) => i % names.length === ni).map((o) => ({ ...o, s: o.s * k })), { detail: true })); };
  const hazeMat = lam({ vertexColors: true, fog: false });
  const mountains = (n, cols0, snowLine, rMin, rMax, sMin, sMax) => { const cols = cols0.map((c, k) => C(c).lerp(C(th.fog[0]), k === 2 ? 0.12 : 0.3).getHex()); for (const seed of [1.7, 4.2, 8.9]) { const L = []; for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + seed + rnd(-0.12, 0.12), r = rnd(rMin, rMax), s = rnd(sMin, sMax); L.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: -6, s, sy: rnd(0.62, 1.0), ry: rnd(0, 6.28) }); } place(mountainGeo(seed, snowLine, cols), hazeMat, L, { shadow: false, far: true }); } };

  if (theme === 'beach') {
    const dry = (o) => o.y > -0.7, lake = T.lake;
    const leaf = (tex, tint = 0xffffff) => lam({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, color: tint });
    const grove = (n, per, minD, maxD, spread, mk, ok) => { const out = []; for (const c of along(n, minD, maxD, () => ({}))) for (let k = 0; k < per; k++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * spread, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (T.dist(x, z) < T.wall + 5) continue; const o = put({ x, z, ry: rnd(0, 6.28), ...mk() }); if (!ok || ok(o)) out.push(o); } return out; };
    const shuffle = (L) => { for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } return L; };
    // broad-leaved trees: big ones close to the walls so their shadows fall across the road, groves further back
    if (MD.NormalTree_5 && TX.NormalTree_Leaves) { const g = treeGeo(MD.NormalTree_5, 0.006, 0.006, 0.62), k = 1 / hOf(g), sz = (a, b) => () => ({ s: rnd(a, b) * k });
      place(g, leaf(TX.NormalTree_Leaves), shuffle([...along(32, T.wall + 7, T.wall + 24, sz(15, 22), dry), ...grove(6, 5, T.wall + 30, T.wall + 90, 30, sz(13, 19), dry), ...scatter(8, near + 30, 0, 430, sz(14, 20), dry)]), { name: 'broadleaf', lod: lodTree(g, 'round', 0x4a7a32, 0x5e4636) }); }
    // pines in groves on the slopes
    if (MD.PineTree_5 && TX.PineTree_Leaves) { const g = treeGeo(MD.PineTree_5), k = 1 / hOf(g);
      place(g, leaf(TX.PineTree_Leaves), shuffle([...grove(10, 8, T.wall + 16, T.wall + 110, 34, () => ({ s: rnd(17, 27) * k }), dry), ...along(10, T.wall + 8, T.wall + 26, () => ({ s: rnd(16, 23) * k }), dry)]), { name: 'pine', lod: lodTree(g, 'cone', 0x356a44, 0x4a3524) }); }
    // woods on the far slopes: stand-ins only, a few dozen triangles each
    { const far = (o) => o.y > 2 && T.dist(o.x, o.z) > T.wall + 60;
      place(shadeY(merge([{ g: new THREE.IcosahedronGeometry(1, 1), c: 0x4a7a32, m: M(0, 0.66, 0, 0.34, 0.36, 0.34) }, { g: new THREE.CylinderGeometry(0.03, 0.045, 0.5, 5), c: 0x5e4636, m: M(0, 0.25, 0) }]), 0.72, 1.12), vcol, scatter(130, near + 50, 120, 800, () => ({ s: rnd(13, 20) }), far), { name: 'far broadleaf', shadow: false, far: true });
      place(shadeY(merge([{ g: new THREE.ConeGeometry(0.2, 0.86, 7), c: 0x356a44, m: M(0, 0.57, 0) }, { g: new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5), c: 0x4a3524, m: M(0, 0.15, 0) }]), 0.72, 1.12), vcol, scatter(160, near + 50, 120, 800, () => ({ s: rnd(16, 27) }), far), { name: 'far pine', shadow: false, far: true }); }
    // cypresses along the walls and around the houses
    place(cypressGeo(), vcol, shuffle([...along(84, T.wall + 4.6, T.wall + 15, () => ({ s: rnd(13, 21), sx: rnd(0.9, 1.25), sz: rnd(0.9, 1.25) }), dry), ...scatter(34, near + 14, 0, 420, () => ({ s: rnd(14, 22) }), dry)]), { name: 'cypress' });
    if (MD.PalmTree_1 && TX.PalmTree_Leaves && lake) place(treeGeo(MD.PalmTree_1, 0.256, 0.006), leaf(TX.PalmTree_Leaves), scatter(9, near, 0, 300, () => ({ s: rnd(1.5, 2.1) }), (o) => { const d = Math.hypot(o.x - lake.x, o.z - lake.z); return o.y > 0.3 && o.y < 2.4 && d < lake.r + 30; }), { name: 'palm' });
    if (TX.Bush_Leaves) {
      const bl = leaf(TX.Bush_Leaves), fm = TX.Flowers && leaf(TX.Flowers);
      if (MD.Bush) place(treeGeo(MD.Bush), bl, shuffle([...along(64, T.wall + 3.3, T.wall + 9, () => ({ s: rnd(2.4, 4.2) }), dry), ...grove(8, 5, T.wall + 10, T.wall + 60, 14, () => ({ s: rnd(2.6, 4.6) }), dry)]), { detail: true, name: 'bush' });
      if (MD.Bush_Flowers && fm) { const L = shuffle(along(44, T.wall + 3.3, T.wall + 10, () => ({ s: rnd(2.4, 3.8) }), dry)); place(partGeo(MD.Bush_Flowers, 'Bush_Leaves'), bl, L, { detail: true, name: 'flowerbush' }); place(partGeo(MD.Bush_Flowers, 'Flowers'), fm, L, { shadow: false, detail: true, name: 'flowers' }); }
      if (MD.Plant_Flowers && fm) place(treeGeo(MD.Plant_Flowers), fm, shuffle(along(40, T.wall + 3.2, T.wall + 12, () => ({ s: rnd(1.6, 2.6) }), dry)), { shadow: false, detail: true, name: 'flowerplant' });
    }
    rocks(['Rock_1', 'Rock_5'], [...scatter(26, near - 4, 0, 440, () => ({ s: rnd(1, 3.4) })), ...along(16, T.wall + 3, T.wall + 20, () => ({ s: rnd(0.7, 1.6) }))], TX.Rocks, 0xf1e9da);
    // village: plaster walls and terracotta roofs. Rows of houses beside three stretches of road, more around the lake.
    const plaster = [0xf4e4c0, 0xf0d9a8, 0xf6ead2, 0xecd3a0], roofs = [0xc9623b, 0xb9532f, 0xd27445];
    const townPal = (v) => (name) => (/Roof/.test(name) || name === 'Brown' ? roofs[v % 3] : /Plaster|Beige|LightYellow|GreyBlue/.test(name) ? plaster[v % 4] : /LightBlue/.test(name) ? plaster[(v + 1) % 4] : name === 'Windows' || name === 'DarkGrey' ? 0x2c3743 : name === 'White' ? 0xfbf5e6 : name === 'Wood' ? 0x7a5236 : name === 'Wood_Side' ? 0x8f6744 : name === 'Wood_Light' ? 0x9c7450 : name === 'Stone_Light' || name === 'Grey' ? 0xdccfb4 : name === 'Stone_Dark' ? 0xbcab8e : name === 'Stone' ? 0xaa9b80 : name === 'Bell' ? 0xd9a441 : 0xb39a6a);
    const SIZE = { House_1: 4.6, House_2: 4.6, Inn: 4.2, Townhouse: 3.9, Bell_Tower: 5.4, Well: 3.6 }, lots = {};
    const lot = (name, x, z, ry) => { if (!MD[name] || T.dist(x, z) < T.wall + 13 || T.height(x, z) < 1) return false; (lots[name] = lots[name] || []).push({ x, z, y: T.height(x, z) - 0.3, s: SIZE[name], ry }); return true; };
    const row = ['House_1', 'Townhouse', 'House_2', 'Townhouse', 'House_1', 'Inn', 'Townhouse'];
    [[0.2, 1], [0.55, -1], [0.83, 1], [0.38, -1], [0.7, 1]].forEach(([f, side], ci) => { for (let k = 0; k < 4; k++) { const i = (Math.floor(f * T.N) + k * 9) % T.N, o = side * (T.wall + 19 + (k % 2) * 5), x = T.px[i] + T.tz[i] * o, z = T.pz[i] - T.tx[i] * o; lot(k === 2 && ci === 0 ? 'Bell_Tower' : row[(k + ci * 2) % row.length], x, z, Math.atan2(T.tx[i], T.tz[i]) + (side > 0 ? -Math.PI / 2 : Math.PI / 2)); } });
    if (lake) for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28 + 0.4, r = lake.r + 24 + (k % 3) * 7, x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r; lot(k === 3 ? 'Bell_Tower' : k === 5 ? 'Well' : row[k % row.length], x, z, Math.atan2(lake.x - x, lake.z - z)); }
    Object.entries(lots).forEach(([name, L], v) => { const g = bakeGeo(MD[name], townPal(v)); place(g, vcol, L, { name, lod: /House|Town|Inn|Black/.test(name) ? lodHouse(g, plaster[v % 4], roofs[v % 3]) : null, lodK: 2.2 }); });
    // the old stone bridge across the lake, side-on to the nearest stretch of road
    if (lake) {
      let bi = 0, bd = 1e9; for (let i = 0; i < T.N; i += 2) { const d = (T.px[i] - lake.x) ** 2 + (T.pz[i] - lake.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const len = (lake.r + 16) * 2, wid = 8, deck = 4.4, base = -8, n = 4, pitch = len / (n + 0.45), yTop = (x) => deck * (0.8 + 0.2 * (1 - (2 * x / len) ** 2));
      const sh = new THREE.Shape(); sh.moveTo(-len / 2, base); sh.lineTo(len / 2, base); for (let k = 0; k <= 24; k++) { const x = len / 2 - (len * k) / 24; sh.lineTo(x, yTop(x)); } sh.closePath();
      for (let k = 0; k < n; k++) { const cx = (k - (n - 1) / 2) * pitch, r = pitch * 0.37, sy = deck - r - 1.5, h = new THREE.Path(); h.moveTo(cx - r, base + 0.01); h.lineTo(cx - r, sy); h.absarc(cx, sy, r, Math.PI, 0, true); h.lineTo(cx + r, base + 0.01); h.closePath(); sh.holes.push(h); }
      const bg = new THREE.ExtrudeGeometry(sh, { depth: wid, bevelEnabled: false, curveSegments: 16 }); bg.translate(0, 0, -wid / 2);
      const para = new THREE.Shape(); for (let k = 0; k <= 24; k++) { const x = -len / 2 + (len * k) / 24; k ? para.lineTo(x, yTop(x)) : para.moveTo(x, yTop(x)); } for (let k = 24; k >= 0; k--) { const x = -len / 2 + (len * k) / 24; para.lineTo(x, yTop(x) + 1.3); } para.closePath();
      const parts = [bg]; for (const s of [-1, 1]) { const g = new THREE.ExtrudeGeometry(para, { depth: 0.8, bevelEnabled: false }); g.translate(0, 0, s * (wid / 2 - 0.4) - 0.4); parts.push(g); }
      const all = BGU.mergeGeometries(parts, false), uv = all.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 9, uv.getY(i) / 4.4);
      const br = new THREE.Mesh(all, lam({ map: stonePlain })); br.position.set(lake.x, 0, lake.z); br.rotation.y = -Math.atan2(T.tz[bi], T.tx[bi]); br.castShadow = true; br.receiveShadow = true; scene.add(br); stat.tris += tris(all);
    }
    mountains(9, [0x3a6e42, 0x6b6357, 0xffffff], 0.66, 1150, 1750, 300, 540);
  }
  if (theme === 'desert') {
    const mesa = merge([{ g: cyl(0.78, 1, 1, 9), c: 0xb5553a, m: M(0, 0.5, 0) }, { g: cyl(0.74, 0.8, 0.12, 9), c: 0xd98a5c, m: M(0, 0.62, 0) }, { g: cyl(0.6, 0.72, 0.5, 9), c: 0xc96a45, m: M(0.05, 1.22, 0) }, { g: cyl(0.63, 0.63, 0.07, 9), c: 0xe6aa78, m: M(0.05, 1.0, 0) }, { g: cyl(0.3, 0.42, 0.35, 7), c: 0xb5553a, m: M(-0.1, 1.6, 0.1) }]);
    add(mesa, [...scatter(30, near + 26, 0, 560, () => ({ s: rnd(12, 28), sy: rnd(0.9, 2.3) })), ...along(22, near + 18, near + 70, () => ({ s: rnd(5, 11), sy: rnd(1, 2.6) }))]);
    place(mesa, vcol, scatter(26, 0, 750, 1500, () => ({ s: rnd(60, 130), sy: rnd(0.8, 1.7) })), { shadow: false, far: true });
    const cactus = merge([{ g: cyl(0.5, 0.58, 6, 8), c: 0x3f8f4f, m: M(0, 3, 0) }, { g: new THREE.SphereGeometry(0.5, 8, 5), c: 0x3f8f4f, m: M(0, 6, 0) }, { g: cyl(0.32, 0.32, 2.2, 6), c: 0x4aa35c, m: M(1.2, 3.7, 0) }, { g: cyl(0.3, 0.3, 1.2, 6), c: 0x4aa35c, m: M(0.7, 2.7, 0, 1, 1, 1, 0, 0, 1.57) },
      { g: cyl(0.3, 0.3, 1.8, 6), c: 0x4aa35c, m: M(-1.1, 3.0, 0) }, { g: cyl(0.28, 0.28, 1.1, 6), c: 0x4aa35c, m: M(-0.65, 2.2, 0, 1, 1, 1, 0, 0, 1.57) }, { g: new THREE.SphereGeometry(0.2, 5, 4), c: 0xff7ac8, m: M(0, 6.5, 0) }]);
    { const L = [...scatter(70, near - 3, 0, 520, () => ({ s: rnd(0.8, 1.8) })), ...along(110, near - 4, near + 32, () => ({ s: rnd(0.8, 1.9) }))]; if (!useProps(['cactus_tall', 'cactus_short'], L, 9, { all: 0x4f9c56 })) add(cactus, L); }
    rocks(['Rock_1', 'Rock_2', 'Rock_5'], [...scatter(90, near - 5, 0, 600, () => ({ s: rnd(0.8, 4.5) })), ...along(60, near - 6, near + 24, () => ({ s: rnd(0.7, 2.4) }))], TX.Rocks_Desert, 0xffd9b8);
    for (const [n, pu] of [['PalmTree_1', 0.256], ['PalmTree_2', 0.256]]) if (MD[n] && TX.PalmTree_Leaves) place(treeGeo(MD[n], pu, 0.006), lam({ map: TX.PalmTree_Leaves, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, color: 0xe6d9a0 }), along(16, near, near + 26, () => ({ s: rnd(1.5, 2.3) })));
    useProps(['statue_obelisk'], along(9, near + 4, near + 22, () => ({ s: rnd(0.9, 1.4) })), 16, { recolor: { grass: 0xe0a066, dirt: 0xb5653a, stone: 0xc98a5a, stoneDark: 0x9c5a3c, _defaultMat: 0xb5653a } });
    const shrub = merge([{ g: new THREE.IcosahedronGeometry(1, 0), c: 0x9aa85a, m: M(0, 0.4, 0, 1.2, 0.6, 1.2) }, { g: new THREE.IcosahedronGeometry(0.6, 0), c: 0xb7c070, m: M(0.8, 0.3, 0.2) }]);
    add(shrub, along(120, near - 6, near + 40, () => ({ s: rnd(0.6, 1.6) })), vcol, { detail: true });
  }
  if (theme === 'snow') {
    const pine = merge([{ g: cyl(0.4, 0.5, 2.2, 6), c: 0x5a3a22, m: M(0, 1.1, 0) }, { g: cone(3.1, 4.2, 8), c: 0x1b5f41, m: M(0, 3.9, 0) }, { g: cone(3.15, 0.9, 8), c: 0xf4f9ff, m: M(0, 2.5, 0, 1, -1, 1) }, { g: cone(2.4, 3.8, 8), c: 0x237550, m: M(0, 6.1, 0) }, { g: cone(2.45, 0.7, 8), c: 0xf4f9ff, m: M(0, 4.8, 0, 1, -1, 1) }, { g: cone(1.6, 3.2, 8), c: 0x2c8a5e, m: M(0, 8.3, 0) }, { g: cone(1.0, 1.6, 8), c: 0xffffff, m: M(0, 9.3, 0) }]);
    { const L = [...scatter(110, near, 0, 620, () => ({ s: rnd(0.9, 2.1) })), ...along(170, near - 2, near + 44, () => ({ s: rnd(0.9, 2.2) }))];
      if (MD.PineTree_1 && MD.PineTree_5 && TX.PineTree_Leaves) { const pm2 = lam({ map: TX.PineTree_Leaves, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, color: 0xcfe6dc }); [MD.PineTree_1, MD.PineTree_5].forEach((m, k) => { const g = treeGeo(m); place(g, pm2, L.filter((_, i) => i % 2 === k).map((o) => ({ ...o, s: o.s * 2.6 })), { name: 'pine', lod: lodTree(g, 'cone', 0x2f6238, 0x3a2a1c) }); }); } else add(pine, L); }
    rocks(['Rock_1', 'Rock_2', 'Rock_5'], [...scatter(60, near - 5, 0, 560, () => ({ s: rnd(1, 4.5) })), ...along(44, near - 6, near + 22, () => ({ s: rnd(0.8, 2.2) }))], TX.Rocks, 0xe9f1fb);
    mountains(8, [0x9fb4cf, 0xb9c8dc, 0xffffff], 0.3, 900, 1650, 260, 480);
    const snowman = merge([{ g: new THREE.SphereGeometry(0.9, 10, 8), c: 0xffffff, m: M(0, 0.8, 0) }, { g: new THREE.SphereGeometry(0.65, 10, 8), c: 0xffffff, m: M(0, 2.0, 0) }, { g: new THREE.SphereGeometry(0.45, 10, 8), c: 0xffffff, m: M(0, 2.95, 0) }, { g: cone(0.1, 0.5, 5), c: 0xff9a2b, m: M(0, 2.95, 0.55, 1, 1, 1, 1.57) }, { g: cyl(0.35, 0.35, 0.4, 8), c: 0x14110f, m: M(0, 3.5, 0) }]);
    add(snowman, along(14, near - 4, near + 10, () => ({ s: rnd(1.1, 1.6) })));
    const crystal = merge([{ g: new THREE.OctahedronGeometry(1, 0), c: 0x9fe8ff, m: M(0, 1.6, 0, 0.7, 1.8, 0.7) }, { g: new THREE.OctahedronGeometry(0.6, 0), c: 0xc8f4ff, m: M(0.8, 0.9, 0.3, 0.6, 1.4, 0.6, 0, 0, 0.3) }]);
    add(crystal, along(50, near - 6, near + 30, () => ({ s: rnd(0.8, 2.4) })), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85, emissive: 0x2f6f9f }), { detail: true });
  }
  // every track: cones in the run-off
  { const cl = []; for (let i = 0; i < T.N; i += 7) { const s = Math.floor(i / 7) % 2 ? 1 : -1, o = s * (hw + 4.6); cl.push({ x: T.px[i] + T.tz[i] * o, z: T.pz[i] - T.tx[i] * o, y: 0.05, s: 1, ry: 0 }); } useProps(['cone'], cl, 2.4, { shadow: false, detail: true, recolor: { _defaultMat: 0xff7a1a, colormap: 0xff7a1a } }); }
  let lamps = null;
  if (neon) {
    const win = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#0d0a1c'; c.fillRect(0, 0, w, h); const cols = ['#00f0ff', '#ff2bd6', '#ffd23a', '#7a5cff']; for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) if (Math.random() < 0.45) { c.fillStyle = cols[Math.floor(Math.random() * 4)]; c.globalAlpha = rnd(0.5, 1); c.fillRect(x, y, 6, 6); } });
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0); const bm = new THREE.MeshBasicMaterial({ map: win });
    place(box, bm, [...scatter(110, near + 22, 0, 640, () => ({ s: rnd(14, 30), sy: rnd(1.5, 6) })), ...along(100, near + 14, near + 64, () => ({ s: rnd(10, 20), sy: rnd(1.2, 5) }))], { shadow: false });
    place(box, bm, scatter(70, 0, 720, 1400, () => ({ s: rnd(40, 90), sy: rnd(2, 7) })), { shadow: false, far: true });
    const arch = new THREE.TorusGeometry(hw + 9, 0.8, 8, 32, Math.PI);
    for (let k = 1; k < 10; k++) { const i = Math.floor((k / 10) * T.N), cc = k % 2 ? 0x00f0ff : 0xff2bd6, a = new THREE.Mesh(arch, new THREE.MeshBasicMaterial({ color: cc })); a.position.set(T.px[i], 0, T.pz[i]); a.rotation.y = Math.atan2(T.tx[i], T.tz[i]); scene.add(a);
      for (const s of [-1, 1]) { const g2 = glow(cc, 26, 0.55); g2.position.set(T.px[i] + T.tz[i] * s * (hw + 9), 2, T.pz[i] - T.tx[i] * s * (hw + 9)); scene.add(g2); } }
    const sunTex = canvasTex(256, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe14a'); g.addColorStop(1, '#ff2bd6'); c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; for (let y = 120, t = 4; y < 256; y += 20, t += 2.5) c.fillRect(0, y, w, t); });
    const rs = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false })); rs.position.set(0, 280, -2200); scene.add(rs);
    const sgl = glow(0xff5ad0, 1900, 0.5); sgl.position.set(0, 280, -2210); scene.add(sgl);
    const st = []; for (let i = 0; i < 1100; i++) { const a = Math.random() * 6.28, e = rnd(0.1, 1.4); st.push(Math.cos(a) * Math.cos(e) * 2300, Math.sin(e) * 2300, Math.sin(a) * Math.cos(e) * 2300); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(st, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, fog: false })));
    const lp = []; for (let i = 0; i < T.N; i += 9) for (const s of [-1, 1]) lp.push(T.px[i] + T.tz[i] * s * (T.wall + 2.2), 5.5, T.pz[i] - T.tx[i] * s * (T.wall + 2.2));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lamps = new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffd7fb, size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(lamps);
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 5); pole.translate(0, 2.75, 0);
    const pl = []; for (let i = 0; i < lp.length; i += 3) pl.push({ x: lp[i], z: lp[i + 2], s: 1 });
    place(pole, new THREE.MeshBasicMaterial({ color: 0x3a2c6a }), pl, { shadow: false });
  } else {
    // sun disc, and soft painted clouds: all of them in one mesh
    const sp = sd.clone().multiplyScalar(2400), sdisc = new THREE.Mesh(new THREE.SphereGeometry(theme === 'desert' ? 140 : 70, 20, 14), new THREE.MeshBasicMaterial({ color: theme === 'desert' ? 0xffe6b0 : 0xfffbe6, fog: false })); sdisc.position.copy(sp); scene.add(sdisc);
    const halo = glow(theme === 'desert' ? 0xffa050 : 0xfff2c0, theme === 'desert' ? 1700 : 1000, theme === 'snow' ? 0.45 : 0.6); halo.position.copy(sp); scene.add(halo);
    const cloudTex = canvasTex(1024, 512, (c) => { for (let q = 0; q < 4; q++) { const ox = (q % 2) * 512, oy = Math.floor(q / 2) * 256; c.save(); c.beginPath(); c.rect(ox, oy, 512, 256); c.clip();
      for (let k = 0; k < 22; k++) { const x = ox + 256 + rnd(-170, 170), spread = 1 - Math.abs(x - ox - 256) / 190, r = rnd(26, 46) + spread * 30, y = oy + 150 - spread * rnd(10, 46), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.55, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.globalCompositeOperation = 'source-atop'; const sh = c.createLinearGradient(0, oy + 96, 0, oy + 205); sh.addColorStop(0, look.cloud[0]); sh.addColorStop(1, look.cloud[1]); c.fillStyle = sh; c.fillRect(ox, oy, 512, 256); c.restore(); } });
    const cp = [], cu = [], ci = []; const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * 6.28 + rnd(-0.1, 0.1), e = rnd(0.07, 0.5), R = 2300, w = rnd(420, 900) * (1 - e * 0.5), h = w * 0.5, q = k % 4, u0 = (q % 2) * 0.5, v0 = 1 - Math.floor(q / 2) * 0.5 - 0.5, b = cp.length / 3;
      dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)); right.crossVectors(up, dir).normalize(); upv.crossVectors(dir, right).normalize();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { cp.push(dir.x * R + right.x * sx * w / 2 + upv.x * sy * h / 2, dir.y * R + right.y * sx * w / 2 + upv.y * sy * h / 2, dir.z * R + right.z * sx * w / 2 + upv.z * sy * h / 2); cu.push(u0 + (sx > 0 ? 0.5 : 0), v0 + (sy > 0 ? 0.5 : 0)); }
      ci.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); cg.setIndex(ci);
    const clouds = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: theme === 'desert' ? 0.75 : 0.96 })); clouds.frustumCulled = false; clouds.renderOrder = -1; scene.add(clouds);
  }
  let snow = null;
  if (theme === 'snow') {
    const p = []; for (let i = 0; i < 2400; i++) p.push(rnd(-440, 440), rnd(0, 90), rnd(-440, 440));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xffffff, size: 1.6, transparent: true, opacity: 0.9, depthWrite: false })); snow.frustumCulled = false; scene.add(snow);
  }
  const particles = new Particles(scene);
  return { pads, sun, particles, dust: C(th.dust), theme, stat,
    // quality hooks: small scenery can be hidden and the shadow map resized or switched off
    // density: fraction of the trees / of the small scenery to draw (instances were placed in random order, so cutting the list thins evenly)
    setDensity(trees, small) { for (const g of groups) { g.im.count = Math.max(g.detail && small === 0 ? 0 : 1, Math.ceil(g.n * (g.detail ? small : trees))); if (g.low) g.low.count = g.im.count; g.off = g.detail && small === 0; } if (snow) snow.visible = small > 0; },
    // called once per camera: small scenery further than `reach` from that camera is skipped (it would be a few pixels),
    // and trees further than `lodDist` are drawn as their simple stand-in
    cull(cam, reach, lodDist) { const p = cam.position; for (const g of groups) { const d = Math.hypot(g.c.x - p.x, g.c.z - p.z) - g.r; if (g.detail) g.im.visible = !g.off && d < reach; else if (g.low) { g.im.visible = d < lodDist * g.lodK; g.low.visible = !g.im.visible; } } },
    setShadow(size) { sun.castShadow = size > 0; if (size > 0 && sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } },
    update(dt, clock) {
      if (water) water.material.uniforms.time.value = clock;
      if (snow && snow.visible) { const a = snow.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - 13 * dt; if (y < 0) y += 90; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(clock + i) * 2 * dt); } a.needsUpdate = true; }
      particles.update(dt);
    } };
}
