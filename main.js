import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { defaultParams, withLegLength, findGait, swingPendulumPeriod, Runner } from './sim.js';
import { buildWalker, poseWalker, buildRamp, applyPartAssets } from './walker.js';

const $ = (id) => document.getElementById(id);

// ---------- params & gait ----------
let params = defaultParams();
let gait = null, lastGuess = null, lastL = params.l;
const ui = { playing: true, speed: 0.5, knees: true, follow: true };

function solveGait() {
  let guess = lastGuess && Math.abs(lastL - params.l) < 1e-9 ? lastGuess : null;
  let g = findGait(params, guess || undefined);
  if (!g.ok && guess) g = findGait(params);
  if (g.ok) { lastGuess = g.x; lastL = params.l; }
  gait = g;
  return g;
}

// ---------- three.js scene ----------
const canvas = $('three');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
const scene = new THREE.Scene();
const bgColor = new THREE.Color(0x0b1530);
scene.background = bgColor;
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
camera.position.set(0.25, 0.35, 0.9);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.2, 0.1, 0); controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x30203a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(1, 2, 1.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
scene.add(sun);
const grid = new THREE.GridHelper(6, 60, 0x2a3a72, 0x16224a); grid.position.y = -0.6; scene.add(grid);

// "world" holds ramp + walker so AR can place it as one unit
const world = new THREE.Group(); scene.add(world);
let ramp = null, walker = null;
const RAMP_LEN = 2.0;

function rebuild() {
  if (ramp) world.remove(ramp);
  if (walker) world.remove(walker);
  ramp = buildRamp(params.gammaDeg, RAMP_LEN, Math.max(0.25, params.l * 0.9));
  walker = buildWalker(params.l);
  world.add(ramp, walker);
  applyPartAssets(walker).then((r) => { if (r.swapped.length) toast(`Loaded real parts: ${r.swapped.join(', ')}`); });
}

// ---------- runner ----------
let runner = null, phaseOfA = true, fellAt = 0;
function restart() {
  const g = solveGait();
  rebuild();
  const start = g.ok ? g.state : [-0.2, 2 * (params.gammaDeg * Math.PI) / 180 + 0.2, 1.0 / Math.sqrt(params.l), 0.4 / Math.sqrt(params.l)];
  runner = new Runner(params, start);
  runner.onStep = () => { phaseOfA = !phaseOfA; };
  phaseOfA = true; fellAt = 0;
  // fit the camera for this leg length (desktop only)
  if (!renderer.xr.isPresenting) {
    const L = params.l;
    controls.target.set(0, 0.45 * L, 0);
    camera.position.set(0.6 * L, 0.9 * L, 2.6 * L);
    grid.position.y = -Math.tan(params.gammaDeg * Math.PI / 180) * RAMP_LEN - 0.05;
  }
  updateReadouts();
}

function updateReadouts() {
  const g = gait;
  const half = swingPendulumPeriod(params) / 2;
  $('r-pend').textContent = `${half.toFixed(3)} s`;
  if (!g || !g.ok) {
    ['r-freq', 'r-period', 'r-res', 'r-len', 'r-rho'].forEach((id) => ($(id).textContent = '–'));
    $('status').textContent = 'No periodic gait found for these settings: watch it fail';
    return;
  }
  $('r-period').textContent = `${g.period.toFixed(3)} s`;
  $('r-freq').textContent = `${(1 / g.period).toFixed(2)} Hz`;
  const match = 100 * (1 - Math.abs(g.period - half) / half);
  $('r-res').textContent = `${match.toFixed(0)} %`;
  $('r-len').textContent = `${(g.stepLength * 100).toFixed(1)} cm`;
  $('r-rho').textContent = g.rho.toFixed(2);
  $('status').textContent = g.stable
    ? `Stable gait ✓ (|λ| = ${g.rho.toFixed(2)} < 1)`
    : `Unstable period-1 gait (|λ| = ${g.rho.toFixed(2)} > 1): expect period doubling, chaos or a fall`;
}

// ---------- phase portrait ----------
const pc = $('phase'), px = pc.getContext('2d');
function drawPhase() {
  const W = pc.width, H = pc.height;
  px.fillStyle = '#050a18'; px.fillRect(0, 0, W, H);
  px.strokeStyle = '#1d2a52'; px.beginPath(); px.moveTo(0, H / 2); px.lineTo(W, H / 2); px.moveTo(W / 2, 0); px.lineTo(W / 2, H); px.stroke();
  const h = runner.history; if (h.length < 2) return;
  const wmax = 3.4 / Math.sqrt(params.l / 0.25);
  const X = (t) => W / 2 + (t / 0.4) * (W / 2), Y = (w) => H / 2 - (w / wmax) * (H / 2) * 0.9;
  const n = h.length;
  for (let i = Math.max(1, n - 2500); i < n; i++) {
    const a = (i - (n - 2500)) / 2500;
    px.strokeStyle = `rgba(${Math.round(80 + 150 * a)},${Math.round(120 + 60 * a)},255,${0.25 + 0.75 * a})`;
    px.beginPath(); px.moveTo(X(h[i - 1][0]), Y(h[i - 1][1])); px.lineTo(X(h[i][0]), Y(h[i][1])); px.stroke();
  }
  const last = h[n - 1]; px.fillStyle = '#ff4fa8'; px.beginPath(); px.arc(X(last[0]), Y(last[1]), 4, 0, 7); px.fill();
  px.fillStyle = '#8fa0c8'; px.font = '12px system-ui'; px.fillText('θ stance →', W - 70, H / 2 - 4); px.fillText('θ̇', W / 2 + 4, 12);
}

// ---------- animate ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (ui.playing && runner) {
    runner.advance(dt * ui.speed);
    if (runner.fell) {
      if (!fellAt) { fellAt = performance.now(); $('status').textContent = 'Fell! Restarting…'; }
      else if (performance.now() - fellAt > 2000) restart();
    }
    // loop back to the top of the ramp
    if (runner.foot[0] > (RAMP_LEN - 0.4) * Math.cos(params.gammaDeg * Math.PI / 180)) runner.foot = [0, 0];
  }
  if (runner && walker) {
    const [t1, t2] = runner.s; const L = params.l;
    const hip = [runner.foot[0] + L * Math.sin(t1), runner.foot[1] + L * Math.cos(t1)];
    // visual knee flex on the swing leg only (compass-gait model has straight legs)
    const T = gait && gait.ok ? gait.period : 0.4 * Math.sqrt(L / 0.25);
    const ph = Math.min(1, runner.t / T);
    const flex = ui.knees && !runner.fell ? 0.55 * Math.sin(Math.PI * ph) : 0;
    const thA = phaseOfA ? t1 : t2, thB = phaseOfA ? t2 : t1;
    poseWalker(walker, hip, thA, thB, phaseOfA ? 0 : flex, phaseOfA ? flex : 0);
    // desktop camera follows the walker down the ramp
    if (!renderer.xr.isPresenting && ui.follow) {
      const dx = (hip[0] - controls.target.x) * 0.08, dy = (hip[1] - 0.45 * L - controls.target.y) * 0.08;
      controls.target.x += dx; camera.position.x += dx; controls.target.y += dy; camera.position.y += dy;
    }
  }
  if (!renderer.xr.isPresenting) { controls.update(); drawPhase(); }
  else updateAR();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));
