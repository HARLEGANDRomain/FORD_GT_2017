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
  let paint = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    const m = o.material;
    const n = m.name || '';
    if (n.includes('Paint_Material')) {
      Object.assign(m, { clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.0 });
      m.color.setRGB(0.0, 0.098, 0.345); // bleu du rendu Blender (légèrement moins violet que la valeur du fichier)
      addStripes(m);
      paint = m;
      m.needsUpdate = true;
    } else if (n.includes('Window_Material') || n === 'ORANGE_GLASS' || n === 'RED_GLASS') {
      // la transmission de three échantillonne la scène 3D, pas le fond CSS : on passe en transparence simple
      m.transmission = 0;
      m.transparent = true;
      m.depthWrite = false;
      m.side = THREE.DoubleSide; // les faces des vitrages sont tournées vers l'intérieur : en FrontSide elles étaient invisibles (feux arrière rouges compris)
      // alpha prémultiplié : l'opacité n'atténue plus les reflets (sinon une vitre peu opaque n'a plus aucun reflet → « invisible »)
      m.premultipliedAlpha = true;
      const tint = n === 'RED_GLASS' ? 0x3a0508 : n === 'ORANGE_GLASS' ? 0x3a1a02 : 0x0b1626;
      m.color.set(tint);
      m.opacity = n === 'RED_GLASS' ? 0.7 : n === 'ORANGE_GLASS' ? 0.65 : 0.72;
      m.envMapIntensity = 2.6;
      m.roughness = 0.04;
      m.metalness = 0;
      m.specularIntensity = 1;
      m.ior = 1.5;
      if (n.includes('Window_Material')) addGlassSheen(m);
      if (n === 'RED_GLASS') {
        // feux arrière : lentille rouge opaque (en transparence elle passait derrière l'anneau argenté du bloc optique et restait invisible)
        m.premultipliedAlpha = false;
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        m.color.set(0x5c0008);
        m.emissive.set(0xc80c05);
        m.emissiveIntensity = 0.28;
        m.envMapIntensity = 0.6;
        m.roughness = 0.18;
        m.specularIntensity = 0.6;
      }
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
  const wing = splitWing(car);
  anchors.wing = wing.center;
  const basePaint = paint ? paint.color.clone() : new THREE.Color(0x0b2f8a);
  return {
    car, root, anchors, led, lightState: lights.state, setLights: lights.set, raycastPoint: (ray) => raycastSurface(car, ray),
    /** Aileron actif : 0 = escamoté (affleurant), 1 = déployé. */
    setWing: wing.set,
    /** Teinte de série (couleur linéaire du matériau d'origine). */
    basePaint,
    /** Livrée : couleur de caisse + bandes (k = 0 → sans bandes, 1 → bandes pleines). `band` = [bord intérieur, bord extérieur] en m depuis l'axe. */
    setLivery({ color, stripe, band, k }) {
      if (!paint) return;
      if (color) paint.color.copy(color);
      if (stripe) stripes.uStripeColor.value.copy(stripe);
      if (band) stripes.uStripeBand.value.set(band[0], band[1]);
      if (k !== undefined) stripes.uStripeOn.value = k;
    },
  };
}

/**
 * Bandes de livrée, peintes dans le shader de la carrosserie (le modèle n'a ni texture ni dépliage UV exploitable sur la peinture) :
 * une bande = un intervalle de distance à l'axe longitudinal de la voiture, appliqué aux faces qui ne regardent pas vers le sol.
 * Elle court donc du nez à l'aileron en passant par le toit, comme les bandes des Heritage Edition.
 */
