import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const CAR_LENGTH = 4.76; // m (Ford GT 2017)

/**
 * Charge le GLB et le normalise : échelle réelle (le fichier source est à l'échelle 1/100),
 * nez vers +X, centre au sol à l'origine. Remplace les matériaux problématiques (vitres en
 * transmission → illisibles sur fond CSS) et calcule les points de repère (roues, phares).
 */
export async function loadCar(url, onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url, (e) => e.lengthComputable && onProgress?.(e.loaded / e.total));

  const model = gltf.scene;
  const root = new THREE.Group(); // pivot d'orientation
  root.add(model);

  // --- échelle ---
  let box = new THREE.Box3().setFromObject(root, true);
  let size = box.getSize(new THREE.Vector3());
  const longAxis = size.z > size.x ? 'z' : 'x';
  model.scale.multiplyScalar(CAR_LENGTH / size[longAxis]);
  root.updateMatrixWorld(true);

  // --- orientation : le feu rouge indique l'arrière ---
  box = new THREE.Box3().setFromObject(root, true);
  const centerBefore = box.getCenter(new THREE.Vector3());
  let rear = null;
  root.traverse((o) => { if (o.isMesh && o.material?.name === 'RED_GLASS') rear = new THREE.Box3().setFromObject(o, true).getCenter(new THREE.Vector3()); });
  const tailSign = rear ? Math.sign(rear[longAxis] - centerBefore[longAxis]) || 1 : 1;
  if (longAxis === 'z') root.rotation.y = tailSign > 0 ? -Math.PI / 2 : Math.PI / 2; // arrière → −X
  else root.rotation.y = tailSign > 0 ? Math.PI : 0;
  root.updateMatrixWorld(true);

  // --- centrage : milieu en X/Z, roues posées sur y = 0 ---
  box = new THREE.Box3().setFromObject(root, true);
  const c = box.getCenter(new THREE.Vector3());
  const car = new THREE.Group();
  car.add(root);
  root.position.set(-c.x, -box.min.y, -c.z);
  car.updateMatrixWorld(true);

  // --- matériaux ---
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    const m = o.material;
    const n = m.name || '';
    if (n.includes('Paint_Material')) {
      Object.assign(m, { clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.0 });
      m.color.setRGB(0.0, 0.098, 0.345); // bleu du rendu Blender (légèrement moins violet que la valeur du fichier)
      m.needsUpdate = true;
    } else if (n.includes('Window_Material') || n === 'ORANGE_GLASS' || n === 'RED_GLASS') {
      // la transmission de three échantillonne la scène 3D, pas le fond CSS : on passe en transparence simple
      m.transmission = 0;
      m.transparent = true;
      m.depthWrite = false;
      m.side = THREE.FrontSide;
      m.opacity = n === 'RED_GLASS' ? 0.62 : n === 'ORANGE_GLASS' ? 0.6 : 0.5;
      m.envMapIntensity = 0.45;
      m.roughness = 0.12;
      m.needsUpdate = true;
      o.renderOrder = 2;
    } else if (n.includes('BadgeA_Material') && m.map) {
      whitenBadgeLogo(m);
    } else if (n.includes('CalliperGloss')) {
      m.envMapIntensity = 1.2;
    }
  });

  // --- repères : roues, phares ---
  const anchors = computeAnchors(car);

  const led = extractLeds(car);
  const lights = buildHeadlights(led);
  return { car, root, anchors, led, lightState: lights.state, setLights: lights.set, raycastPoint: (ray) => raycastSurface(car, ray) };
}

/**
 * Le logo Ford de l'atlas « BadgeA » est peint en sombre (contour et lettrage) : on repeint en blanc
 * uniquement les pixels sombres et non bleus de la zone de l'ovale (moitié basse de l'atlas).
 * Le fond bleu de l'ovale, le texte « ECOBOOST » et « POWERED BY » ne sont pas touchés.
 */
function whitenBadgeLogo(m) {
  const img = m.map.image;
  if (!img?.width) return;
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let y = Math.floor(h * 0.57); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = p[i], gg = p[i + 1], b = p[i + 2];
      if (p[i + 3] > 0 && Math.max(r, gg, b) < 110 && b - r < 60) { p[i] = p[i + 1] = p[i + 2] = 255; }
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = m.map.flipY; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT;
  t.colorSpace = THREE.SRGBColorSpace;
  m.map = t;
  m.needsUpdate = true;
}

function collect(car, matchName) {
  const pts = [];
  const v = new THREE.Vector3();
  car.traverse((o) => {
    if (!o.isMesh || !(o.material?.name || '').includes(matchName)) return;
    o.updateWorldMatrix(true, false);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(v.clone());
    }
  });
  return pts;
}

function quadrantCenters(pts, filter = () => true) {
  const q = { '+x+z': [], '+x-z': [], '-x+z': [], '-x-z': [] };
  for (const p of pts) {
    if (!filter(p)) continue;
    q[`${p.x >= 0 ? '+' : '-'}x${p.z >= 0 ? '+' : '-'}z`].push(p);
  }
  const out = {};
  for (const [k, arr] of Object.entries(q)) {
    if (!arr.length) continue;
    const b = new THREE.Box3().setFromPoints(arr);
    out[k] = b.getCenter(new THREE.Vector3());
  }
  return out;
}

