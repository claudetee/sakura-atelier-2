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
});

// ------------------------------------------------------------- stage ------
const texLoader = new THREE.TextureLoader();
const loadTex = (url) => { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; return t; };

const bgMat = new THREE.MeshBasicMaterial({ map: loadTex('./assets/bg-dusk.png'), color: 0xb8b0c0 });
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 8.66), bgMat);
backdrop.position.set(0, 2.3, -5.6);
scene.add(backdrop);

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
const bgCache = {};
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
  if (p.bg) {
    backdrop.visible = true;
    bgMat.map = bgCache[p.bg] || (bgCache[p.bg] = loadTex(p.bg));
    bgMat.needsUpdate = true;
  } else {
    backdrop.visible = false;
  }
  applyLightAngles();
  ui.sync?.();
}

// ---------------------------------------------------- the character bay ---
const CHARS = {
  shino: { label: '紫乃', url: './assets/shino.vrm' },
  vita: { label: '维塔', url: './assets/vita.vrm' },
  fumiriya: { label: '文椰・男', url: './assets/fumiriya.vrm' },
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
const pct = $('#load-pct');

async function loadChar(id) {
  if (!CHARS[id]) id = 'shino';
  charId = id;
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
  animateVRM(0.001, 0.016);
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
      frameBody = headY * 0.56;
    }
  }
  for (const g of ['hair', 'eyes', 'cloth']) if (dyes[g]) applyDye(g);
  loadEl.style.opacity = '0';
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
  lookback: { label: '回眸', hips: [0, 0.55, 0], spine: [0, 0.30, 0], neck: [0, 0.35, 0], head: [0.04, 0.28, 0], leftUpperArm: [0, 0, 1.13], rightUpperArm: [0, 0, -1.13] },
};
let poseName = 'relax';
const poseCurrent = {};
for (const b of POSE_BONES) poseCurrent[b] = new THREE.Euler();
function setPose(name) { if (POSES[name]) poseName = name; ui.sync?.(); }

const EXPRS = { neutral: '淡然', happy: '开心', angry: '生气', sad: '哀伤', relaxed: '惬意' };
let expr = 'happy';
let exprWeight = 0.55;
let blinkT = 2.4, blinkPhase = -1;

function animateVRM(t, dt) {
  if (!vrm) return;
  const h = vrm.humanoid;
  const k = q.get('still') ? 1 : 1 - Math.exp(-6 * dt);
  const target = POSES[poseName];
  for (const b of POSE_BONES) {
    const node = h.getNormalizedBoneNode(b);
    if (!node) continue;
    const tg = target[b] || [0, 0, 0];
    const cur = poseCurrent[b];
    cur.x += (tg[0] - cur.x) * k;
    cur.y += (tg[1] - cur.y) * k;
    cur.z += (tg[2] - cur.z) * k;
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

  const em = vrm.expressionManager;
  if (em) {
    for (const name of Object.keys(EXPRS)) {
      if (name === 'neutral') continue;
      em.setValue(name, name === expr ? exprWeight : 0);
    }
    if (blinkPhase < 0 && t > blinkT && !q.get('still')) blinkPhase = 0;
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.22;
      const v = blinkPhase < 0.45 ? blinkPhase / 0.45 : Math.max(0, 1 - (blinkPhase - 0.45) / 0.55);
      em.setValue('blink', v);
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
let rotY = q.get('still') ? 0 : 0.3, rotVel = 0, camPitch = 0.12, dist = 3.0;
let autoRotate = !q.get('still'), dragging = false, lastX = 0, lastY = 0;
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
dom.addEventListener('dblclick', () => { dist = dist > 1.4 ? 0.9 : 3.0; });

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
  inp.addEventListener('input', () => set(parseFloat(inp.value)));
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
    b.addEventListener('click', () => { set(kk); ui.sync(); });
    return b;
  });
  syncFns.push(() => btns.forEach((b, i) => b.classList.toggle('on', keys[i] === get())));
}
function toggle(parent, label, get, set) {
  const row = mk('div', 'row', parent);
  mk('label', '', row).textContent = label;
  const b = mk('button', 'tog', row);
  b.addEventListener('click', () => { set(!get()); ui.sync(); });
  syncFns.push(() => { b.textContent = get() ? 'ON' : 'OFF'; b.classList.toggle('on', get()); });
}
function action(parent, label, fn) {
  const row = mk('div', 'row', parent);
  const b = mk('button', 'tog on', row);
  b.style.marginLeft = '0';
  b.style.flex = '1';
  b.style.padding = '9px';
  b.textContent = label;
  b.addEventListener('click', fn);
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
  b.addEventListener('click', () => showTab(t.id));
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
  composer.render();
  const a = document.createElement('a');
  a.download = `${charName}-photo.png`;
  a.href = renderer.domElement.toDataURL('image/png');
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
  const s = { c: charId, p: preset, l: { ...light }, o: poseName, e: expr, w: +exprWeight.toFixed(2), d: { ...dyes }, n: charName };
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
  ui.sync();
}

// ------------------------------------------------------------ card --------
const frameImg = new Image();
frameImg.src = './assets/card-frame.png';
function exportCard() {
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
  g.fillStyle = 'rgba(240,220,190,0.6)';
  g.font = '25px Georgia, serif';
  g.fillText('桜の工房・弐 — SAKURA ATELIER II', W / 2, H - 100);
  const a = document.createElement('a');
  a.download = `${charName}-card.png`;
  a.href = cv.toDataURL('image/png');
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
  camera.position.set(0, targetY + Math.sin(camPitch) * dist, Math.cos(camPitch) * dist);
  camera.lookAt(0, targetY, 0);
  animateVRM(t, dt);
  composer.render();
});

// ------------------------------------------------------------ harness -----
window.__a2 = {
  ready: false,
  get vrm() { return vrm; },
  camera, scene, renderer,
  applyPreset, setPose, loadChar, encodeState, applyState,
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