if ('ResizeObserver' in window) new ResizeObserver(() => resize()).observe(canvas.parentElement);

// ---------- UI wiring ----------
function bindSlider(id, valId, get, set, fmt = (v) => v) {
  const el = $(id); el.value = get(); $(valId).textContent = fmt(get());
  el.addEventListener('input', () => { $(valId).textContent = fmt(+el.value); });
  el.addEventListener('change', () => { set(+el.value); });
}
bindSlider('gamma', 'gval', () => params.gammaDeg, (v) => { params.gammaDeg = v; syncAR(); restart(); }, (v) => (+v).toFixed(1));
bindSlider('leglen', 'lval', () => Math.round(params.l * 100), (v) => { params = withLegLength(params, v / 100); restart(); });
bindSlider('massr', 'mval', () => params.mh / params.m, (v) => { params.mh = params.m * v; restart(); }, (v) => (+v).toFixed(1));
bindSlider('speed', 'sval', () => ui.speed, (v) => { ui.speed = v; }, (v) => (+v).toFixed(2));
$('speed').addEventListener('input', (e) => (ui.speed = +e.target.value));
function togglePlay() { ui.playing = !ui.playing; $('play').textContent = $('ar-play').textContent = ui.playing ? 'Pause' : 'Play'; }
$('play').onclick = togglePlay; $('ar-play').onclick = togglePlay;
function push() { if (runner && !runner.fell) { runner.s[2] *= 1.12; runner.s[3] += 0.4 / Math.sqrt(params.l / 0.25); } }
$('push').onclick = push; $('ar-push').onclick = push;
$('reset').onclick = restart;
$('knees').onchange = (e) => (ui.knees = e.target.checked);
function setSliders() {
  $('gamma').value = params.gammaDeg; $('gval').textContent = params.gammaDeg.toFixed(1);
  $('leglen').value = Math.round(params.l * 100); $('lval').textContent = Math.round(params.l * 100);
  $('massr').value = params.mh / params.m; $('mval').textContent = (params.mh / params.m).toFixed(1);
  syncAR();
}
function syncAR() { $('ar-gamma').value = params.gammaDeg; $('ar-gval').textContent = params.gammaDeg.toFixed(1); }
$('ar-gamma').addEventListener('input', (e) => ($('ar-gval').textContent = (+e.target.value).toFixed(1)));
$('ar-gamma').addEventListener('change', (e) => { params.gammaDeg = +e.target.value; setSliders(); restart(); });

document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
function showView(v) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
  if (v === 'lab') requestAnimationFrame(resize);
}

