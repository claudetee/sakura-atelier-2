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
  textureWidth: 1024, textureHeight: 1024, color: 0x4c4658,
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
  new THREE.ShadowMaterial({ opacity: 0.32 }));
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

// ---------------- grounding: per-foot contact shadow blobs -----------------
const contactBlobs = {};
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g2 = c.getContext('2d');
  const rg = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
  rg.addColorStop(0.0, 'rgba(8,5,12,0.62)');
  rg.addColorStop(0.4, 'rgba(8,5,12,0.34)');
  rg.addColorStop(1.0, 'rgba(8,5,12,0)');
  g2.fillStyle = rg;
  g2.fillRect(0, 0, 128, 128);
  const blobTex = new THREE.CanvasTexture(c);
  for (const side of ['left', 'right']) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.20, 0.34), // 鞋印椭圆
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.42 }));
    m.rotation.order = 'YXZ';
    m.renderOrder = 3;
    m.visible = false;
    scene.add(m);
    contactBlobs[side] = m;
  }
}
const _blobW = new THREE.Vector3();
function updateContactBlobs() {
  if (!vrm || !legIK.ready || vrm.scene.parent !== charGroup) {
    contactBlobs.left.visible = contactBlobs.right.visible = false;
    return;
  }
  for (const side of ['left', 'right']) {
    const blob = contactBlobs[side];
    const foot = legIK[side].foot;
    foot.updateWorldMatrix(true, false);
    foot.getWorldPosition(_blobW);
    const lift = Math.max(0, _blobW.y - legIK.ankleRestY);
    const fade = Math.max(0, 1 - lift / 0.22);
    blob.material.opacity = 0.42 * fade * fade;
    blob.visible = blob.material.opacity > 0.01;
    const s = 1 + lift * 1.8;
    blob.scale.set(s, s, 1);
    blob.position.set(_blobW.x + Math.sin(rotY) * 0.05, 0.012, _blobW.z + Math.cos(rotY) * 0.05);
    blob.rotation.set(-Math.PI / 2, rotY, 0);
  }
}

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
  // rest 每模型只测一次 — 缓存模型的 hips.position 带着上一帧 idle 的 sink,
  // 直接重取会导致来回换装单调下沉 (验证工作流实测: 4 个来回沉 3cm)
  if (hipsNode && !vrm.scene.userData.hipsRest) vrm.scene.userData.hipsRest = hipsNode.position.clone();
  hipsRest = hipsNode ? vrm.scene.userData.hipsRest.clone() : null;
  setupLegIK(); // 每个模型腿长不同, 换装重新量
  if (vrm.lookAt) { vrm.lookAt.target = gazeTarget; gazeTarget.position.copy(camera.position); }
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
      frameBody = headY * 0.60;
    }
  }
  for (const g of ['hair', 'eyes', 'cloth']) if (dyes[g]) applyDye(g);
  loadEl.style.opacity = '0';
  firstLoad = false;
  window.__a2.ready = true;
  ui.sync?.();
}

