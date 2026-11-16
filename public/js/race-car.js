// The racing cars. Each body is one smooth "lofted" shell: cross-sections placed along the car and
// skinned together, so the bodywork is rounded everywhere instead of being boxes. Paint, racing
// stripes, windows, wheel arches and the door number are drawn onto one texture per car.
// Wheels for every car in the race are drawn in a single batch (see WheelBatch).
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// smooth curve through [z, value] keys
function curve1(keys) {
  const n = keys.length, m = keys.map((k, i) => { const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)]; return (b[1] - a[1]) / ((b[0] - a[0]) || 1); });
  return (z) => {
    if (z <= keys[0][0]) return keys[0][1]; if (z >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (z > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], t = (z - keys[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * keys[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

// w = half width, y0 = floor, yb = shoulder line, yt = top, wt = half width of the top (narrower over the cabin).
// cab = [rear window start, roof start, roof end, windscreen base]; side = side-window [rear tip, front].
export const SHAPES = {
  phantom: { // grand-tourer coupe
    w: [[-2.25, 0.82], [-2.05, 0.93], [-1.4, 0.99], [-0.4, 0.93], [0.6, 0.93], [1.35, 0.98], [1.85, 0.9], [2.12, 0.76], [2.25, 0.6]],
    y0: [[-2.25, 0.44], [-2.05, 0.33], [-1.5, 0.26], [1.6, 0.25], [2.05, 0.3], [2.25, 0.4]],
    yb: [[-2.25, 0.86], [-1.7, 0.9], [-0.5, 0.86], [0.8, 0.82], [1.6, 0.74], [2.1, 0.64], [2.25, 0.58]],
    yt: [[-2.25, 0.93], [-1.95, 1.0], [-1.5, 1.07], [-0.95, 1.22], [-0.35, 1.3], [0.15, 1.27], [0.55, 1.12], [0.95, 0.95], [1.5, 0.87], [2.0, 0.72], [2.25, 0.62]],
    wt: [[-2.25, 0.62], [-1.95, 0.72], [-1.5, 0.68], [-0.9, 0.61], [-0.3, 0.6], [0.2, 0.6], [0.95, 0.72], [1.5, 0.76], [2.0, 0.62], [2.25, 0.44]],
    cab: [-1.6, -0.92, 0.12, 0.93], side: [-1.3, 0.8], wheelR: 0.41, wheelW: 0.32, axF: 1.36, axR: -1.34, spoiler: 'duck',
  },
  bolt: { // low, wide supercar with a wing
    w: [[-2.3, 0.86], [-2.1, 0.96], [-1.45, 1.02], [-0.5, 0.95], [0.6, 0.94], [1.38, 1.0], [1.9, 0.9], [2.18, 0.74], [2.3, 0.56]],
    y0: [[-2.3, 0.4], [-2.1, 0.28], [-1.5, 0.22], [1.6, 0.2], [2.1, 0.24], [2.3, 0.32]],
    yb: [[-2.3, 0.8], [-1.6, 0.84], [-0.4, 0.78], [0.9, 0.7], [1.7, 0.62], [2.2, 0.52], [2.3, 0.48]],
    yt: [[-2.3, 0.86], [-1.9, 0.92], [-1.3, 0.97], [-0.65, 1.08], [-0.1, 1.13], [0.4, 1.09], [0.85, 0.94], [1.3, 0.8], [1.8, 0.7], [2.2, 0.56], [2.3, 0.52]],
    wt: [[-2.3, 0.66], [-1.9, 0.78], [-1.3, 0.64], [-0.6, 0.57], [0, 0.56], [0.5, 0.58], [1.0, 0.72], [1.6, 0.78], [2.1, 0.6], [2.3, 0.42]],
    cab: [-1.35, -0.62, 0.38, 1.0], side: [-0.95, 0.9], wheelR: 0.4, wheelW: 0.36, axF: 1.42, axR: -1.38, spoiler: 'wing',
  },
  titan: { // tall, chunky off-roader on big wheels
    w: [[-2.2, 0.92], [-2.05, 1.0], [-1.4, 1.05], [0, 1.02], [1.4, 1.05], [1.95, 0.99], [2.2, 0.86]],
    y0: [[-2.2, 0.8], [-2.0, 0.66], [2.0, 0.66], [2.2, 0.78]],
    yb: [[-2.2, 1.24], [-1.5, 1.28], [0.9, 1.24], [1.6, 1.18], [2.2, 1.06]],
    yt: [[-2.2, 1.34], [-2.08, 1.76], [-1.7, 1.9], [-0.4, 1.92], [0.2, 1.88], [0.6, 1.72], [0.98, 1.38], [1.6, 1.3], [2.1, 1.16], [2.2, 1.1]],
    wt: [[-2.2, 0.8], [-2.0, 0.82], [0.3, 0.8], [0.95, 0.9], [1.7, 0.92], [2.2, 0.76]],
    cab: [-2.12, -1.72, 0.2, 0.98], side: [-1.75, 0.82], wheelR: 0.56, wheelW: 0.46, axF: 1.36, axR: -1.36, spoiler: 'bar', track: 0.08,
  },
  frost: { // rally hatchback
    w: [[-2.0, 0.84], [-1.85, 0.92], [-1.2, 0.97], [0, 0.93], [1.2, 0.97], [1.72, 0.88], [1.92, 0.76], [2.0, 0.62]],
    y0: [[-2.0, 0.46], [-1.8, 0.33], [1.6, 0.31], [2.0, 0.42]],
    yb: [[-2.0, 0.9], [-1.5, 0.93], [0.7, 0.88], [1.5, 0.8], [2.0, 0.64]],
    yt: [[-2.0, 1.0], [-1.88, 1.28], [-1.4, 1.42], [-0.3, 1.45], [0.25, 1.4], [0.55, 1.24], [0.85, 1.02], [1.3, 0.94], [1.8, 0.8], [2.0, 0.68]],
    wt: [[-2.0, 0.68], [-1.8, 0.7], [-0.3, 0.66], [0.3, 0.66], [0.85, 0.78], [1.5, 0.76], [2.0, 0.48]],
    cab: [-1.92, -1.42, 0.22, 0.86], side: [-1.45, 0.72], wheelR: 0.41, wheelW: 0.32, axF: 1.26, axR: -1.26, spoiler: 'roof',
  },
  warp: { // smooth teardrop roadster
    w: [[-2.2, 0.66], [-1.9, 0.86], [-1.2, 0.98], [0, 0.91], [1.2, 0.98], [1.8, 0.86], [2.08, 0.7], [2.2, 0.54]],
    y0: [[-2.2, 0.46], [-1.8, 0.3], [1.7, 0.28], [2.2, 0.42]],
    yb: [[-2.2, 0.74], [-1.4, 0.82], [0.6, 0.8], [1.6, 0.7], [2.2, 0.58]],
    yt: [[-2.2, 0.8], [-1.7, 0.92], [-1.05, 1.14], [-0.4, 1.28], [0.2, 1.25], [0.55, 1.1], [0.9, 0.93], [1.4, 0.85], [2.0, 0.7], [2.2, 0.62]],
    wt: [[-2.2, 0.46], [-1.7, 0.62], [-1.0, 0.56], [-0.3, 0.55], [0.3, 0.56], [0.9, 0.7], [1.5, 0.72], [2.2, 0.4]],
    cab: [-1.45, -0.9, 0.16, 0.9], side: [-1.15, 0.76], wheelR: 0.4, wheelW: 0.32, axF: 1.34, axR: -1.3, spoiler: 'fin',
  },
};
for (const s of Object.values(SHAPES)) { for (const k of ['w', 'y0', 'yb', 'yt', 'wt']) s['f' + k] = curve1(s[k]); s.z0 = s.w[0][0]; s.z1 = s.w[s.w.length - 1][0]; }

// one cross-section: 25 points from the bottom centre, up the right side, to the top centre
const SEG = [2, 3, 3, 3, 4, 4, 3, 2], HALF = 24, RING = HALF * 2 + 1, V = { rock: 5 / 48, wide: 8 / 48, belt: 11 / 48, glassLo: 12.2 / 48, glassHi: 18.4 / 48, roof: 19.6 / 48 };
const _c = new THREE.CatmullRomCurve3([], false, 'centripetal');
function section(S, z, k = 1) {
  const w = S.fw(z), y0 = S.fy0(z), yb = Math.max(y0 + 0.2, S.fyb(z)), yt = Math.max(yb + 0.04, S.fyt(z)), wt = Math.min(w * 0.94, S.fwt(z)), up = yt - yb;
  const P = [[0, y0], [w * 0.8, y0], [w * 0.975, y0 + 0.13], [w, (y0 + yb) / 2 + 0.06], [w * 0.975, yb], [wt + (w * 0.975 - wt) * 0.3, yb + up * 0.52], [wt * 0.93, yt - up * 0.07], [wt * 0.55, yt], [0, yt]];
  _c.points = P.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const out = []; let seg = 0;
  for (const n of SEG) { for (let i = 0; i < n; i++) { const p = _c.getPoint((seg + i / n) / SEG.length); out.push([Math.max(0, p.x), p.y]); } seg++; }
  out.push([0, yt]);
  if (k !== 1) { const cy = (y0 + yt) / 2; for (const p of out) { p[0] *= k; p[1] = cy + (p[1] - cy) * k; } }
  return out; // HALF + 1 points
}
function buildBody(S) {
  const L = S.z1 - S.z0, NS = 30, rings = [];
  // rounded-off flat tail and nose, then stations bunched towards both ends where the shape changes fastest
  rings.push({ z: S.z0 - 0.07, k: 0.55, zs: S.z0 }, { z: S.z0 - 0.05, k: 0.86, zs: S.z0 });
  for (let i = 0; i <= NS; i++) { const t = i / NS, e = 0.5 - 0.5 * Math.cos(Math.PI * t), z = S.z0 + L * (t * 0.45 + e * 0.55); rings.push({ z, k: 1, zs: z }); }
  rings.push({ z: S.z1 + 0.05, k: 0.82, zs: S.z1 }, { z: S.z1 + 0.07, k: 0.5, zs: S.z1 });
  const pos = [], uv = [], idx = [];
  for (const r of rings) {
    const half = section(S, r.zs, r.k), u = clamp((r.z - S.z0) / L, 0, 1) * 0.96 + 0.02 + (r.z < S.z0 ? (r.z - S.z0) * 0.25 : r.z > S.z1 ? (r.z - S.z1) * 0.25 : 0);
    for (let j = 0; j < RING; j++) { const h = j <= HALF ? half[j] : half[2 * HALF - j], sx = j <= HALF ? 1 : -1; pos.push(sx * h[0], h[1], r.z); uv.push(u, j / (RING - 1)); }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < RING - 1; j++) { const a = i * RING + j, b = a + RING; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  // close both ends
  for (const [ri, flip] of [[0, false], [rings.length - 1, true]]) {
    const base = ri * RING, r = rings[ri], cy = (S.fy0(r.zs) + S.fyt(r.zs)) / 2, c = pos.length / 3; pos.push(0, cy, r.z + (flip ? 0.012 : -0.012)); uv.push(flip ? 0.995 : 0.005, 0.5);
    for (let j = 0; j < RING - 1; j++) flip ? idx.push(base + j, base + j + 1, c) : idx.push(base + j + 1, base + j, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // the seam along the floor has duplicated points; share their normals so no crease shows
  const nm = g.attributes.normal; for (let i = 0; i < rings.length; i++) { const a = i * RING, b = a + RING - 1, x = 0, y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a, 0, y / l, z / l); nm.setXYZ(b, 0, y / l, z / l); }
  return g;
}
// a point on the body, from its position along the car and around the section (v: 0 floor, 0.25 right side, 0.5 roof)
export function surf(S, z, v) {
  const half = section(S, z), f = (v <= 0.5 ? v : 1 - v) * 2 * HALF, i = Math.min(HALF - 1, Math.floor(f)), t = f - i, sx = v <= 0.5 ? 1 : -1;
  return new THREE.Vector3(sx * (half[i][0] + (half[i + 1][0] - half[i][0]) * t), half[i][1] + (half[i + 1][1] - half[i][1]) * t, z);
}

// ---------- paint job ----------
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function paintTexture(S, color, number, stripe) {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const L = S.z1 - S.z0, U = (z) => ((z - S.z0) / L * 0.96 + 0.02) * W, Y = (v) => (1 - v) * H; // canvas y is flipped against v
  const col = new THREE.Color(color), css = '#' + col.getHexString(), dark = '#' + col.clone().multiplyScalar(0.72).getHexString();
  c.fillStyle = css; c.fillRect(0, 0, W, H);
  // slightly darker sills, like a studio light falling off towards the ground
  for (const [a, b] of [[0, V.rock], [1 - V.rock, 1]]) { const g = c.createLinearGradient(0, Y(a), 0, Y(b)); g.addColorStop(a === 0 ? 0 : 1, dark); g.addColorStop(a === 0 ? 1 : 0, css); c.fillStyle = g; c.fillRect(0, Math.min(Y(a), Y(b)), W, Math.abs(Y(a) - Y(b))); }
  // twin racing stripes over the nose, roof and tail
  if (stripe) { // drawn column by column so the stripes keep the same real width where the body narrows
    const vAt = (half, x) => { for (let j = HALF; j > 0; j--) { const a = half[j][0], b = half[j - 1][0]; if (x >= a && x <= b) return (j - (x - a) / ((b - a) || 1)) / (2 * HALF); } return 0.5; };
    c.fillStyle = stripe;
    for (let px = Math.ceil(U(S.z0 + 0.03)); px < U(S.z1 - 0.03); px += 4) { const z = S.z0 + ((px + 2) / W - 0.02) / 0.96 * L, half = section(S, clamp(z, S.z0, S.z1)), v1 = vAt(half, 0.075), v2 = vAt(half, 0.245); c.fillRect(px, Y(v1), 4.5, Y(v2) - Y(v1)); c.fillRect(px, Y(1 - v2), 4.5, Y(1 - v1) - Y(1 - v2)); }
  }
  // glass
  const [zr0, zr1, zf0, zf1] = S.cab, glass = (pts) => { c.beginPath(); pts.forEach(([z, v], i) => (i ? c.lineTo(U(z), Y(v)) : c.moveTo(U(z), Y(v)))); c.closePath(); const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0d141c'); g.addColorStop(0.5, '#1c2a3a'); g.addColorStop(1, '#0d141c'); c.fillStyle = g; c.fill(); c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#0a0e13'; c.stroke(); };
  const r0 = V.roof + 0.012, r1 = 1 - r0;
  glass([[zf0, r0], [zf1 - 0.04, r0 - 0.05], [zf1, r0 - 0.03], [zf1, r1 + 0.03], [zf1 - 0.04, r1 + 0.05], [zf0, r1]]);                 // windscreen
  glass([[zr1, r0 + 0.01], [zr0 + 0.04, r0 - 0.03], [zr0, r0], [zr0, r1], [zr0 + 0.04, r1 + 0.03], [zr1, r1 - 0.01]]);               // rear window
  for (const m of [0, 1]) { const v = (x) => (m ? 1 - x : x), [s0, s1] = S.side, mid = (zr1 + zf0) / 2;                                 // side windows, split by a pillar
    glass([[s0, v(V.glassLo + 0.012)], [zr1 + 0.05, v(V.glassHi)], [mid - 0.05, v(V.glassHi)], [mid - 0.05, v(V.glassLo)]]);
    glass([[mid + 0.05, v(V.glassLo)], [mid + 0.05, v(V.glassHi)], [zf0 - 0.02, v(V.glassHi)], [s1, v(V.glassLo + 0.01)]]); }
  // soft highlight streak across the glass
  c.globalAlpha = 0.16; c.fillStyle = '#bfe3ff'; c.fillRect(U(zf0 + 0.2), Y(0.56), U(zf1 - 0.25) - U(zf0 + 0.2), H * 0.035); c.globalAlpha = 1;
  // wheel arches
  for (const m of [0, 1]) for (const ax of [S.axF, S.axR]) { c.fillStyle = '#0b0b0d'; c.beginPath(); c.ellipse(U(ax), Y(m ? 1 : 0), ((S.wheelR + 0.09) / L) * 0.96 * W, H * (V.wide + 0.036), 0, 0, 7); c.fill(); }
  // shut lines and door number
  c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2.5; for (const m of [0, 1]) for (const z of [(zr1 + zf0) / 2 - 0.62, zf0 + 0.55]) { c.beginPath(); c.moveTo(U(z), Y(m ? 1 - V.rock : V.rock)); c.lineTo(U(z), Y(m ? 1 - V.belt - 0.01 : V.belt + 0.01)); c.stroke(); }
  if (number) for (const m of [0, 1]) {
    const zc = (zr1 + zf0) / 2 - 0.02, x = U(zc), y = Y(m ? 1 - 0.172 : 0.172), R = 0.21, rx = R * 0.96 * W / L, ry = R * (H * 0.04) / surf(S, zc, 0.192).distanceTo(surf(S, zc, 0.152));
    c.save(); c.translate(x, y); c.scale((m ? 1 : -1) * rx / 40, (m ? -1 : 1) * ry / 40); // the texture stretches differently along and around the body: squash the drawing so it lands round
    c.fillStyle = stripe || '#fff'; c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill();
    c.fillStyle = lum(new THREE.Color(stripe || '#fff')) > 0.5 ? '#16130f' : '#fff'; c.font = '900 58px "DM Sans","Arial Black",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(number), 0, 4); c.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- trim: bumpers, grille, mirrors, exhausts, spoiler, lights ----------
function collect() { const pos = [], nor = [], col = [], idx = []; return { pos, nor, col, idx,
  add(g, color, m) { const gg = g.clone(); if (m) gg.applyMatrix4(m); gg.computeVertexNormals(); const base = pos.length / 3, P = gg.attributes.position, N = gg.attributes.normal, c = new THREE.Color(color);
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b); }
    if (gg.index) for (let i = 0; i < gg.index.count; i++) idx.push(base + gg.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i); },
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g; } }; }
const TM = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const UNIT = { box: new THREE.BoxGeometry(1, 1, 1, 1, 1, 1), ball: new THREE.SphereGeometry(0.5, 14, 10), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), pill: new THREE.CapsuleGeometry(0.5, 1, 4, 10) };
function buildTrim(S, color) {
  const T = collect(), Lg = collect(), DARK = 0x15161a, CHROME = 0xcfd4dc, RED = 0xff3a22, WARM = 0xfff3cf;
  const zR = S.z0, zF = S.z1, wR = S.fw(zR + 0.15), wF = S.fw(zF - 0.2), y0R = S.fy0(zR + 0.2), y0F = S.fy0(zF - 0.25), ybR = S.fyb(zR), tall = S.wheelR > 0.5;
  // rear: diffuser, twin exhausts, light bars
  T.add(UNIT.box, DARK, TM(0, S.fy0(zR) + 0.045, zR + 0.13, wR * 1.3, 0.13, 0.3)); T.add(UNIT.box, 0xf2efe6, TM(0, ybR - 0.3, zR - 0.055, 0.44, 0.115, 0.03)); // diffuser, number plate
  for (const s of [-1, 1]) T.add(UNIT.cyl, CHROME, TM(s * wR * 0.4, S.fy0(zR) + 0.05, zR - 0.06, 0.1, 0.16, 0.1, Math.PI / 2));
  for (const s of [-1, 1]) Lg.add(UNIT.pill, RED, TM(s * wR * 0.5, ybR - 0.11, zR - 0.062, 0.085, 0.3, 0.05, 0, 0, Math.PI / 2));
  // front: grille, splitter, headlights sitting on the wings
  T.add(UNIT.pill, DARK, TM(0, y0F + 0.15, zF + 0.045, 0.15, wF * 0.6, 0.07, 0, 0, Math.PI / 2));
  T.add(UNIT.box, DARK, TM(0, y0F + 0.03, zF - 0.2, wF * 1.5, 0.05, 0.42));
  for (const s of [-1, 1]) { const p = surf(S, zF - 0.42, s > 0 ? 0.3 : 0.7); T.add(UNIT.ball, DARK, TM(p.x * 0.97, p.y - 0.045, p.z - 0.01, 0.36, 0.13, 0.44, 0.25, s * 0.35, 0)); Lg.add(UNIT.ball, WARM, TM(p.x * 0.97, p.y - 0.02, p.z + 0.01, 0.26, 0.12, 0.32, 0.25, s * 0.35, 0)); }
  // sills, mirrors
  for (const s of [-1, 1]) T.add(UNIT.box, DARK, TM(s * S.fw(0) * 0.96, S.fy0(0) + 0.05, (S.axF + S.axR) / 2, 0.08, 0.1, S.axF - S.axR - S.wheelR * 2.5));
  for (const s of [-1, 1]) { const p = surf(S, S.cab[3] - 0.12, s > 0 ? 0.245 : 0.755); T.add(UNIT.ball, color, TM(p.x + s * 0.1, p.y + 0.07, p.z, 0.2, 0.12, 0.16)); T.add(UNIT.box, DARK, TM(p.x + s * 0.02, p.y + 0.04, p.z, 0.14, 0.035, 0.06)); }
  // spoiler
  const deckZ = zR + 0.28, deckY = S.fyt(deckZ);
  if (S.spoiler === 'duck') T.add(UNIT.box, color, TM(0, deckY + 0.02, zR + 0.12, S.fwt(deckZ) * 1.95, 0.05, 0.3, 0.32));
  if (S.spoiler === 'wing') { T.add(UNIT.box, DARK, TM(0, deckY + 0.34, zR + 0.2, wR * 2.02, 0.045, 0.42, 0.12)); for (const s of [-1, 1]) { T.add(UNIT.box, DARK, TM(s * wR * 0.62, deckY + 0.16, zR + 0.24, 0.05, 0.34, 0.24)); T.add(UNIT.box, color, TM(s * wR * 1.0, deckY + 0.34, zR + 0.2, 0.04, 0.2, 0.5)); } }
  if (S.spoiler === 'roof') { const z = S.cab[0] + 0.02; T.add(UNIT.box, DARK, TM(0, S.fyt(z + 0.35) + 0.05, z, S.fwt(z + 0.3) * 1.9, 0.045, 0.42, 0.1)); for (let k = -1.5; k <= 1.5; k++) Lg.add(UNIT.ball, WARM, TM(k * 0.3, S.fyt(S.cab[2]) + 0.06, S.cab[2] + 0.1, 0.2, 0.2, 0.12)); }
  if (S.spoiler === 'fin') T.add(UNIT.box, color, TM(0, deckY + 0.03, zR + 0.14, S.fwt(deckZ) * 1.7, 0.04, 0.26, 0.4));
  if (S.spoiler === 'bar') { const z = S.cab[2] - 0.5, y = S.fyt(z); T.add(UNIT.cyl, CHROME, TM(0, y + 0.16, z, 0.07, S.fwt(z) * 1.8, 0.07, 0, 0, Math.PI / 2)); for (const s of [-1, 1]) T.add(UNIT.cyl, CHROME, TM(s * S.fwt(z) * 0.86, y + 0.06, z, 0.07, 0.22, 0.07)); for (let k = -1.5; k <= 1.5; k++) Lg.add(UNIT.ball, WARM, TM(k * 0.34, y + 0.17, z + 0.07, 0.24, 0.24, 0.14)); T.add(UNIT.box, DARK, TM(0, y0F + 0.16, zF + 0.05, wF * 1.7, 0.2, 0.14)); }
  if (tall) for (const s of [-1, 1]) for (const ax of [S.axF, S.axR]) T.add(UNIT.box, DARK, TM(s * (S.fw(ax) - 0.04), S.fy0(ax) + 0.2, ax, 0.22, 0.12, S.wheelR * 2.6)); // arch flares
  return { trim: T.geo(), lights: Lg.geo() };
}

// ---------- wheels: every wheel of every car in one draw call ----------
function wheelGeometry() {
  const T = collect(), TYRE = 0x121215, RIM = 0xd2d6dd, DISC = 0x3a3b40, HUB = 0x8d9199;
  const pr = [[0.6, -0.5], [0.9, -0.5], [1, -0.36], [1, 0.36], [0.9, 0.5], [0.6, 0.5]].map(([r, x]) => new THREE.Vector2(r, x)), tyre = new THREE.LatheGeometry(pr, 18); tyre.rotateZ(Math.PI / 2);
  T.add(tyre, TYRE);
  const barrel = new THREE.CylinderGeometry(0.64, 0.64, 0.9, 14, 1, true); barrel.rotateZ(Math.PI / 2); T.add(barrel, DISC);
  for (const side of [-1, 1]) {
    const lip = new THREE.TorusGeometry(0.61, 0.045, 4, 18); lip.rotateY(Math.PI / 2); T.add(lip, RIM, TM(side * 0.46, 0, 0));
    const disc = new THREE.CylinderGeometry(0.58, 0.58, 0.04, 12); disc.rotateZ(Math.PI / 2); T.add(disc, DISC, TM(side * 0.3, 0, 0));
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; T.add(UNIT.box, RIM, TM(side * 0.42, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.07, 0.58, 0.13, a, 0, 0)); }
    const cap = new THREE.CylinderGeometry(0.14, 0.17, 0.1, 8); cap.rotateZ(Math.PI / 2); T.add(cap, HUB, TM(side * 0.46, 0, 0));
  }
  return T.geo();
}
export class WheelBatch {
  constructor(scene, max = 40) {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.9 });
    this.mesh = new THREE.InstancedMesh(wheelGeometry(), this.mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.mesh);
    this.items = []; this._m = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  add(car) { for (const w of car.userData.wheelDefs) this.items.push({ car, w }); this.mesh.count = this.items.length; }
  // steer and spin come from each car's userData; called once per frame, not once per view
  update() {
    this.items.forEach(({ car, w }, i) => {
      const u = car.userData; this._e.set(u.spin, w.front ? u.steerAngle : 0, 0); this._q.setFromEuler(this._e);
      this._l.compose(w.pos, this._q, w.scale); this._m.multiplyMatrices(car.matrixWorld, this._l); this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- a whole car ----------
const bodyCache = new Map(), trimCache = new Map(), softDot = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const shadowDot = (() => { // contact shadow: a rounded rectangle, dark right up to the bodywork and soft only at the rim
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'), d = x.createImageData(64, 128);
  for (let py = 0; py < 128; py++) for (let px = 0; px < 64; px++) { const qx = Math.max(0, Math.abs(px - 31.5) / 32 - 0.5) / 0.5, qy = Math.max(0, Math.abs(py - 63.5) / 64 - 0.62) / 0.38, e = Math.min(1, Math.hypot(qx, qy)), a = 1 - e * e * (3 - 2 * e), k = (py * 64 + px) * 4; d.data[k] = d.data[k + 1] = d.data[k + 2] = 255; d.data[k + 3] = a * 255; }
  x.putImageData(d, 0, 0); return new THREE.CanvasTexture(c); })();
const glowSprite = (color, size, opacity) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false })); s.scale.setScalar(size); return s; };
export function buildRaceCar(type, color, { number = 0, scale = 1.18 } = {}) {
  const S = SHAPES[type] || SHAPES.phantom, col = new THREE.Color(color);
  if (!bodyCache.has(type)) bodyCache.set(type, buildBody(S));
  const g = new THREE.Group(), chassis = new THREE.Group(); g.add(chassis); g.scale.set(scale * 1.1, scale * 1.13, scale); // a touch wider and taller than life: reads better from the chase camera
  const stripe = lum(col) > 0.45 ? '#1b1a18' : '#f4ead2';
  const paint = new THREE.MeshPhysicalMaterial({ map: paintTexture(S, color, number, stripe), roughness: 0.36, metalness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
  const body = new THREE.Mesh(bodyCache.get(type), paint); chassis.add(body);
  const key = type + '|' + col.getHexString(); if (!trimCache.has(key)) trimCache.set(key, buildTrim(S, col.getHex())); const tr = trimCache.get(key);
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45, envMapIntensity: 1 }), lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  chassis.add(new THREE.Mesh(tr.trim, trimMat)); const lights = new THREE.Mesh(tr.lights, lightMat); chassis.add(lights);
  // wheel positions for the shared batch
  const wheelDefs = [], tw = S.track || 0;
  for (const [ax, front] of [[S.axF, true], [S.axR, false]]) for (const s of [-1, 1]) wheelDefs.push({ front, pos: new THREE.Vector3(s * (S.fw(ax) - S.wheelW / 2 + 0.03 + tw), S.wheelR, ax), scale: new THREE.Vector3(S.wheelW, S.wheelR, S.wheelR) });
  // soft contact shadow, brake glow, boost flame, ice block (same hooks the race code already uses)
  const Lz = S.z1 - S.z0, Wd = 2.1, H = S.fyt(0);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.5, Lz * 1.26), new THREE.MeshBasicMaterial({ map: shadowDot, color: 0x05060a, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.17; blob.renderOrder = 1; g.add(blob);
  const brake = [glowSprite(0xff2a12, 2.4, 0)]; brake[0].position.set(0, S.fyb(S.z0) - 0.1, S.z0 - 0.25); brake[0].visible = false; chassis.add(brake[0]); // one glow, only drawn while braking
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.7, 10), new THREE.MeshBasicMaterial({ color: 0xffb02a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); flame.rotation.x = -Math.PI / 2; flame.position.set(0, S.fy0(S.z0 + 0.2) + 0.12, S.z0 - 0.85); flame.visible = false; chassis.add(flame);
  const fg = glowSprite(0xff8a1a, 2.8, 0.6); fg.position.set(0, flame.position.y, S.z0 - 0.45); fg.visible = false; chassis.add(fg);
  const iceBlock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbff2ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, depthWrite: false, flatShading: true })); iceBlock.scale.set(Wd * 0.8, H * 0.85, Lz * 0.66); iceBlock.position.y = H * 0.5; iceBlock.visible = false; g.add(iceBlock);
  Object.assign(g.userData, { chassis, body, wheels: [], fronts: [], wheelDefs, spin: 0, steerAngle: 0, mats: [paint, trimMat, lightMat], flame, flameGlow: fg, iceBlock, brake, tagY: H + 1.25, blob, shape: S, lofted: true });
  return g;
}
