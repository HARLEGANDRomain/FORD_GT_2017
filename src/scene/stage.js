import * as THREE from 'three';

/**
 * Scène 3D : renderer transparent (le fond bleu/noir est du CSS), éclairage studio par environnement
 * procédural (softboxes → reflets longs et propres sur la peinture), ombre de contact douce.
 * Rendu « à la demande » : on ne dessine que quand quelque chose a changé.
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // couleurs produit fidèles (pas de désaturation du bleu)
  renderer.toneMappingExposure = 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 120);

  // ---- Environnement studio (PMREM) ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = buildStudio();
  scene.environment = pmrem.fromScene(studio, 0.035).texture;
  scene.environmentIntensity = 1;
  studio.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });

  // ---- Lumières directes : juste de quoi modeler les volumes, l'essentiel vient de l'environnement ----
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 8, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9db9ff, 0.6);
  fill.position.set(-6, 3, -4);
  scene.add(fill);

  // ---- Ombre de contact (dégradé radial, pas de shadow map → pas d'artefacts, aucun coût) ----
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.scale.set(6.6, 3.4, 1);
  shadow.renderOrder = -1;
  scene.add(shadow);

  let needsRender = true, dark = 1;
  const size = { w: 1, h: 1 };

  function resize() {
    size.w = Math.max(1, window.innerWidth);
    size.h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Rend une vue 16:9 hors-champ et retourne un dataURL (miniatures de la galerie). */
  function snapshot(applyCamera, w = 320, h = 180) {
    const prevPR = renderer.getPixelRatio();
    const prevExposure = renderer.toneMappingExposure;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 120);
    applyCamera(cam, w, h);
    renderer.toneMappingExposure = 1;
    renderer.render(scene, cam);
    const url = canvas.toDataURL('image/png');
    renderer.toneMappingExposure = prevExposure;
    renderer.setPixelRatio(prevPR);
    resize();
    return url;
  }

  return {
    renderer, scene, camera, shadow, size,
    invalidate() { needsRender = true; },
    renderIfNeeded() { if (!needsRender) return false; renderer.render(scene, camera); needsRender = false; return true; },
    /** 0 = scène éteinte (silhouette noire), 1 = studio allumé, > 1 = éclair. Les émissifs (phares) restent visibles. */
    setDark(v) {
      if (v === dark) return;
      dark = v;
      scene.environmentIntensity = v;
      key.intensity = 1.6 * v; fill.intensity = 0.6 * v;
      shadow.material.opacity = 0.62 * Math.min(1, v);
      needsRender = true;
    },
    snapshot,
    resize,
  };
}

/** Studio procédural : pièce bleutée (le fond du site se reflète dans la carrosserie) + softboxes blanches. */
function buildStudio() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2f5fae).multiplyScalar(0.9), side: THREE.BackSide }),
  );
  room.position.y = 8;
  s.add(room);

  const box = (w, h, intensity, pos, look = [0, 0.6, 0], tint = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  box(11, 5, 1.5, [0, 9, 0], [0, 0.6, 0], 0xdfe9ff);               // grand plafond : reflets longs sur capot/toit
  box(2.2, 9, 3.6, [-9, 4, 1]);             // bandes latérales : lignes de caisse
  box(2.2, 9, 3.6, [9, 4, -1]);
  box(10, 2.4, 3.2, [0, 3.2, -10]);       // arrière
  box(10, 2.4, 3.2, [0, 3.2, 10]);        // avant
  box(16, 16, 0.55, [0, -1.2, 0], [0, 6, 0], 0x6e9be0); // sol rebond bleu
  return s;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(2,10,30,1)');
  grad.addColorStop(0.35, 'rgba(2,10,30,0.7)');
  grad.addColorStop(0.7, 'rgba(2,10,30,0.2)');
  grad.addColorStop(1, 'rgba(2,10,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