// ----------------------------------------------------- pose + idle life ---
const POSE_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'];
const POSES = {
  relax: {
    label: '自然',
    // 去对称化: 右臂略前略松, 左臂略后略贴身, 肩高差, 头 2° 左倾微右转
    leftUpperArm: [-0.03, 0, 1.16], rightUpperArm: [0.06, 0, -1.08],
    leftLowerArm: [0.05, 0, 0.13], rightLowerArm: [0.11, 0, -0.20],
    leftHand: [0.04, 0, 0.06], rightHand: [0.07, 0, -0.10],
    leftShoulder: [0, 0, 0.018], rightShoulder: [0, 0, 0.012],
    spine: [0.01, 0.03, -0.008], chest: [0.008, 0.02, 0],
    neck: [-0.01, -0.02, -0.012], head: [-0.015, -0.045, 0.035],
  },
  greet: { label: '打招呼', fingers: [1, 0.25], leftUpperArm: [-0.03, 0, 1.16], rightUpperArm: [0.15, 0, 0.35], rightLowerArm: [0, 0, 1.85], rightHand: [0, 0, 0.25], head: [0, 0, 0.10], spine: [0, 0, 0.05] },
  elegant: { label: '优雅', fingers: [1.1, 1.1], leftUpperArm: [0.42, 0.35, 1.02], rightUpperArm: [0.42, -0.35, -1.02], leftLowerArm: [0, 1.15, 0.55], rightLowerArm: [0, -1.15, -0.55], head: [0.06, 0, 0], spine: [-0.03, 0, 0] },
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
let poseName = (q.get('pose') && POSES[q.get('pose')]) ? q.get('pose') : 'relax';
const poseCurrent = {};
for (const b of POSE_BONES) poseCurrent[b] = new THREE.Euler();
function setPose(name) { if (POSES[name]) poseName = name; ui.sync?.(); }

// ================= grounding: two-bone leg IK (feet pinned to floor) =========
// 轴向为实测: rotateVRM0 后 normalized rig 局部系相对世界 yaw 翻转 —
// 屈髋 = upperLeg.rotation.x 正 / 屈膝 = lowerLeg.rotation.x 负。rest 腿链非共线,
// 用 rest 几何闭式解, 实测 50mm 下沉时踝钉位误差 < 0.0001。
const legIK = { ready: false };
const _ikV0 = new THREE.Vector3(), _ikV1 = new THREE.Vector3(), _ikV2 = new THREE.Vector3();
const _ikQ0 = new THREE.Quaternion(), _ikQ2 = new THREE.Quaternion();
const IK_X = new THREE.Vector3(1, 0, 0);

function setupLegIK() {
  legIK.ready = false;
  if (!vrm || !hipsRest) return;
  const h = vrm.humanoid;
  for (const side of ['left', 'right']) {
    const upper = h.getNormalizedBoneNode(side + 'UpperLeg');
    const lower = h.getNormalizedBoneNode(side + 'LowerLeg');
    const foot = h.getNormalizedBoneNode(side + 'Foot');
    if (!upper || !lower || !foot) return; // 缺骨骼的模型不启用
    const pU = upper.position.clone();
    const a = lower.position.clone();
    const b = foot.position.clone();
    const ankleRest = hipsRest.clone().add(pU).add(a).add(b);
    const C = a.y * b.y + a.z * b.z;
    const Sx = a.z * b.y - a.y * b.z;
    legIK[side] = {
      upper, lower, foot, pU, a, b, ankleRest,
      a2: a.lengthSq(), b2: b.lengthSq(), axbx: a.x * b.x,
      hyp: Math.hypot(C, Sx), phi0: Math.atan2(Sx, C),
      restD: a.clone().add(b).length(),
    };
    if (legIK[side].hyp < 1e-6) return; // 退化腿链 (纯X向) 无解, 不启用
  }
  legIK.ankleRestY = legIK.left.ankleRest.y;
  legIK.ready = true;
}

function solveLeg(S, hipsNode) {
  _ikQ0.copy(hipsNode.quaternion).invert();
  _ikV0.copy(S.pU).applyQuaternion(hipsNode.quaternion).add(hipsNode.position);
  _ikV1.copy(S.ankleRest).sub(_ikV0).applyQuaternion(_ikQ0);
  const D = Math.min(_ikV1.length(), S.restD * 0.9999); // 永不过伸
  const K = (D * D - S.a2 - S.b2) / 2;
  const cosArg = THREE.MathUtils.clamp((K - S.axbx) / S.hyp, -1, 1);
  const delta = S.phi0 - Math.acos(cosArg); // 负分支 = 屈膝 (实测)
  S.lower.quaternion.setFromAxisAngle(IK_X, delta);
  _ikV2.copy(S.b).applyQuaternion(S.lower.quaternion).add(S.a).normalize();
  S.upper.quaternion.setFromUnitVectors(_ikV2, _ikV1.normalize());
  // 脚: 恢复 rest 世界朝向 → 脚掌永远水平 (自动补偿全链含 hips 侧倾)
  _ikQ2.copy(hipsNode.quaternion).multiply(S.upper.quaternion).multiply(S.lower.quaternion);
  S.foot.quaternion.copy(_ikQ2.invert());
}

// ---- organic idle: φ-spaced sum-of-sines ≈ band-limited 1/f noise ----
function n3(t, f, s) {
  return 0.55 * Math.sin(f * t + s)
       + 0.30 * Math.sin(f * 2.618 * t + s * 1.618 + 1.7)
       + 0.15 * Math.sin(f * 6.854 * t + s * 2.618 + 3.1);
}
// 左手静息弯曲 (实测 30 根骨全存在); 右手镜像 = y/z 取反、x 不变
const FINGER_REST = [
  ['ThumbMetacarpal', -0.06, -0.20, 0],
  ['ThumbProximal', 0, -0.15, 0],
  ['ThumbDistal', 0, -0.15, 0],
  ['IndexProximal', 0, -0.03, 0.22], ['IndexIntermediate', 0, 0, 0.28], ['IndexDistal', 0, 0, 0.16],
  ['MiddleProximal', 0, 0, 0.26], ['MiddleIntermediate', 0, 0, 0.32], ['MiddleDistal', 0, 0, 0.18],
  ['RingProximal', 0, 0.02, 0.30], ['RingIntermediate', 0, 0, 0.36], ['RingDistal', 0, 0, 0.20],
  ['LittleProximal', 0, 0.05, 0.34], ['LittleIntermediate', 0, 0, 0.40], ['LittleDistal', 0, 0, 0.22],
];
const fingerCur = { left: 1, right: 1 };
function applyFingers(h, ti, k, tgtL, tgtR) {
  fingerCur.left += (tgtL - fingerCur.left) * k;
  fingerCur.right += (tgtR - fingerCur.right) * k;
  const wob = { left: 1 + 0.10 * n3(ti, 0.21, 12.3), right: 1 + 0.10 * n3(ti, 0.24, 7.1) };
  for (const side of ['left', 'right']) {
    const mir = side === 'left' ? 1 : -1;
    const m = fingerCur[side] * wob[side];
    for (const [bn, x, y, z] of FINGER_REST) {
      const node = h.getNormalizedBoneNode(side + bn);
      if (node) node.rotation.set(x * m, y * m * mir, z * m * mir);
    }
  }
}

const EXPRS = { neutral: '淡然', happy: '开心', angry: '生气', sad: '哀伤', relaxed: '惬意' };
let expr = 'happy';
let exprWeight = 0.42;

// ===================================================== facial acting v2 ===
// 通道 = three-vrm 归一化名 (VRM0: joy→happy, fun→relaxed, sorrow→sad,
// A/I/U/E/O→aa/ih/ou/ee/oh)。setValue 对缺失通道静默忽略。
const FACIAL_CHANNELS = ['happy', 'relaxed', 'angry', 'sad', 'aa', 'ih', 'ou', 'ee', 'oh'];
const CHANNEL_CAP = { happy: 0.50, relaxed: 0.70, angry: 0.80, sad: 0.80,
                      aa: 0.12, ih: 0.14, ou: 0.14, ee: 0.14, oh: 0.12 };
function slowNoise(t, seed) {
  return 0.50 * Math.sin(t * 0.37 + seed)
       + 0.35 * Math.sin(t * 0.91 + seed * 1.71)
       + 0.15 * Math.sin(t * 1.53 + seed * 2.93);
}
const EXPR_RECIPES = {
  neutral: {
    layers: [{ n: 'relaxed', base: 0.08, wobble: 0.040, speed: 1.0 },
             { n: 'happy', base: 0.05, wobble: 0.030, speed: 0.7 }],
    lidBase: 0.05, awayEvery: [6, 15], gazeDown: 0,
  },
  happy: {
    layers: [{ n: 'happy', base: 0.22, wobble: 0.080, speed: 1.0 },
             { n: 'relaxed', base: 0.30, wobble: 0.060, speed: 0.8 }],
    lidBase: 0.0, awayEvery: [8, 18], gazeDown: 0,
  },
  angry: {
    layers: [{ n: 'angry', base: 0.64, wobble: 0.070, speed: 1.25 },
             { n: 'ih', base: 0.09, wobble: 0.020, speed: 1.25 }],
    lidBase: 0.06, awayEvery: [5, 11], gazeDown: 0,
  },
  sad: {
    layers: [{ n: 'sad', base: 0.48, wobble: 0.060, speed: 0.65 },
             { n: 'ou', base: 0.05, wobble: 0.020, speed: 0.65 }],
    lidBase: 0.14, awayEvery: [3.5, 8], gazeDown: 0.10,
  },
  relaxed: {
    layers: [{ n: 'relaxed', base: 0.42, wobble: 0.070, speed: 0.55 },
             { n: 'happy', base: 0.10, wobble: 0.040, speed: 0.55 }],
    lidBase: 0.18, awayEvery: [7, 16], gazeDown: 0.03,
  },
};
function activeRecipe() {
  return EXPR_RECIPES[exprWeight < 0.05 ? 'neutral' : expr] || EXPR_RECIPES.neutral;
}

// --- 眨眼: 泊松间隔 + 非对称包络(快闭慢开) + 15% 双连眨 + 事件联动 ---
const blinkCtl = {
  next: 2.2, phase: -1, env: 0, dbl: false, lastEnd: -10,
  poisson() { return THREE.MathUtils.clamp(-Math.log(1 - Math.random()) * 4.0, 1.2, 9.0); },
  trigger(force = false) {
    if (this.phase >= 0) return;
    if (!force && facial.tNow - this.lastEnd < 0.45) return;
    this.phase = 0; this.dbl = false;
  },
  update(t, dt) {
    if (this.phase < 0 && t >= this.next) { this.phase = 0; this.dbl = Math.random() < 0.15; }
    if (this.phase < 0) { this.env = 0; return; }
    this.phase += dt / 0.34;
    const p = this.phase;
    if (p < 0.22) { const x = p / 0.22; this.env = x * x * (3 - 2 * x); }
    else if (p < 0.34) this.env = 1;
    else if (p < 1) { const x = (p - 0.34) / 0.66; this.env = Math.pow(1 - x, 2.2); }
    else {
      this.env = 0; this.phase = -1; this.lastEnd = t;
      this.next = this.dbl ? t + 0.20 + Math.random() * 0.08 : t + this.poisson();
      this.dbl = false;
    }
  },
};

// --- 微表情: 每 8~20s 一个 0.4~0.65s 的口部低权重脉冲 ---
const microCtl = {
  next: 6 + Math.random() * 8, name: null, w: 0, dur: 0.5, phase: 0, val: 0,
  pool: ['ih', 'ou', 'ee', 'oh', 'aa'],
  update(t, dt) {
    if (!this.name && t >= this.next) {
      this.name = this.pool[(Math.random() * this.pool.length) | 0];
      this.w = 0.06 + Math.random() * 0.06;
      if (this.name === 'aa') this.w = Math.min(this.w, 0.08);
      this.dur = 0.40 + Math.random() * 0.25;
      this.phase = 0;
    }
    if (this.name) {
      this.phase += dt / this.dur;
      this.val = Math.sin(Math.min(this.phase, 1) * Math.PI);
      if (this.phase >= 1) { this.name = null; this.val = 0; this.next = t + 8 + Math.random() * 12; }
    }
  },
};

// --- 表情混合主控 ---
const facial = {
  cur: Object.fromEntries(FACIAL_CHANNELS.map((c) => [c, 0])),
  tgt: Object.fromEntries(FACIAL_CHANNELS.map((c) => [c, 0])),
  seeds: Object.fromEntries(FACIAL_CHANNELS.map((c, i) => [c, i * 7.13 + 1.7])),
  tNow: 0,
  onExpressionSwitch() { blinkCtl.trigger(true); gaze.kick(); },
  blinkNow() { blinkCtl.trigger(true); },
  update(em, t, dt, instant) {
    this.tNow = t;
    const recipe = activeRecipe();
    const neutralMode = exprWeight < 0.05;
    const scale = neutralMode ? 1 : THREE.MathUtils.clamp(exprWeight / 0.55, 0, 1.8);
    const tgt = this.tgt;
    for (const c of FACIAL_CHANNELS) tgt[c] = 0;
    for (const L of recipe.layers) {
      const nz = instant ? 0 : slowNoise(t * (L.speed ?? 1), this.seeds[L.n]);
      tgt[L.n] += L.base * scale + L.wobble * Math.min(scale, 1) * nz;
    }
    if (!instant) { microCtl.update(t, dt); if (microCtl.name) tgt[microCtl.name] += microCtl.w * microCtl.val; }
    const ke = instant ? 1 : 1 - Math.exp(-8 * dt);
    for (const c of FACIAL_CHANNELS) {
      const v = THREE.MathUtils.clamp(tgt[c], 0, CHANNEL_CAP[c]);
      this.cur[c] += (v - this.cur[c]) * ke;
      em.setValue(c, this.cur[c]);
    }
    if (!instant) blinkCtl.update(t, dt);
    const lid = recipe.lidBase * Math.min(scale, 1);
    const squint = Math.max(0.35, 1 - 0.45 * this.cur.happy - 0.30 * this.cur.relaxed);
    em.setValue('blink', THREE.MathUtils.clamp(
      lid + (1 - lid) * (instant ? 0 : blinkCtl.env) * squint, 0, 1));
  },
};

// --- 视线 saccade 状态机 + 虚拟注视点 ---
const gazeTarget = new THREE.Object3D();
gazeTarget.position.set(0, 1.35, 3);
scene.add(gazeTarget);
const _gv = { right: new THREE.Vector3(), up: new THREE.Vector3(),
              head: new THREE.Vector3(), base: new THREE.Vector3() };
const gaze = {
  mode: 'cam', nextSaccade: 1.2, returnAt: 0, nextAway: 9,
  off: new THREE.Vector2(), offCur: new THREE.Vector2(),
  wasFacing: true,
  kick() { this.nextSaccade = 0; },
  update(t, dt, facing) {
    if (!vrm?.lookAt) return;
    const headNode = vrm.humanoid.getNormalizedBoneNode('head');
    if (!headNode) return;
    headNode.getWorldPosition(_gv.head);
    vrm.lookAt.target = gazeTarget; // 永不设 null (null 会让眼球冻在最后角度)
    if (q.get('still')) { gazeTarget.position.copy(camera.position); return; }
    const isFacing = Math.abs(facing) < 1.25;
    if (isFacing !== this.wasFacing) this.wasFacing = isFacing; // 跨界眨眼取消: 交互后总看到闭眼帧
    if (isFacing) _gv.base.copy(camera.position);
    else {
      _gv.base.set(_gv.head.x + Math.sin(rotY) * 3, _gv.head.y, _gv.head.z + Math.cos(rotY) * 3);
      this.off.set(0, 0);
    }
    const d = Math.max(_gv.head.distanceTo(_gv.base), 0.5);
    const recipe = activeRecipe();
    if (isFacing && t >= this.nextSaccade) {
      if (this.mode === 'cam' && t >= this.nextAway) {
        this.mode = 'away';
        const yawDeg = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 12);
        const pitDeg = (Math.random() - 0.62) * 8;
        this.off.set(Math.tan(THREE.MathUtils.degToRad(yawDeg)) * d,
                     Math.tan(THREE.MathUtils.degToRad(pitDeg)) * d);
        this.returnAt = t + 0.5 + Math.random() * 0.7;
        this.nextSaccade = this.returnAt;
        const [a0, a1] = recipe.awayEvery;
        this.nextAway = this.returnAt + a0 + Math.random() * (a1 - a0);
        if (Math.abs(yawDeg) > 12 && Math.random() < 0.6) blinkCtl.trigger();
      } else if (this.mode === 'away') {
        this.mode = 'cam';
        this.off.set(0, 0);
        this.nextSaccade = t + 0.6 + Math.random() * 1.9;
      } else {
        const a = THREE.MathUtils.degToRad(0.6 + Math.random() * 1.6);
        const dir = Math.random() * Math.PI * 2;
        this.off.set(Math.cos(dir) * Math.tan(a) * d * 1.4,
                     (Math.sin(dir) * 0.55 - 0.30) * Math.tan(a) * d);
        this.nextSaccade = t + 0.6 + Math.random() * 1.9;
      }
    }
    const ks = 1 - Math.exp(-45 * dt);
    this.offCur.lerp(this.off, ks);
    const dr = Math.tan(THREE.MathUtils.degToRad(0.3)) * d;
    const dx = slowNoise(t * 2.1, 4.7) * dr;
    const dy = slowNoise(t * 1.7, 9.2) * dr * 0.7;
    const down = -Math.tan(recipe.gazeDown || 0) * d;
    _gv.right.setFromMatrixColumn(camera.matrixWorld, 0);
    _gv.up.setFromMatrixColumn(camera.matrixWorld, 1);
    gazeTarget.position.copy(_gv.base)
      .addScaledVector(_gv.right, this.offCur.x + dx)
      .addScaledVector(_gv.up, this.offCur.y + dy + down);
  },
};
// =================================================== end facial acting ====

