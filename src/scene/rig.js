import * as THREE from 'three';
import { MOBILE } from '../config/device.js';

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
    const [ax, ay] = cfg.anchor ?? (MOBILE ? [195, 0.5] : [640, 540]);
    return { az: cfg.az, el: cfg.el, dist: cfg.dist, fov: cfg.fov, px: p.x, py: p.y, pz: p.z, ax, ay };
  }

  lerp(a, b, t) {
    const o = {};
    for (const k of Object.keys(a)) o[k] = a[k] + (b[k] - a[k]) * t;
    o.az = shortest(a.az, b.az);
    o.az = a.az + (o.az - a.az) * t;
    return o;
  }

  /**
   * Dimensions de la « scène » dans le viewport courant.
   * Bureau : cadre 1280×1080 centré (ancre en px de maquette). Mobile : cadre de 390 px de large sur toute la hauteur
   * (ancre : x en px de maquette, y en fraction de la hauteur ; le FOV est alors le FOV vertical réel).
   */
  frame() {
    const W = this.stage.size.w, H = this.stage.size.h;
    if (MOBILE) return { W, H, u: W / 390, oy: 0, dw: 390, refH: H / (W / 390), mobile: true };
    const u = Math.min(W / 1280, H / 1080);
    return { W, H, u, oy: (H - 1080 * u) / 2, dw: 1280, refH: 1080, mobile: false };
  }

  /** Applique un état à une caméra (par défaut la caméra principale). */
  apply(s, cam = this.camera, viewport = null) {
    const { W, H, u, oy, dw = 1280, refH = 1080, mobile = false } = viewport ?? this.frame();
    const az = rad(s.az), el = rad(Math.min(s.el, 89.7));
    const dir = new THREE.Vector3(-Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
    const pivot = new THREE.Vector3(s.px, s.py, s.pz);
    cam.position.copy(pivot).addScaledVector(dir, s.dist * (mobile && H < 740 ? 1.12 : 1));  // petits écrans : voiture un peu plus petite, pour laisser la place au texte
    cam.up.set(0, 1, 0);
    cam.lookAt(pivot);

    // Le FOV de référence vaut pour la hauteur du cadre 1080 ; si la largeur limite, on agrandit le champ vertical.
    const fovEff = (2 * Math.atan((H / (refH * u)) * Math.tan(rad(s.fov) / 2)) * 180) / Math.PI;
    cam.fov = fovEff;
    cam.aspect = W / H;
    cam.near = 0.1;
    cam.far = 120;
    cam.updateProjectionMatrix();

    // Place le pivot au point d'ancrage voulu du cadre (décalage de vue, sans toucher à la direction).
    const sx = W / 2 + (s.ax - dw / 2) * u;
    const sy = mobile ? s.ay * H : oy + s.ay * u;
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
