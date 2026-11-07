import * as THREE from 'three';

const rad = (d) => (d * Math.PI) / 180;
const shortest = (from, to) => from + ((((to - from) % 360) + 540) % 360) - 180;

/**
 * Caméra « orbitale » pilotée par des états numériques (spec §3).
 * Un état = { az, el, dist, fov, px, py, pz, ax, ay } ; on interpole chaque champ séparément
 * (azimut par le chemin le plus court) pour éviter qu'une trajectoire ne traverse la carrosserie.
 */
export class CameraRig {
  constructor(camera, stage, anchors) {
    this.camera = camera;
    this.stage = stage;
    this.anchors = anchors;
    this.tmp = new THREE.PerspectiveCamera();
  }

  /** Convertit une config lisible (pivot nommé, anchor tableau…) en état numérique. */
  toState(cfg) {
    const p = typeof cfg.pivot === 'string' ? this.anchors[cfg.pivot] : new THREE.Vector3(...cfg.pivot);
    const [ax, ay] = cfg.anchor ?? [640, 540];
    return { az: cfg.az, el: cfg.el, dist: cfg.dist, fov: cfg.fov, px: p.x, py: p.y, pz: p.z, ax, ay };
  }

  lerp(a, b, t) {
    const o = {};
    for (const k of Object.keys(a)) o[k] = a[k] + (b[k] - a[k]) * t;
    o.az = shortest(a.az, b.az);
    o.az = a.az + (o.az - a.az) * t;
    return o;
  }

  /** Dimensions de la « scène » 1280×1080 dans le viewport courant. */
  frame() {
    const W = this.stage.size.w, H = this.stage.size.h;
    const u = Math.min(W / 1280, H / 1080);
    return { W, H, u, oy: (H - 1080 * u) / 2 };
  }

  /** Applique un état à une caméra (par défaut la caméra principale). */
  apply(s, cam = this.camera, viewport = null) {
    const { W, H, u, oy } = viewport ?? this.frame();
    const az = rad(s.az), el = rad(Math.min(s.el, 89.7));
    const dir = new THREE.Vector3(-Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
    const pivot = new THREE.Vector3(s.px, s.py, s.pz);
    cam.position.copy(pivot).addScaledVector(dir, s.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(pivot);

    // Le FOV de référence vaut pour la hauteur du cadre 1080 ; si la largeur limite, on agrandit le champ vertical.
    const fovEff = (2 * Math.atan((H / (1080 * u)) * Math.tan(rad(s.fov) / 2)) * 180) / Math.PI;
    cam.fov = fovEff;
    cam.aspect = W / H;
    cam.near = 0.1;
    cam.far = 120;
    cam.updateProjectionMatrix();

    // Place le pivot au point d'ancrage voulu du cadre (décalage de vue, sans toucher à la direction).
    const sx = W / 2 + (s.ax - 640) * u;
    const sy = oy + s.ay * u;
    const dx = sx - W / 2, dy = sy - H / 2;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) cam.setViewOffset(W, H, -dx, -dy, W, H);
    else cam.clearViewOffset();
    cam.updateMatrixWorld(true);
    return cam;
  }

  /** Projette un point 3D en pixels écran avec l'état donné (sans toucher à la caméra principale). */
  project(state, point3, viewport = null) {
    const vp = viewport ?? this.frame();
    this.apply(state, this.tmp, vp);
    const v = point3.clone().project(this.tmp);
    return { x: ((v.x + 1) / 2) * vp.W, y: ((1 - v.y) / 2) * vp.H };
  }
}
