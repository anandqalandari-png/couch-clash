// Shared look and performance helper for the single-view 3D games (Car Football, Blast Zone):
// glow (bloom) on bright things, glossy reflections, and a frame-rate watchdog that switches the
// expensive effects off one by one if the laptop cannot keep up. ?q=high or ?q=low locks the level.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const LOCK = new URLSearchParams(location.search).get('q');

// soft studio reflections for shiny materials (car paint, the ball, bombs)
export function studioEnv(renderer, scene, intensity = 0.55) {
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = intensity; pm.dispose(); } catch {}
}

// levels: 0 = glow + sharp + shadows, 1 = no glow, 2 = lower resolution, 3 = no shadows, lowest resolution
export function makeView(renderer, scene, cam, { sun = null, bloom = [0.3, 0.4, 0.93], onResize = null } = {}) {
  let level = LOCK === 'low' ? 3 : 0, composer = null, acc = 0, n = 0, frames = 0, last = performance.now();
  const base = Math.min(devicePixelRatio || 1, LOCK === 'high' ? 2 : 1.5);
  function build() {
    try {
      const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 }); // 8-bit on purpose: lit surfaces clip at white exactly as they do without the effect, so only truly bright things glow
      composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, cam));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), bloom[0], bloom[1], bloom[2])); composer.addPass(new OutputPass());
    } catch (e) { console.warn('glow effect unavailable', e); composer = null; }
  }
  function apply() {
    const pr = level <= 1 ? base : level === 2 ? Math.min(base, 1) : 0.75;
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
    if (sun) { sun.castShadow = level < 3; renderer.shadowMap.needsUpdate = true; }
    if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); if (onResize) onResize(pr);
  }
  build(); apply();
  return {
    get level() { return level; }, resize: apply,
    render(now) {
      frames++; const ft = now - last; last = now;
      if (!LOCK && frames > 45) { acc += Math.min(ft, 250); n++; if (n >= 50) { const avg = acc / n; acc = n = 0; if (avg > 23 && level < 3) { level++; apply(); } } } // under ~43 fps: step down
      if (composer && level === 0) composer.render(); else renderer.render(scene, cam);
    },
    dispose() { try { composer && composer.dispose(); } catch {} },
  };
}