function animateVRM(t, dt) {
  if (!vrm) return;
  const h = vrm.humanoid;
  const k = (q.get('still') || forceInstant) ? 1 : 1 - Math.exp(-10 * dt);
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
  // ---------------- layered organic idle ----------------
  const ti = q.get('still') ? 2.0 : t; // still 截图冻结在固定相位, 确定性
  const fp = target.fingers || [1, 1];
  applyFingers(h, ti, k, fp[0], fp[1]);
  const add = (name, x, y, z) => {
    const node = h.getNormalizedBoneNode(name);
    if (node) { node.rotation.x += x; node.rotation.y += y; node.rotation.z += z; }
  };
  // L1 呼吸 0.215Hz: 呼吸率漂移±1%, 吸快呼慢; neck 反补稳视线; 肩随吸气微抬
  const bp = 1.35 * ti + 0.35 * Math.sin(0.043 * ti);
  const b = Math.pow(0.5 + 0.5 * Math.sin(bp), 1.4);
  add('chest', 0.018 * (b - 0.4), 0, 0);
  add('upperChest', 0.010 * (b - 0.4), 0, 0);
  add('spine', 0.006 * (b - 0.4), 0, 0);
  add('neck', -0.009 * (b - 0.4), 0, 0);
  add('leftShoulder', 0, 0, -0.012 * b);
  add('rightShoulder', 0, 0, 0.012 * b);
  // L2 重心转移 contrapposto: 髋横移+髋滚 → 胸反滚 → 头再反补(眼睛保持水平)
  const w = n3(ti, 0.10, 0.0);
  const wy = n3(ti, 0.07, 9.2);
  const hips = h.getNormalizedBoneNode('hips');
  if (hips && hipsRest) {
    hips.rotation.z += 0.020 * w;
    hips.rotation.y += 0.014 * wy;
    // 纯下沉式呼吸: rest(直腿)为上限, 6.0~8.5mm, 与胸呼吸锁相 — 腿部 IK 弯膝消化,
    // 双脚永远钉地 (旧 ±4mm 正弦上浮是"悬浮感"的直接来源, 已废)
    const sink = 0.006 + 0.0025 * (1 - b);
    hips.position.set(hipsRest.x + 0.011 * w, hipsRest.y - sink, hipsRest.z);
  }
  add('chest', 0, -0.009 * wy, -0.013 * w);
  add('neck', 0, 0, -0.004 * w);
  add('head', 0, 0, -0.005 * w);
  // L3 姿态微噪声: 每骨骼独立频率/seed, 头部(注意力)最大
  add('spine', 0, 0.008 * n3(ti, 0.23, 2.7), 0.005 * n3(ti, 0.19, 5.1));
  add('chest', 0.006 * n3(ti, 0.26, 7.7), 0.007 * n3(ti, 0.17, 7.9), 0);
  add('neck', 0.008 * n3(ti, 0.27, 8.4), 0.012 * n3(ti, 0.31, 3.9), 0.005 * n3(ti, 0.33, 0.8));
  add('head', 0.010 * n3(ti, 0.37, 6.6), 0.022 * n3(ti, 0.13, 1.3), 0.008 * n3(ti, 0.29, 4.4));
  add('leftUpperArm', 0.010 * n3(ti, 0.14, 3.3), 0, 0.015 * n3(ti, 0.15, 2.2));
  add('rightUpperArm', 0.010 * n3(ti, 0.16, 8.8), 0, -0.015 * n3(ti, 0.15, 5.8));
  add('leftHand', 0, 0, 0.02 * n3(ti, 0.19, 6.1));
  add('rightHand', 0, 0, -0.02 * n3(ti, 0.21, 1.9));

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

  // legs: IK pins both ankles to the floor whatever the hips did (must run
  // before vrm.update copies normalized→raw)
  if (legIK.ready && hips) { solveLeg(legIK.left, hips); solveLeg(legIK.right, hips); }

  const em = vrm.expressionManager;
  if (em) facial.update(em, t, dt, !!q.get('still') || forceInstant);
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
const dyePending = new Set();
let dyeScheduled = false;
function applyDye(groupName) { // rAF-coalesced: N clicks per frame = 1 re-render
  dyePending.add(groupName);
  if (dyeScheduled) return;
  dyeScheduled = true;
  requestAnimationFrame(() => {
    dyeScheduled = false;
    const batch = [...dyePending];
    dyePending.clear();
    for (const g of batch) applyDyeNow(g);
  });
}
function applyDyeNow(groupName) {
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
let rotY = q.get('still') ? 0 : 0.3, rotVel = 0, camPitch = 0.15, dist = 2.9;
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
    facial.blinkNow();
    gaze.kick();
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
  facial.onExpressionSwitch();
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
  facial.onExpressionSwitch();
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
  // eyes: saccade 导演接管 (facing 门在 gaze 内部处理, 永不置 null)
  if (vrm?.lookAt) {
    const rel = ((rotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = rel > Math.PI ? rel - Math.PI * 2 : rel;
    gaze.update(t, dt, facing);
  }
  emblem.material.opacity = 0.34 + Math.sin(t * 1.1) * 0.05;
  beams.rotation.z = Math.sin(t * 0.09) * 0.05;
  updatePetals(t, dt);
  animateVRM(t, dt);
  updateContactBlobs();
  composer.render();
});

// ------------------------------------------------------------ harness -----
window.__a2 = {
  ready: false,
  get vrm() { return vrm; },
  camera, scene, renderer,
  applyPreset, setPose, loadChar, encodeState, applyState,
  cardDataURL: () => makeCard().toDataURL('image/png'),
  setExpr(name, w) { expr = name; exprWeight = w ?? 0.6; facial.onExpressionSwitch(); },
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
