// Procedural XTI-style walker + ramp, with an STL->GLB asset-swap hook.
// Colours follow the photos on the Cults3D listing: blue hip frame, red legs.
import * as THREE from 'three';

export const COLORS = { pelvis: 0x1f4fd8, leg: 0xd62828, foot: 0xd62828, cord: 0x222222, ramp: 0xc9b38a, knee: 0xeeeeee };

function mat(c, opts = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...opts }); }

// One leg = hip pivot group -> thigh -> knee group -> shank -> foot.
// Pivot at the hip; leg hangs along -Y; total length = l.
function makeLeg(l, side) {
  const hip = new THREE.Group(); hip.name = `leg_${side}`;
  const w = l * 0.09, d = l * 0.06;
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(w, l / 2, d), mat(COLORS.leg));
  thigh.position.y = -l / 4; thigh.name = 'thigh'; thigh.castShadow = true;
  const knee = new THREE.Group(); knee.position.y = -l / 2; knee.name = `knee_${side}`;
  const kneeCap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.45, d * 1.4, 16), mat(COLORS.knee));
  kneeCap.rotation.x = Math.PI / 2;
  const shank = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, l / 2 - l * 0.04, d), mat(COLORS.leg));
  shank.position.y = -(l / 2 - l * 0.04) / 2; shank.name = 'shank'; shank.castShadow = true;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w * 0.9, l * 0.04, 20), mat(COLORS.foot));
  foot.position.y = -l / 2 + l * 0.02; foot.name = 'foot'; foot.castShadow = true;
  knee.add(kneeCap, shank, foot);
  hip.add(thigh, knee);
  hip.userData = { thigh, knee, shank, foot };
  return hip;
}

export function buildWalker(l = 0.25) {
  const root = new THREE.Group(); root.name = 'xti_walker';
  const hipAxle = new THREE.Group(); hipAxle.name = 'hip'; root.add(hipAxle);
  const half = l * 0.16; // lateral half-spacing of legs
  // pelvis "frame": a U-shaped box frame like the blue printed hip on the listing
  const pelvis = new THREE.Group(); pelvis.name = 'pelvis';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(l * 0.12, l * 0.05, half * 2.6), mat(COLORS.pelvis)); bar.position.y = l * 0.03;
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(l * 0.22, l * 0.09, l * 0.03), mat(COLORS.pelvis)); sideA.position.set(0, l * 0.06, half * 1.3);
  const sideB = sideA.clone(); sideB.position.z = -half * 1.3;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(l * 0.012, l * 0.012, half * 2.8, 12), mat(0x999999, { metalness: 0.8, roughness: 0.3 }));
  axle.rotation.x = Math.PI / 2;
  pelvis.add(bar, sideA, sideB, axle);
  pelvis.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  hipAxle.add(pelvis);
  const legA = makeLeg(l, 'A'); legA.position.z = half;
  const legB = makeLeg(l, 'B'); legB.position.z = -half;
  hipAxle.add(legA, legB);
  // elastic "bungee" cords (visual): pelvis to each knee
  const cordMat = new THREE.LineBasicMaterial({ color: COLORS.cord });
  const cords = [legA, legB].map((leg) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(g, cordMat); line.name = 'cord'; root.add(line); return { line, leg };
  });
  root.userData = { l, hipAxle, pelvis, legA, legB, cords };
  return root;
}

// Pose the walker from sim state. th = leg angle from vertical (rad), knee = visual flex.
export function poseWalker(w, hipPos, thA, thB, kneeA = 0, kneeB = 0) {
  const { hipAxle, legA, legB, cords } = w.userData;
  hipAxle.position.set(hipPos[0], hipPos[1], 0);
  legA.rotation.z = -thA; legB.rotation.z = -thB;
  legA.userData.knee.rotation.z = -kneeA; legB.userData.knee.rotation.z = -kneeB; // flexion swings the shank backward
  // pelvis stays level-ish (it is a free body on the axle in the real build)
  const tmp = new THREE.Vector3();
  w.updateMatrixWorld(true);
  for (const c of cords) {
    const pos = c.line.geometry.attributes.position;
    const a = new THREE.Vector3(0, w.userData.l * 0.08, c.leg.position.z).applyMatrix4(hipAxle.matrix);
    c.leg.userData.knee.getWorldPosition(tmp); w.worldToLocal(tmp);
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, tmp.x, tmp.y, tmp.z); pos.needsUpdate = true;
  }
}

export function buildRamp(gammaDeg, length = 3, width = 0.4, thick = 0.02) {
  const g = (gammaDeg * Math.PI) / 180;
  const grp = new THREE.Group(); grp.name = 'ramp';
  const board = new THREE.Mesh(new THREE.BoxGeometry(length, thick, width), mat(COLORS.ramp, { roughness: 0.9 }));
  board.receiveShadow = true;
  // board top surface passes through the origin, sloping down toward +x
  board.position.set(length / 2 - 0.3, -thick / 2, 0);
  const pivot = new THREE.Group(); pivot.rotation.z = -g; pivot.add(board);
  // stripes every 10 cm to read step length
  for (let x = -0.3; x < length - 0.3; x += 0.1) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.001, width), mat(0x8a7350)); s.position.set(x, 0.0006, 0); pivot.add(s);
  }
  grp.add(pivot); grp.userData = { length, gamma: g };
  return grp;
}

// ---------------- Asset swap ----------------
// parts.json maps part names to GLB files produced by tools/stl_to_glb.py.
// Each GLB must already be in metres, Y-up, with its origin at the part's joint
// pivot (hip for pelvis/thigh, knee for shank). Any part with "file": null keeps
// the procedural placeholder.
export async function applyPartAssets(walker, manifestUrl = './parts.json') {
  let manifest;
  try { manifest = await (await fetch(manifestUrl)).json(); } catch { return { swapped: [] }; }
  const parts = manifest.parts || {};
  const want = Object.entries(parts).filter(([, v]) => v && v.file);
  if (!want.length) return { swapped: [] };
  const { GLTFLoader } = await import('./GLTFLoader.js');
  const loader = new GLTFLoader();
  const swapped = [];
  for (const [name, cfg] of want) {
    try {
      const gltf = await loader.loadAsync(new URL(cfg.file, new URL(manifestUrl, location.href)).href);
      const targets = [];
      const { pelvis, legA, legB } = walker.userData;
      if (name === 'pelvis') targets.push([pelvis, null]);
      if (name === 'thigh') targets.push([legA, 'thigh'], [legB, 'thigh']);
      if (name === 'shank') targets.push([legA.userData.knee, 'shank'], [legB.userData.knee, 'shank']);
      if (name === 'foot') targets.push([legA.userData.knee, 'foot'], [legB.userData.knee, 'foot']);
      for (const [parent, childName] of targets) {
        const model = gltf.scene.clone(true);
        if (cfg.mirrorForLegB && parent === legB) model.scale.z *= -1;
        if (cfg.offset) model.position.fromArray(cfg.offset);
        if (cfg.rotationDeg) model.rotation.set(...cfg.rotationDeg.map((d) => (d * Math.PI) / 180));
        if (cfg.color) model.traverse((o) => { if (o.isMesh) o.material = mat(new THREE.Color(cfg.color)); });
        model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        if (childName) { const old = parent.userData[childName] || parent.getObjectByName(childName); if (old) old.visible = false; }
        else parent.children.forEach((c) => (c.visible = false));
        parent.add(model);
      }
      swapped.push(name);
    } catch (e) { console.warn('asset swap failed for', name, e); }
  }
  return { swapped };
}