let toastTimer;
function toast(msg) { $('status').textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(updateReadouts, 3000); }

// ---------- lessons ----------
async function loadLessons() {
  const data = await (await fetch('lessons.json')).json();
  const list = $('lesson-list');
  list.innerHTML = `<div class="card"><h2>Resonant robots: passive dynamic walking</h2><p><b>Level:</b> ${data.level}</p><p class="muted">${data.note}</p></div>`;
  for (const L of data.lessons) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<h3>${L.title}</h3><p class="muted">${L.minutes} min · ${L.objectives.join(' · ')}</p><p>${L.body}</p>${L.grad ? `<p class="grad"><b>Graduate exercise.</b> ${L.grad}</p>` : ''}
      <p class="ph">${L.placeholder}</p>
      <div class="quiz"><b>Check:</b> ${L.quiz.q}${L.quiz.options.map((o, i) => `<button data-i="${i}">${o}</button>`).join('')}</div>
      <p><button class="primary try">Try it in the Walker Lab →</button></p>`;
    c.querySelectorAll('.quiz button').forEach((b) => (b.onclick = () => { b.classList.add(+b.dataset.i === L.quiz.answer ? 'right' : 'wrong'); }));
    c.querySelector('.try').onclick = () => {
      params = withLegLength({ ...params, gammaDeg: L.tryIt.gammaDeg }, L.tryIt.legLength);
      params.mh = params.m * L.tryIt.massRatio; lastGuess = null;
      setSliders(); restart();
      $('prompt').textContent = `${L.title}: ${L.tryIt.prompt}`; $('prompt').classList.add('on');
      showView('lab');
    };
    list.appendChild(c);
  }
}

// ---------- AR (WebXR, Android Chrome + ARCore) ----------
let xrHitSource = null, reticle = null, placed = false;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
async function initAR() {
  const btn = $('btn-ar');
  if (isIOS) {
    // iPhone/iPad: Safari has no WebXR; use Apple AR Quick Look with the animated USDZ
    btn.hidden = true; $('btn-ql').hidden = false;
    return;
  }
  const ok = navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));
  if (!ok) {
    const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // Android WebView (the APK) has no WebXR: live AR runs from the hosted web version in Chrome.
    const cfg = await fetch('config.json').then((r) => r.json()).catch(() => ({}));
    if (native && cfg.webUrl) { btn.disabled = false; btn.textContent = 'Live AR: open in Chrome'; btn.onclick = () => window.open(cfg.webUrl, '_system'); }
    else btn.textContent = native ? 'Live AR needs the web version in Chrome (see README)' : 'Live AR: use Chrome on an ARCore Android phone';
    return;
  }
  btn.disabled = false; btn.textContent = 'Start AR (live physics)';
  btn.onclick = startAR;
}
async function startAR() {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: $('ar-overlay') },
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  scene.background = null; grid.visible = false; world.visible = false; placed = false;
  $('ar-overlay').classList.add('on'); $('ar-hint').style.display = 'flex';
  if (!reticle) {
    reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f7bff }));
    reticle.matrixAutoUpdate = false; scene.add(reticle);
  }
  reticle.visible = false;
  const viewer = await session.requestReferenceSpace('viewer');
  xrHitSource = await session.requestHitTestSource({ space: viewer });
  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    // put the top of the ramp at the reticle; raise the world so the ramp's lowest end sits on the surface
    const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    const drop = Math.tan(params.gammaDeg * Math.PI / 180) * RAMP_LEN;
    world.position.set(p.x, p.y + drop + 0.02, p.z);
    const cam = renderer.xr.getCamera(); const yaw = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    world.rotation.set(0, yaw + Math.PI / 2, 0); // walker walks across the user's view
    world.visible = true; placed = true; $('ar-hint').style.display = 'none';
  });
  session.addEventListener('end', () => {
    xrHitSource = null; scene.background = bgColor; grid.visible = true; world.visible = true;
    world.position.set(0, 0, 0); world.rotation.set(0, 0, 0); $('ar-overlay').classList.remove('on'); resize(); restart();
  });
  $('ar-exit').onclick = () => session.end();
}
function updateAR() {
  const f = renderer.xr.getFrame(); if (!f || !xrHitSource || placed) { if (reticle && placed) reticle.visible = false; return; }
  const hits = f.getHitTestResults(xrHitSource);
  if (hits.length) { const pose = hits[0].getPose(renderer.xr.getReferenceSpace()); reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); }
  else reticle.visible = false;
}

// "View model in your space": <model-viewer> -> Scene Viewer (Android) / Quick Look (iOS)
$('btn-viewer').onclick = () => $('viewer-dlg').showModal();

// ---------- boot ----------
setSliders();
resize();
restart();
initAR();
loadLessons().then(() => { if (location.hash === '#lessons') showView('lessons'); });
window.__chance = { THREE, scene, camera, get walker() { return walker; }, get params() { return params; }, get gait() { return gait; }, get runner() { return runner; } };
