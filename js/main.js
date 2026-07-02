// js/main.js — 桜の工房・弐. A commercial-grade VRM dressing room:
// three CC0 VRoid avatars (license metadata embedded in each .vrm), a live
// three-point light rig with AI-painted time-of-day sets, real-time soft
// shadows over a mirror floor, procedural pose/idle/expression direction,
// HSL re-dye of hair/eyes/clothes, share-links (full state in the URL hash),
// photo + gacha-card export, and quality toggles for low-end machines.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------ renderer ----
const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#viewport').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17121f);
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 60);

const rt = new THREE.WebGLRenderTarget(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio(),
  { samples: 8 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.22, 0.4, 0.9);
composer.addPass(bloom);
const vignette = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.42 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uAmt;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - uAmt * smoothstep(0.42, 0.86, d);
      gl_FragColor = c; }`,
});
composer.addPass(vignette);
composer.addPass(new OutputPass());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  updateViewOffset();
});

// ------------------------------------------------------------- stage ------
const texLoader = new THREE.TextureLoader();
const loadTex = (url) => { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; return t; };

const bgMat = new THREE.MeshBasicMaterial();
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 8.66), bgMat);
backdrop.position.set(0, 2.3, -5.6);
scene.add(backdrop);

// Genshin rule #1: the character is the only high-frequency thing on screen.
// The AI paintings are gorgeous but LOUD — blur + darken + desaturate them
// into a bokeh environment (amount user-adjustable).
let bgBlur = 0.55;
let bgBlurT = 0;
let bgUrl = './assets/bg-dusk.png';
const bgImgCache = {};
const bgTexCache = {};
const loadImage = (url) => bgImgCache[url] || (bgImgCache[url] = new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = rej;
  im.src = url;
}));
async function makeBgTexture(url, blur) {
  const cacheKey = url + '|' + Math.round(blur * 12);
  if (bgTexCache[cacheKey]) return bgTexCache[cacheKey];
  const im = await loadImage(url);
  const w = 1152, h = Math.round(w * im.height / im.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.filter = `blur(${(blur * 9).toFixed(1)}px) brightness(${(1 - blur * 0.34).toFixed(2)}) saturate(${(1 - blur * 0.22).toFixed(2)})`;
  g.drawImage(im, -24, -24, w + 48, h + 48); // overscan hides the blur's edge fade
  g.filter = 'none';
  const rg = g.createRadialGradient(w / 2, h * 0.42, h * 0.25, w / 2, h * 0.5, w * 0.62);
  rg.addColorStop(0, 'rgba(8,5,12,0)');
  rg.addColorStop(1, 'rgba(8,5,12,0.5)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bgTexCache[cacheKey] = t;
  return t;
}
async function refreshBackdrop() {
  if (!bgUrl) { backdrop.visible = false; return; }
  const t = await makeBgTexture(bgUrl, bgBlur);
  backdrop.visible = true;
  bgMat.map = t;
  bgMat.needsUpdate = true;
}

const mirror = new Reflector(new THREE.CircleGeometry(2.6, 48), {
  textureWidth: 1024, textureHeight: 1024, color: 0x3a3644,
});
mirror.rotation.x = -Math.PI / 2;
scene.add(mirror);
const emblem = new THREE.Mesh(
  new THREE.CircleGeometry(1.25, 48),
  new THREE.MeshBasicMaterial({
    map: loadTex('./assets/floor-emblem.png'),
    blending: THREE.AdditiveBlending, transparent: true, opacity: 0.38, depthWrite: false,
  }));
emblem.rotation.x = -Math.PI / 2;
emblem.position.y = 0.005;
scene.add(emblem);
const catcher = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 48),
  new THREE.ShadowMaterial({ opacity: 0.38 }));
catcher.rotation.x = -Math.PI / 2;
catcher.position.y = 0.01;
catcher.receiveShadow = true;
scene.add(catcher);

// --- vertical light beams behind the character (the Genshin menu glow) ---
const beams = new THREE.Group();
{
  const bc = document.createElement('canvas');
  bc.width = 64; bc.height = 256;
  const g2 = bc.getContext('2d');
  const lg = g2.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, 'rgba(255,228,196,0)');
  lg.addColorStop(0.35, 'rgba(255,228,196,1)');
  lg.addColorStop(0.75, 'rgba(255,228,196,0.5)');
  lg.addColorStop(1, 'rgba(255,228,196,0)');
  g2.fillStyle = lg;
  for (let x = 0; x < 64; x++) {
    g2.globalAlpha = Math.pow(Math.sin((x / 63) * Math.PI), 1.6);
    g2.fillRect(x, 0, 1, 256);
  }
  const bt = new THREE.CanvasTexture(bc);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6 + i * 0.35, 6.6),
      new THREE.MeshBasicMaterial({ map: bt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.085 }));
    m.position.set((i - 1) * 1.05, 2.5, -1.7 - i * 0.35);
    m.rotation.z = (i - 1) * 0.15;
    beams.add(m);
  }
  scene.add(beams);
}
// --- sakura bokeh: a mid layer around the stage + a big soft foreground ---
const petalSystems = [];
function makePetals(count, opts) {
  const pos = new Float32Array(count * 3);
  const seed = [];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * opts.spread;
    pos[i * 3 + 1] = Math.random() * opts.height;
    pos[i * 3 + 2] = opts.z0 + Math.random() * opts.zRange;
    seed.push(Math.random() * Math.PI * 2);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cv2 = document.createElement('canvas');
  cv2.width = cv2.height = 32;
  const gc = cv2.getContext('2d');
  const rg = gc.createRadialGradient(16, 16, 2, 16, 16, 16);
  rg.addColorStop(0, `rgba(255,205,220,${opts.core})`);
  rg.addColorStop(0.65, `rgba(255,175,200,${opts.core * 0.3})`);
  rg.addColorStop(1, 'rgba(255,175,200,0)');
  gc.fillStyle = rg;
  gc.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(gg, new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(cv2), size: opts.size, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: opts.opacity,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  petalSystems.push({ gg, seed, count, opts });
}
makePetals(70, { spread: 6, height: 3.6, z0: -3.5, zRange: 4.5, size: 0.05, opacity: 0.8, core: 0.9 });
makePetals(10, { spread: 4.5, height: 2.8, z0: 0.9, zRange: 1.1, size: 0.42, opacity: 0.22, core: 0.55 });
function updatePetals(t, dt) {
  for (const P of petalSystems) {
    const arr = P.gg.attributes.position.array;
    for (let i = 0; i < P.count; i++) {
      arr[i * 3] += Math.sin(t * 0.4 + P.seed[i]) * 0.05 * dt + 0.015 * dt;
      arr[i * 3 + 1] -= (0.045 + 0.03 * Math.sin(P.seed[i])) * dt;
      if (arr[i * 3 + 1] < 0.02) arr[i * 3 + 1] = P.opts.height;
    }
    P.gg.attributes.position.needsUpdate = true;
  }
}
// centre the character in the VISIBLE area (the panel eats the right side)
function updateViewOffset() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w > 900) camera.setViewOffset(w, h, 140, 0, w, h);
  else camera.clearViewOffset();
}
updateViewOffset();

// ------------------------------------------------------- the light rig ----
const key = new THREE.DirectionalLight('#ffb27a', 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -1.6;
key.shadow.camera.right = key.shadow.camera.top = 1.6;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 12;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
key.target.position.set(0, 1.0, 0);
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#7a6aa0', 0.6);
fill.position.set(-2.5, 1.6, 2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight('#ff9ec2', 1.2);
rim.position.set(0.6, 2.6, -2.6);
scene.add(rim);
const amb = new THREE.AmbientLight('#3a3048', 0.9);
scene.add(amb);

const light = { az: -38, el: 38, intensity: 2.2, rim: 1.2, bloom: 0.22 };
const quality = { shadows: true, mirror: true };
function applyLightAngles() {
  const a = THREE.MathUtils.degToRad(light.az);
  const e = THREE.MathUtils.degToRad(light.el);
  key.position.set(Math.sin(a) * Math.cos(e) * 4, Math.sin(e) * 4 + 1, Math.cos(a) * Math.cos(e) * 4);
  key.intensity = light.intensity;
  rim.intensity = light.rim;
  bloom.strength = light.bloom;
}
function applyQuality() {
  key.castShadow = quality.shadows;
  catcher.visible = quality.shadows;
  mirror.visible = quality.mirror;
}
applyLightAngles();

const PRESETS = {
  dusk: { label: '黄昏', bg: './assets/bg-dusk.png', keyC: '#ffb27a', fillC: '#7a6aa0', rimC: '#ff9ec2', ambC: '#3a3048', az: -38, el: 38, intensity: 2.2, rimI: 1.2, bloom: 0.22, exp: 1.0 },
  night: { label: '月夜', bg: './assets/bg-night.png', keyC: '#aec4ff', fillC: '#3a4a7a', rimC: '#cfe0ff', ambC: '#26304a', az: 30, el: 52, intensity: 1.7, rimI: 1.7, bloom: 0.34, exp: 0.95 },
  dawn: { label: '黎明', bg: './assets/bg-dawn.png', keyC: '#ffd9a0', fillC: '#b0a0c0', rimC: '#ffe9c0', ambC: '#4a4040', az: 42, el: 26, intensity: 2.6, rimI: 0.9, bloom: 0.18, exp: 1.05 },
  studio: { label: '工作室', bg: null, keyC: '#ffffff', fillC: '#8890b0', rimC: '#aaccff', ambC: '#33333e', az: -30, el: 42, intensity: 2.4, rimI: 1.5, bloom: 0.15, exp: 1.0 },
};
let preset = 'dusk';
function applyPreset(name) {
  if (!PRESETS[name]) return;
  preset = name;
  const p = PRESETS[name];
  key.color.set(p.keyC);
  fill.color.set(p.fillC);
  rim.color.set(p.rimC);
  amb.color.set(p.ambC);
  Object.assign(light, { az: p.az, el: p.el, intensity: p.intensity, rim: p.rimI, bloom: p.bloom });
  renderer.toneMappingExposure = p.exp;
  bgUrl = p.bg;
  refreshBackdrop();
  applyLightAngles();
  ui.sync?.();
}

// ---------------------------------------------------- the character bay ---
const CHARS = {
  shino: { label: '紫乃', url: './assets/shino.vrm', armK: 1.0 },
  vita: { label: '维塔', url: './assets/vita.vrm', armK: 0.92 },
  fumiriya: { label: '文椰・男', url: './assets/fumiriya.vrm', armK: 1.08 },
};
let vrm = null;
let hipsRest = null;
let frameBody = 0.92, frameFace = 1.30; // recomputed per model from the head bone
let charId = 'shino';
const vrmCache = {};
const charGroup = new THREE.Group();
scene.add(charGroup);
const matGroups = { hair: [], cloth: [], eyes: [] };

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));
const loadEl = document.getElementById('loading');
let firstLoad = true;
let forceInstant = false;
let loadGen = 0;
const pct = $('#load-pct');

async function loadChar(id) {
  if (!CHARS[id]) id = 'shino';
  charId = id;
  const gen = ++loadGen; // stale requests must never land on stage
  loadEl.classList.toggle('soft', !firstLoad); // switches dim, only boot blanks
  loadEl.style.opacity = '1';
  window.__a2.ready = false;
  if (vrm) charGroup.remove(vrm.scene);
  let v = vrmCache[id];
  if (!v) {
    const gltf = await new Promise((res, rej) => loader.load(CHARS[id].url, res,
      (ev) => { if (ev.total) pct.textContent = `召喚中… ${CHARS[id].label} ${Math.round(ev.loaded / ev.total * 100)}%`; }, rej));
    v = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(v);
    v.scene.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    vrmCache[id] = v;
  }
  if (gen !== loadGen) return; // superseded by a newer click
  if (vrm) charGroup.remove(vrm.scene);
  vrm = v;
  matGroups.hair = []; matGroups.cloth = []; matGroups.eyes = [];
  vrm.scene.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const n = (m.name || '').toUpperCase();
      if (n.includes('HAIR')) matGroups.hair.push(m);
      else if (n.includes('CLOTH') || n.includes('TOPS') || n.includes('BOTTOMS') || n.includes('SKIRT') || n.includes('ACCESSORY')) matGroups.cloth.push(m);
      else if (n.includes('IRIS') || n.includes('EYE_') || n.endsWith('_EYE')) matGroups.eyes.push(m);
    }
  });
  const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
  hipsRest = hipsNode ? hipsNode.position.clone() : null;
  if (vrm.lookAt) vrm.lookAt.target = camera;
  charGroup.add(vrm.scene);
  forceInstant = true;
  animateVRM(0.001, 0.016); // pose + expression land fully on frame one
  forceInstant = false;
  for (let i = 0; i < 120; i++) vrm.update(1 / 60); // springs settle pre-paint
  // frame targets from the ACTUAL head height — any model, any height
  {
    const headNode = vrm.humanoid.getNormalizedBoneNode('head');
    if (headNode) {
      const wp = new THREE.Vector3();
      vrm.scene.updateWorldMatrix(true, true);
      headNode.getWorldPosition(wp);
      const headY = wp.y + 0.06; // eye line sits slightly above the bone
      frameFace = headY;
      frameBody = headY * 0.63;
    }
  }
  for (const g of ['hair', 'eyes', 'cloth']) if (dyes[g]) applyDye(g);
  loadEl.style.opacity = '0';
  firstLoad = false;
  window.__a2.ready = true;
  ui.sync?.();
}

// ----------------------------------------------------- pose + idle life ---
const POSE_BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'];
const POSES = {
  relax: { label: '自然', leftUpperArm: [0, 0, 1.13], rightUpperArm: [0, 0, -1.13], leftLowerArm: [0, 0, 0.14], rightLowerArm: [0, 0, -0.14] },
  greet: { label: '打招呼', leftUpperArm: [0, 0, 1.13], rightUpperArm: [0.1, -0.5, -2.2], rightLowerArm: [-0.4, -0.6, -0.5], rightHand: [0, 0, -0.3], head: [0, 0, 0.10], spine: [0, 0, 0.05] },
  elegant: { label: '优雅', leftUpperArm: [0.42, 0.35, 1.02], rightUpperArm: [0.42, -0.35, -1.02], leftLowerArm: [0, 1.15, 0.55], rightLowerArm: [0, -1.15, -0.55], head: [0.06, 0, 0], spine: [-0.03, 0, 0] },
  lookback: { label: '回眸', spine: [0, 0.34, 0], chest: [0, 0.24, 0], neck: [0, 0.30, 0], head: [0.04, 0.22, 0], leftUpperArm: [0, 0, 1.13], rightUpperArm: [0, 0, -1.13] },
};
// occasional personality gestures layered over the idle (Genshin characters
// never just stand there)
const GESTURES = [
  { head: [0, 0.22, 0.14], neck: [0, 0.10, 0] },
  { head: [0.10, -0.24, 0], spine: [0, -0.05, 0] },
  { head: [-0.06, 0, -0.10], chest: [0.02, 0, 0.04] },
];
const GESTURE_NOTICE = { head: [0.16, 0, 0.05], neck: [0.05, 0, 0], chest: [0.03, 0, 0] };
let gesture = null, gesturePhase = 0, gestureT = 6;
let poseName = 'relax';
const poseCurrent = {};
for (const b of POSE_BONES) poseCurrent[b] = new THREE.Euler();
function setPose(name) { if (POSES[name]) poseName = name; ui.sync?.(); }

const EXPRS = { neutral: '淡然', happy: '开心', angry: '生气', sad: '哀伤', relaxed: '惬意' };
let expr = 'happy';
let exprWeight = 0.42;
const exprState = {}; // eased per-expression weights
let blinkT = 2.4, blinkPhase = -1;

function animateVRM(t, dt) {
  if (!vrm) return;
  const h = vrm.humanoid;
  const k = (q.get('still') || forceInstant) ? 1 : 1 - Math.exp(-6 * dt);
  const target = POSES[poseName];
  for (const b of POSE_BONES) {
    const node = h.getNormalizedBoneNode(b);
    if (!node) continue;
    const tg = target[b] || [0, 0, 0];
    let tz = tg[2];
    if (b === 'leftUpperArm' || b === 'rightUpperArm') tz *= (CHARS[charId].armK ?? 1);
    const cur = poseCurrent[b];
    cur.x += (tg[0] - cur.x) * k;
    cur.y += (tg[1] - cur.y) * k;
    cur.z += (tz - cur.z) * k;
    node.rotation.set(cur.x, cur.y, cur.z);
  }
  const chest = h.getNormalizedBoneNode('chest');
  if (chest) chest.rotation.x += Math.sin(t * 1.4) * 0.012;
  const hips = h.getNormalizedBoneNode('hips');
  if (hips && hipsRest) {
    hips.rotation.z += Math.sin(t * 0.45) * 0.015;
    hips.position.set(hipsRest.x + Math.sin(t * 0.45) * 0.008, hipsRest.y + Math.sin(t * 1.4) * 0.004, hipsRest.z);
  }
  const head = h.getNormalizedBoneNode('head');
  if (head) head.rotation.z += Math.sin(t * 0.7) * 0.012;

  // gesture overlay: eased in-out, additive on top of pose + idle
  if (!q.get('still')) {
    if (!gesture && t > gestureT) { gesture = GESTURES[(Math.random() * GESTURES.length) | 0]; gesturePhase = 0; }
    if (gesture) {
      gesturePhase += dt / 2.4;
      const amp = Math.sin(Math.min(gesturePhase, 1) * Math.PI);
      for (const [b, e] of Object.entries(gesture)) {
        const node = h.getNormalizedBoneNode(b);
        if (node) { node.rotation.x += e[0] * amp; node.rotation.y += e[1] * amp; node.rotation.z += e[2] * amp; }
      }
      if (gesturePhase >= 1) { gesture = null; gestureT = t + 6 + Math.random() * 7; }
    }
  }

  const em = vrm.expressionManager;
  if (em) {
    const ke = (q.get('still') || forceInstant) ? 1 : 1 - Math.exp(-8 * dt);
    for (const name of Object.keys(EXPRS)) {
      if (name === 'neutral') continue;
      const tgt = name === expr ? exprWeight : 0;
      const cur2 = exprState[name] ?? 0;
      exprState[name] = cur2 + (tgt - cur2) * ke;
      em.setValue(name, exprState[name]);
    }
    if (blinkPhase < 0 && t > blinkT && !q.get('still')) blinkPhase = 0;
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.22;
      const v = blinkPhase < 0.45 ? blinkPhase / 0.45 : Math.max(0, 1 - (blinkPhase - 0.45) / 0.55);
      // a strong smile already squints — don't double-close the lids
      em.setValue('blink', v * (1 - 0.45 * (exprState.happy || 0)));
      if (blinkPhase >= 1) { blinkPhase = -1; em.setValue('blink', 0); blinkT = t + 1.8 + Math.random() * 3.4; }
    }
  }
  vrm.update(dt);
}

// -------------------------------------------------------- texture re-dye --
const dyes = { hair: 0, cloth: 0, eyes: 0 };
const dyeCache = new Map(); // material -> original canvases; NEVER cleared,
                            // so re-dyes always start from the true original
function snapshotTex(tex) {
  if (!tex || !tex.image) return null;
  const c = document.createElement('canvas');
  c.width = tex.image.width; c.height = tex.image.height;
  c.getContext('2d').drawImage(tex.image, 0, 0);
  return c;
}
function applyDye(groupName) {
  const deg = dyes[groupName];
  for (const m of matGroups[groupName]) {
    let cache = dyeCache.get(m);
    if (!cache) {
      cache = { map: snapshotTex(m.map), shade: snapshotTex(m.shadeMultiplyTexture) };
      dyeCache.set(m, cache);
    }
    const redo = (orig, tex) => {
      if (!orig || !tex) return;
      const c = document.createElement('canvas');
      c.width = orig.width; c.height = orig.height;
      const g = c.getContext('2d');
      g.filter = `hue-rotate(${deg}deg)`;
      g.drawImage(orig, 0, 0);
      tex.image = c;
      tex.needsUpdate = true;
    };
    redo(cache.map, m.map);
    redo(cache.shade, m.shadeMultiplyTexture);
  }
}

// ------------------------------------------------------------ turntable ---
let rotY = q.get('still') ? 0 : 0.3, rotVel = 0, camPitch = 0.12, dist = 2.7;
let autoRotate = false, dragging = false, lastX = 0, lastY = 0;
if (q.get('closeup')) { dist = 0.9; camPitch = 0.0; }
const dom = renderer.domElement;
dom.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; autoRotate = false; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  rotVel = dx * 0.0075;
  rotY += rotVel;
  camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.003, -0.10, 0.5);
});
dom.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.0015, 0.75, 4.2);
}, { passive: false });
dom.addEventListener('dblclick', () => { dist = dist > 1.4 ? 0.9 : 2.6; });
// tap the character (click, not drag) → she notices you
const raycaster = new THREE.Raycaster();
let downPos = null;
dom.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
window.addEventListener('pointerup', (e) => {
  if (!downPos || !vrm) return;
  const dxc = e.clientX - downPos[0], dyc = e.clientY - downPos[1];
  downPos = null;
  if (dxc * dxc + dyc * dyc > 36) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.intersectObject(vrm.scene, true).length) {
    gesture = GESTURE_NOTICE;
    gesturePhase = 0;
    blinkPhase = 0;
    sfx.ok();
  }
});

// ---------------------------------------------------------- UI sounds -----
const sfx = (() => {
  let ctx = null;
  window.addEventListener('pointerdown', () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  });
  function tone(f, dur, peak = 0.05, type = 'sine') {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  let lastTick = 0;
  return {
    tab() { tone(740, 0.12, 0.04, 'triangle'); tone(1480, 0.06, 0.015); },
    tick() { const n = performance.now(); if (n - lastTick > 70) { lastTick = n; tone(2400, 0.03, 0.014, 'square'); } },
    ok() { tone(880, 0.18, 0.04); setTimeout(() => tone(1320, 0.22, 0.03), 60); },
  };
})();

// ---------------------------------------------------------------- UI ------
const ctlRoot = $('#controls');
const tabBar = $('#tabs');
const mk = (tag, cls, parent) => { const el = document.createElement(tag); if (cls) el.className = cls; parent.append(el); return el; };
const syncFns = [];
const ui = {};
ui.sync = () => syncFns.forEach((f) => f());
let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
}

function slider(parent, label, get, set, min = 0, max = 1, hue = false) {
  const row = mk('div', 'row', parent);
  mk('label', '', row).textContent = label;
  const inp = mk('input', hue ? 'hueline' : '', row);
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = (max - min) / 200; inp.value = get();
  if (hue) inp.style.background = 'linear-gradient(90deg,hsl(0,70%,55%),hsl(60,70%,55%),hsl(120,70%,55%),hsl(180,70%,55%),hsl(240,70%,55%),hsl(300,70%,55%),hsl(360,70%,55%))';
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); sfx.tick(); });
  syncFns.push(() => { inp.value = get(); });
}
function segmented(parent, label, options, get, set) {
  const row = mk('div', 'row col', parent);
  mk('label', '', row).textContent = label;
  const box = mk('div', 'seg', row);
  const keys = Object.keys(options);
  const btns = keys.map((kk) => {
    const b = mk('button', '', box);
    b.textContent = options[kk];
    b.addEventListener('click', () => { set(kk); ui.sync(); sfx.tab(); });
    return b;
  });
  syncFns.push(() => btns.forEach((b, i) => b.classList.toggle('on', keys[i] === get())));
}
function toggle(parent, label, get, set) {
  const row = mk('div', 'row', parent);
  mk('label', '', row).textContent = label;
  const b = mk('button', 'tog', row);
  b.addEventListener('click', () => { set(!get()); ui.sync(); sfx.ok(); });
  syncFns.push(() => { b.textContent = get() ? 'ON' : 'OFF'; b.classList.toggle('on', get()); });
}
function action(parent, label, fn) {
  const row = mk('div', 'row', parent);
  const b = mk('button', 'tog on', row);
  b.style.marginLeft = '0';
  b.style.flex = '1';
  b.style.padding = '9px';
  b.textContent = label;
  b.addEventListener('click', () => { sfx.ok(); fn(); });
}

const TABS = [
  { id: 'light', label: '光影' },
  { id: 'act', label: '表情·姿势' },
  { id: 'dye', label: '色彩' },
  { id: 'finish', label: '完成' },
];
const panes = {};
let activeTab = 'light';
for (const t of TABS) {
  const b = mk('button', '', tabBar);
  b.textContent = t.label;
  b.dataset.tab = t.id;
  b.addEventListener('click', () => { showTab(t.id); sfx.tab(); });
  panes[t.id] = mk('div', 'pane', ctlRoot);
}
function showTab(id) {
  activeTab = id;
  for (const t of TABS) panes[t.id].style.display = t.id === id ? '' : 'none';
  tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  $('#next').textContent = id === 'finish' ? '✦ 生成角色卡' : '下一步 →';
}

// — 光影 —
segmented(panes.light, '角色', Object.fromEntries(Object.entries(CHARS).map(([kk, v]) => [kk, v.label])), () => charId, (v) => loadChar(v));
segmented(panes.light, '场景', Object.fromEntries(Object.entries(PRESETS).map(([kk, v]) => [kk, v.label])), () => preset, applyPreset);
slider(panes.light, '光源方位', () => light.az, (v) => { light.az = v; applyLightAngles(); }, -180, 180);
slider(panes.light, '光源仰角', () => light.el, (v) => { light.el = v; applyLightAngles(); }, 5, 80);
slider(panes.light, '主光强度', () => light.intensity, (v) => { light.intensity = v; applyLightAngles(); }, 0.2, 5);
slider(panes.light, '边缘光', () => light.rim, (v) => { light.rim = v; applyLightAngles(); }, 0, 3);
slider(panes.light, '辉光', () => light.bloom, (v) => { light.bloom = v; applyLightAngles(); }, 0, 0.8);
slider(panes.light, '背景虚化', () => bgBlur, (v) => { bgBlur = v; clearTimeout(bgBlurT); bgBlurT = setTimeout(refreshBackdrop, 120); }, 0, 1);
toggle(panes.light, '实时阴影', () => quality.shadows, (v) => { quality.shadows = v; applyQuality(); });
toggle(panes.light, '镜面地台', () => quality.mirror, (v) => { quality.mirror = v; applyQuality(); });

// — 表情·姿势 —
segmented(panes.act, '表情', EXPRS, () => (exprWeight < 0.05 ? 'neutral' : expr), (v) => {
  if (v === 'neutral') exprWeight = 0;
  else { expr = v; if (exprWeight < 0.05) exprWeight = 0.55; }
});
slider(panes.act, '表情强度', () => exprWeight, (v) => { exprWeight = v; }, 0, 1);
segmented(panes.act, '姿势', Object.fromEntries(Object.entries(POSES).map(([kk, v]) => [kk, v.label])), () => poseName, setPose);

// — 色彩 —
slider(panes.dye, '发色', () => dyes.hair, (v) => { dyes.hair = v; applyDye('hair'); }, 0, 360, true);
slider(panes.dye, '瞳色', () => dyes.eyes, (v) => { dyes.eyes = v; applyDye('eyes'); }, 0, 360, true);
slider(panes.dye, '服装', () => dyes.cloth, (v) => { dyes.cloth = v; applyDye('cloth'); }, 0, 360, true);

// — 完成 —
let charName = '紗夜';
{
  const row = mk('div', 'row', panes.finish);
  mk('label', '', row).textContent = '名字';
  const inp = mk('input', 'name', row);
  inp.type = 'text'; inp.maxLength = 12; inp.value = charName;
  inp.addEventListener('input', () => { charName = inp.value || '???'; });
  syncFns.push(() => { inp.value = charName; });
}
toggle(panes.finish, '自动旋转', () => autoRotate, (v) => { autoRotate = v; });
action(panes.finish, '📷 拍照（当前构图）', () => {
  camera.clearViewOffset();
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  updateViewOffset();
  const a = document.createElement('a');
  a.download = `${charName}-photo.png`;
  a.href = url;
  a.click();
  toast('照片已保存');
});
action(panes.finish, '🔗 复制分享链接', async () => {
  location.hash = encodeState();
  try { await navigator.clipboard.writeText(location.href); toast('链接已复制 — 发给任何人还原这一幕'); }
  catch { toast('链接已写入地址栏'); }
});
{
  const cred = mk('div', 'row col', panes.finish);
  cred.style.marginTop = '18px';
  cred.innerHTML = `<label>致谢 · Credits</label>
    <div style="font-size:11px;line-height:1.7;color:rgba(242,234,217,0.45)">
      角色模型：VRoid Studio 官方样例（紫乃 / 维塔 / 文莉椰），CC0，授权信息内嵌于 .vrm 文件<br>
      背景·纹章·卡框：AI 生成（Gemini 3 Pro Image via OpenRouter），由本工房定制指令绘制<br>
      渲染：three.js + @pixiv/three-vrm · 灯光/舞台/导演系统：Claude (Fable 5) 手写
    </div>`;
}

showTab('light');
ui.sync();

$('#next').addEventListener('click', () => {
  const i = TABS.findIndex((t) => t.id === activeTab);
  if (i < TABS.length - 1) showTab(TABS[i + 1].id);
  else exportCard();
});
$('#rand').addEventListener('click', () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  applyPreset(pick(Object.keys(PRESETS)));
  setPose(pick(Object.keys(POSES)));
  expr = pick(Object.keys(EXPRS).filter((e2) => e2 !== 'neutral'));
  exprWeight = 0.3 + Math.random() * 0.7;
  for (const g of ['hair', 'eyes', 'cloth']) { dyes[g] = Math.floor(Math.random() * 360); applyDye(g); }
  ui.sync();
});

// ------------------------------------------------------- share-link state --
function encodeState() {
  const s = { c: charId, p: preset, l: { ...light }, o: poseName, e: expr, w: +exprWeight.toFixed(2), d: { ...dyes }, n: charName, b: +bgBlur.toFixed(2) };
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}
function decodeState(hash) {
  try { return JSON.parse(decodeURIComponent(escape(atob(hash)))); } catch { return null; }
}
function applyState(s) {
  if (!s) return;
  if (s.p) applyPreset(s.p);
  if (s.l) { Object.assign(light, s.l); applyLightAngles(); }
  if (s.o) setPose(s.o);
  if (s.e) expr = s.e;
  if (typeof s.w === 'number') exprWeight = s.w;
  if (s.d) { Object.assign(dyes, s.d); for (const g of ['hair', 'eyes', 'cloth']) applyDye(g); }
  if (s.n) charName = s.n;
  if (typeof s.b === 'number') { bgBlur = s.b; refreshBackdrop(); }
  ui.sync();
}

// ------------------------------------------------------------ card --------
const frameImg = new Image();
frameImg.src = './assets/card-frame.png';
function makeCard() {
  camera.clearViewOffset();
  composer.render();
  const shot = renderer.domElement;
  const W = 1000, H = 1500;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#171021';
  g.fillRect(0, 0, W, H);
  if (frameImg.complete) g.drawImage(frameImg, 0, 0, W, H);
  const win = { x: W * 0.115, y: H * 0.135, w: W * 0.77, h: H * 0.70 };
  const sw = shot.width, sh = shot.height;
  const band = Math.min(sw * 0.62, sh * (win.w / win.h));
  g.drawImage(shot, (sw - band) / 2, 0, band, band * (win.h / win.w), win.x, win.y, win.w, win.h);
  g.fillStyle = '#f4e8d8';
  g.font = '500 76px Georgia, "Hiragino Mincho ProN", serif';
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 12;
  g.fillText(charName, W / 2, H - 168);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(240,220,190,0.55)';
  g.font = '22px Georgia, serif';
  g.fillText('桜の工房・弐 — SAKURA ATELIER II', W / 2, H - 122);
  updateViewOffset();
  return cv;
}
function exportCard() {
  const a = document.createElement('a');
  a.download = `${charName}-card.png`;
  a.href = makeCard().toDataURL('image/png');
  a.click();
}

// ------------------------------------------------------------- loop -------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (autoRotate) { rotY += dt * 0.28; rotVel = dt * 0.28; }
  charGroup.rotation.y = rotY;
  const focus = 1 - THREE.MathUtils.smoothstep(dist, 0.85, 1.9);
  const targetY = THREE.MathUtils.lerp(frameBody, frameFace, focus);
  camera.position.set(
    Math.sin(t * 0.21) * 0.014,
    targetY + Math.sin(camPitch) * dist + Math.sin(t * 0.34) * 0.007,
    Math.cos(camPitch) * dist);
  camera.lookAt(0, targetY, 0);
  // eyes follow the camera only while the face could plausibly see it
  if (vrm?.lookAt) {
    const rel = ((rotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = rel > Math.PI ? rel - Math.PI * 2 : rel;
    vrm.lookAt.target = Math.abs(facing) < 1.25 ? camera : null;
  }
  emblem.material.opacity = 0.34 + Math.sin(t * 1.1) * 0.05;
  beams.rotation.z = Math.sin(t * 0.09) * 0.05;
  updatePetals(t, dt);
  animateVRM(t, dt);
  composer.render();
});

// ------------------------------------------------------------ harness -----
window.__a2 = {
  ready: false,
  get vrm() { return vrm; },
  camera, scene, renderer,
  applyPreset, setPose, loadChar, encodeState, applyState,
  cardDataURL: () => makeCard().toDataURL('image/png'),
  setExpr(name, w) { expr = name; exprWeight = w ?? 0.6; },
  setDye(g2, v) { dyes[g2] = v; applyDye(g2); },
  get preset() { return preset; },
  get pose() { return poseName; },
  get charId() { return charId; },
  set rotY(v) { rotY = v; },
  get rotY() { return rotY; },
};

// ------------------------------------------------------------- boot -------
const hashState = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
applyPreset(q.get('preset') || hashState?.p || 'dusk');
loadChar(q.get('char') || hashState?.c || 'shino').then(() => {
  if (hashState) applyState(hashState);
}).catch((e) => { pct.textContent = '召喚失败 — ' + e; console.error(e); });