function computeAnchors(car) {
  const wheels = quadrantCenters(collect(car, 'Wheel1A'));
  const lights = quadrantCenters(collect(car, 'LightA'), (p) => p.x > 0 && p.y > 0.35);
  const A = {
    center: new THREE.Vector3(0, 0.55, 0),
    front: new THREE.Vector3(1.8, 0.5, 0),
    rear: new THREE.Vector3(-1.8, 0.55, 0),
    frontWheelL: wheels['+x-z'] ?? new THREE.Vector3(1.4, 0.34, -0.9),
    frontWheelR: wheels['+x+z'] ?? new THREE.Vector3(1.4, 0.34, 0.9),
    rearWheelL: wheels['-x-z'] ?? new THREE.Vector3(-1.4, 0.35, -0.9),
    rearWheelR: wheels['-x+z'] ?? new THREE.Vector3(-1.4, 0.35, 0.9),
    headlightR: lights['+x+z'] ?? new THREE.Vector3(2.0, 0.65, 0.7),
    headlightL: lights['+x-z'] ?? new THREE.Vector3(2.0, 0.65, -0.7),
  };
  return A;
}

const _ray = new THREE.Raycaster();
function raycastSurface(car, { origin, dir }) {
  _ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  const targets = [];
  car.traverse((o) => { if (o.isMesh && !o.material.transparent) targets.push(o); });
  const hit = _ray.intersectObjects(targets, false)[0];
  return hit ? hit.point.clone() : null;
}

/**
 * Isole les LED des blocs optiques avant. Le mesh « LightA » regroupe tout l'intérieur des feux (réflecteurs,
 * vitre, LED) sous un seul matériau : on retrouve les LED par leur zone dans l'atlas de texture
 * (tuile blanche = guide lumineux en C, tuile « barres » = deux barres) et on les sépare dans un second groupe
 * de triangles avec leur propre matériau émissif. Seules ces formes s'allument.
 */
const LED_TILES = {
  guide: [0.87, 1.0, 0.176, 0.244],  // guide lumineux en C (reste allumé, très légèrement)
  bars: [0.0, 0.7, 0.585, 0.74],     // deux barres (s'allument seulement dans l'intro)
};
const inTile = (r, u, w) => u >= r[0] && u <= r[1] && w >= r[2] && w <= r[3];
const ledMaterial = () => new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0, emissive: new THREE.Color(0xf4f7ff), emissiveIntensity: 0, toneMapped: false });

function extractLeds(car) {
  const guideMat = ledMaterial(), barsMat = ledMaterial();
  const box = () => ({ min: new THREE.Vector3(9, 9, 9), max: new THREE.Vector3(-9, -9, -9) });
  const sums = { L: box(), R: box() };
  const v = new THREE.Vector3();
  car.updateMatrixWorld(true);
  car.traverse((o) => {
    if (!o.isMesh || !(o.material?.name || '').includes('LightA_Material')) return;
    const g = o.geometry, uv = g.attributes.uv, pos = g.attributes.position, idx = g.index.array;
    const rest = [], guide = [], bars = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, w = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
      v.fromBufferAttribute(pos, a).applyMatrix4(o.matrixWorld);
      const front = v.x > 1.0;
      const target = front && inTile(LED_TILES.guide, u, w) ? guide : front && inTile(LED_TILES.bars, u, w) ? bars : rest;
      target.push(a, b, c);
      if (target !== rest) {
        const S = sums[v.z < 0 ? 'L' : 'R'];
        for (const i of [a, b, c]) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); S.min.min(v); S.max.max(v); }
      }
    }
    const arr = new idx.constructor(rest.length + guide.length + bars.length);
    arr.set(rest, 0); arr.set(guide, rest.length); arr.set(bars, rest.length + guide.length);
    g.setIndex(new THREE.BufferAttribute(arr, 1));
    g.clearGroups();
    g.addGroup(0, rest.length, 0);
    g.addGroup(rest.length, guide.length, 1);
    g.addGroup(rest.length + guide.length, bars.length, 2);
    o.material = [o.material, guideMat, barsMat];
  });
  const centre = (S, fallback) => (S.max.x > S.min.x ? S.min.clone().add(S.max).multiplyScalar(0.5) : fallback);
  return { guideMat, barsMat, L: centre(sums.L, new THREE.Vector3(1.9, 0.6, -0.72)), R: centre(sums.R, new THREE.Vector3(1.9, 0.6, 0.72)) };
}

/**
 * Phares « allumés » en temps réel, sans post-traitement :
 *  - les LED du phare passent en émissif (leur forme réelle s'éclaire) ;
 *  - deux sprites additifs par phare (cœur + halo large) donnent le bloom, centrés sur les LED ;
 *  - deux PointLight éclairent légèrement le museau.
 * `set(v)` : 0 = éteint, 1 = allumé, > 1 = éblouissement.
 */
const GUIDE_IDLE = 0.85; // émissif permanent du guide lumineux en C (0 = éteint)

/** Niveaux d'émission : le C reste allumé (idle) une fois l'intro passée, les barres ne s'allument que pendant l'intro. */
function buildHeadlights(led) {
  const state = { guide: 0, bars: 0 };
  const set = (v, idle = 1) => {
    state.guide = Math.max(v, idle * 0.3);
    state.bars = v;
    led.guideMat.emissiveIntensity = Math.max(v * 2.0, idle * GUIDE_IDLE);
    led.barsMat.emissiveIntensity = v * 2.0;
  };
  return { set, state };
}