const stripes = { uStripeColor: { value: new THREE.Color(0xffffff) }, uStripeBand: { value: new THREE.Vector2(0.07, 0.27) }, uStripeOn: { value: 0 } };
function addStripes(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, stripes);
    sh.vertexShader = 'varying vec3 vCarPos;\nvarying vec3 vCarN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vCarPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vCarN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = 'uniform vec3 uStripeColor;\nuniform vec2 uStripeBand;\nuniform float uStripeOn;\nvarying vec3 vCarPos;\nvarying vec3 vCarN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float az = abs(vCarPos.z), e = 0.004;
        float band = smoothstep(uStripeBand.x - e, uStripeBand.x + e, az) * (1.0 - smoothstep(uStripeBand.y - e, uStripeBand.y + e, az));
        float ny = normalize(vCarN).y;
        // les bandes descendent sur le nez (faces presque verticales) mais s'arrêtent au bord du pont arrière
        float up = mix(smoothstep(0.1, 0.35, ny), smoothstep(-0.35, -0.05, ny), step(1.5, vCarPos.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, uStripeColor, band * up * uStripeOn);
      }`);
  };
  m.customProgramCacheKey = () => 'paint-stripes';
}

/**
 * Aileron actif. Dans le modèle, l'aileron fait partie du mesh de carrosserie : on l'isole en cherchant les îlots de
 * triangles (composantes connexes) entièrement contenus dans sa zone, à l'arrière du pont, puis on le place sous un pivot
 * situé sur son bord d'attaque. `set(k)` le soulève et l'incline (bord de fuite vers le haut).
 */
const WING_ZONE = new THREE.Box3(new THREE.Vector3(-2.34, 0.72, -0.6), new THREE.Vector3(-1.92, 0.82, 0.6));
const WING_LIFT = 0.115, WING_TILT = 0.15; // m, rad

function splitWing(car) {
  const fallback = { set() {}, center: new THREE.Vector3(-2.12, 0.8, 0) };
  let body = null;
  car.updateMatrixWorld(true);
  car.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && (o.material.name || '').includes('Paint_Material')) body = o; });
  if (!body?.geometry.index) return fallback;

  const g = body.geometry, pos = g.attributes.position, idx = g.index.array, n = pos.count;
  // positions monde + soudure des sommets confondus (les coutures de normales dédoublent les sommets)
  const P = new Float32Array(n * 3), weld = new Int32Array(n), seen = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    const key = `${Math.round(v.x * 2000)}|${Math.round(v.y * 2000)}|${Math.round(v.z * 2000)}`;
    if (!seen.has(key)) seen.set(key, i);
    weld[i] = seen.get(key);
  }
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(weld[idx[t]]); parent[find(weld[idx[t + 1]])] = a; parent[find(weld[idx[t + 2]])] = a; }

  // boîte englobante de chaque îlot
  const boxes = new Map();
  for (let t = 0; t < idx.length; t++) {
    const i = idx[t], r = find(weld[i]);
    let b = boxes.get(r);
    if (!b) boxes.set(r, (b = new THREE.Box3()));
    b.expandByPoint(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  }
  const inWing = new Set([...boxes].filter(([, b]) => WING_ZONE.containsBox(b)).map(([r]) => r));
  const rest = [], wingIdx = [], bounds = new THREE.Box3();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(weld[idx[t]]);
    (inWing.has(r) ? wingIdx : rest).push(idx[t], idx[t + 1], idx[t + 2]);
    if (inWing.has(r)) bounds.union(boxes.get(r));
  }
  if (wingIdx.length < 300) return fallback; // rien de plausible : on laisse la carrosserie intacte

  const Arr = idx.constructor;
  const wg = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) wg.setAttribute(name, attr);
  wg.setIndex(new THREE.BufferAttribute(new Arr(wingIdx), 1));
  wg.boundingBox = g.boundingBox; wg.boundingSphere = g.boundingSphere ?? null;
  if (!wg.boundingSphere) wg.computeBoundingSphere();
  g.setIndex(new THREE.BufferAttribute(new Arr(rest), 1));

  const mesh = new THREE.Mesh(wg, body.material);
  mesh.name = 'ActiveWing';
  body.parent.add(mesh);
  mesh.matrix.copy(body.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  const pivot = new THREE.Group();
  pivot.position.set(bounds.max.x, (bounds.min.y + bounds.max.y) / 2, 0); // bord d'attaque (côté avant)
  car.add(pivot);
  car.updateMatrixWorld(true);
  pivot.attach(mesh);
  const y0 = pivot.position.y;
  return {
    center: bounds.getCenter(new THREE.Vector3()).setY(bounds.max.y),
    set(k) { pivot.position.y = y0 + WING_LIFT * k; pivot.rotation.z = -WING_TILT * k; },
  };
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

/**
 * Vitrage : reflet de Fresnel (bords et angles rasants plus clairs et plus opaques) + traînée diagonale de softbox
 * qui glisse sur la surface selon l'angle de vue. C'est ce qui fait « lire » une vitre sur fond uni.
 */
/** Intensité du reflet des vitrages (0 = scène éteinte), pilotée par la lumière de la scène. */
export const glassLight = { value: 1 };

function addGlassSheen(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlassLight = glassLight;
    sh.fragmentShader = 'uniform float uGlassLight;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      {
        vec3 nv = normalize(vNormal), vv = normalize(vViewPosition);
        float fr = pow(1.0 - clamp(abs(dot(nv, vv)), 0.0, 1.0), 2.2);
        float band = smoothstep(0.0, 0.16, 0.5 - abs(fract(dot(nv.xy, vec2(0.9, 0.55)) * 1.6 + vViewPosition.x * 0.12 + vViewPosition.y * 0.07) - 0.5) * 1.0);
        float sheen = clamp(fr * 0.9 + band * 0.22, 0.0, 1.0) * uGlassLight;
        gl_FragColor.rgb += vec3(0.72, 0.84, 1.0) * sheen;
        gl_FragColor.a = clamp(gl_FragColor.a + sheen * 0.55, 0.0, 1.0);
      }`);
  };
  m.customProgramCacheKey = () => 'glass-sheen';
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
