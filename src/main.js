import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/iosevka-charon/latin-700.css';
import '@fontsource/iosevka-charon/symbols-700.css';
import './styles/tokens.css';
import './styles/base.css';

import * as THREE from 'three';
import gsap from 'gsap';
import { SCREENS, COLORS, MOTION } from './config/screens.js';
import { createStage } from './scene/stage.js';
import { loadCar } from './scene/car.js';
import { createBloom } from './scene/bloom.js';
import { CameraRig } from './scene/rig.js';
import { showGroup, hideGroup } from './motion/textMotion.js';
import { createGallery } from './ui/gallery.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = SCREENS.length;      // 10 écrans de défilement (la galerie regroupe 10-11-12)
const LAST = N - 1;
const debug = new URLSearchParams(location.search).has('debug');

// ---------- DOM ----------
const back = {}, front = {};
document.querySelectorAll('#layer-back .scr').forEach((el) => (back[el.dataset.s] = el));
document.querySelectorAll('#layer-front .scr').forEach((el) => (front[el.dataset.s] = el));
const groupsOf = (i) => [back[i + 1], front[i + 1]].filter(Boolean);
const header = $('#site-header');
const veil = $('#veil');
const canvasWrap = $('#canvas-wrap');

// ---------- Chargement ----------
const stage = createStage($('#gl'));
const fontsReady = Promise.all([
  document.fonts.load('700 100px "Iosevka Charon"'),
  document.fonts.load('400 16px Inter'),
  document.fonts.load('500 14px Inter'),
  document.fonts.load('700 12px Inter'),
]).catch(() => {});

const modelUrl = `${import.meta.env.BASE_URL}models/ford-gt.glb`;
const [carApi] = await Promise.all([loadCar(modelUrl), fontsReady]);
stage.scene.add(carApi.car);
const bloom = createBloom(stage, carApi.car, carApi.led);
window.addEventListener('resize', () => bloom.resize());

const rig = new CameraRig(stage.camera, stage, carApi.anchors);

// ---------- États de caméra ----------
const states = [];
states[1] = rig.toState(SCREENS[1].cam);
states[0] = states[1];
states[2] = states[1];
for (let i = 3; i < LAST; i++) states[i] = rig.toState(SCREENS[i].cam);

// ---------- Découpe du canvas (état « Détails ») ----------
let clipK = 0, clipRect = null;
function applyClip() {
  if (clipK <= 0.001 || !clipRect) { canvasWrap.style.clipPath = ''; return; }
  const { W, H, u, oy } = rig.frame();
  const [x, y, w, h] = clipRect;
  const l = W / 2 + (x - 640) * u, t = oy + y * u, r = W - (l + w * u), b = H - (t + h * u);
  canvasWrap.style.clipPath = `inset(${t * clipK}px ${r * clipK}px ${b * clipK}px ${l * clipK}px round ${4 * clipK * u}px)`;
}
const setClip = (k, rect) => { clipK = k; if (rect) clipRect = rect; applyClip(); };

stage.setDark(1); // miniatures rendues studio allumé
const gallery = createGallery({ root: front[10], rig, carApi, setClip, stage });
gallery.init();

// ---------- Apparence pilotée par l'intro (noir → lumière) ----------
//   lights : phares (0 éteint · 1 allumé · >1 éblouissement)   dark : lumière de la scène (0 noir · 1 studio · >1 éclair)
//   bg     : fond noir → bleu                                  hdr  : en-tête       push : travelling avant (0 → 1)
const L = { lights: 0, dark: 0.04, bg: 0, hdr: 0, push: 0, idle: 0 };
const LOOK_DONE = { lights: 0, dark: 1, bg: 1, hdr: 1, push: 1, idle: 1 };

// ---------- Navigation par phases (pas de défilement natif : un geste = une phase, transition fluide) ----------
const MIN_PHASE = 2;                       // 0-1-2 = intro automatique ; on ne remonte pas dans l'intro
let s = 0;                                 // position continue (phase en cours de transition)
let phase = 0, busy = false, introDone = false, introTl = null, glide = null;

const camBase = (v) => {
  const n = Math.min(Math.floor(v), LAST);
  if (n >= LAST) return gallery.cam;
  const a = states[n], b = n + 1 === LAST ? gallery.cam : states[n + 1];
  return rig.lerp(a, b, v - n);
};

const hashToIndex = Object.fromEntries(SCREENS.map((sc, i) => [sc.hash, i]));
const NAV_OF = (i) => (i >= 9 ? 'galerie' : i >= 6 ? 'performances' : i >= 3 ? 'histoire' : null);

// ---------- Écran actif : le texte arrive quand la caméra est (presque) arrêtée ----------
let active = -1;
function setActive(a) {
  if (a === active) return;
  const prev = active;
  active = a;
  if (prev >= 1) groupsOf(prev).forEach((g) => hideGroup(g));
  if (prev === LAST) { gallery.leave(); gallery.reset(); }
  if (a >= 1) {
    groupsOf(a).forEach((g) => showGroup(g, 0.1));
    if (a === LAST) gallery.enter();
    if (a >= MIN_PHASE) history.replaceState(null, '', `#${SCREENS[a].hash}`);
    const nav = NAV_OF(a);
    header.querySelectorAll('nav a').forEach((l) => (nav && l.getAttribute('href') === `#${nav}` ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
  }
}

/** Transition vers la phase i : voisine → travelling continu ; lointaine (ancre du menu) → fondu. */
function go(i) {
  if (!introDone) return;
  i = clamp(i, MIN_PHASE, LAST);
  if (i === phase && !busy) return;
  glide?.kill();
  setActive(-1);
  const far = Math.abs(i - phase) > 1;
  const from = phase;
  phase = i;
  busy = true;
  if (reduce) { s = i; busy = false; setActive(i); return; }

  if (far) {
    glide = gsap.timeline({ onComplete: () => { busy = false; } })
      .to(veil, { opacity: 1, duration: MOTION.veilIn, ease: 'power1.in' })
      .add(() => { if (from === LAST) gallery.select(0, { instant: true }); s = i; })
      .to(veil, { opacity: 0, duration: MOTION.veilOut, ease: 'power1.out' }, '+=0.08')
      .add(() => setActive(i), '-=0.25');
    return;
  }
  const o = { v: s };
  let shown = false;
  glide = gsap.to(o, {
    v: i, duration: MOTION.step, ease: MOTION.ease,
    onUpdate() {
      s = o.v;
      if (!shown && this.progress() > MOTION.textAt) { shown = true; setActive(i); }
    },
    onComplete() { s = i; busy = false; if (!shown) setActive(i); },
  });
}
const step = (d) => { if (!introDone || busy) return; go(phase + d); };

// ---------- Entrées : molette, tactile, clavier, clic ----------
let lastWheel = 0, acc = 0, used = false;
window.addEventListener('wheel', (e) => {
  const now = performance.now();
  if (now - lastWheel > 160) { acc = 0; used = false; }     // nouveau geste (l'inertie d'un pavé tactile compte pour un seul)
  lastWheel = now;
  if (!introDone) { skipIntro(); return; }
  // Galerie en caméra libre : Ctrl + molette (ou pincement du pavé tactile) zoome ; la molette seule reste la navigation entre phases
  if (active === LAST && gallery.canOrbit && e.ctrlKey) { e.preventDefault(); gallery.zoomBy(e.deltaY); return; }
  if (used || busy) return;
  acc += e.deltaY;
  if (Math.abs(acc) > 40) { used = true; step(Math.sign(acc)); }
}, { passive: false });

let touchY = null;
window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchend', (e) => {
  if (touchY === null) return;
  const dy = touchY - e.changedTouches[0].clientY;
  touchY = null;
  if (Math.abs(dy) < 50) return;
  if (!introDone) skipIntro(); else if (active !== LAST) step(Math.sign(dy));
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button, a, input, select, textarea')) return;
  if (!introDone) { if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); skipIntro(); } return; }
  const next = ['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key), prev = ['ArrowUp', 'PageUp'].includes(e.key);
  if (next || prev) { e.preventDefault(); step(next ? 1 : -1); }
  else if (e.key === 'Home') { e.preventDefault(); go(MIN_PHASE); }
  else if (e.key === 'End') { e.preventDefault(); go(LAST); }
});

// Clic dans le vide = phase suivante ; liens du menu = ancres
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a) {
    e.preventDefault();
    const h = a.getAttribute('href').slice(1);
    if (h === 'intro') { replayIntro(); return; }
    const i = hashToIndex[h];
    if (i !== undefined) go(i);
    return;
  }
  if (e.target.closest('button, #site-header, .hotspot, #thumbs, [data-g-go]')) return;
  if (!introDone) { skipIntro(); return; }
  step(1);
});

// ---------- Intro cinématique (écrans 01 → 03), entièrement automatique ----------
function setLook(o) { Object.assign(L, o); }

function buildIntro() {
  const I = MOTION.intro;
  const tl = gsap.timeline({ paused: true, defaults: { overwrite: false } });
  setLook({ lights: 0, dark: 0.04, bg: 0, hdr: 0, push: 0, idle: 0 });

  // Travelling avant lent sur toute la séquence
  tl.to(L, { push: 1, duration: I.push, ease: 'power2.out' }, 0);

  // 1 · Les phares s'allument dans le noir : amorçage en deux clignotements (arc xénon), puis plein feu
  const t0 = I.dark;
  const ignite = gsap.timeline()
    .to(L, { lights: 0.9, duration: 0.07, ease: 'none' })
    .to(L, { lights: 0.12, duration: 0.11, ease: 'none' })
    .to(L, { lights: 1, duration: 0.09, ease: 'none' })
    .to(L, { lights: 0.45, duration: 0.2, ease: 'power1.in' })
    .to(L, { lights: 1.1, duration: 0.9, ease: 'expo.out' })
    .to(L, { lights: 1.0, duration: 0.8, ease: 'sine.inOut' });
  tl.add(ignite, t0);

  // 2 · Éblouissement des phares, puis la lumière du studio frappe : tout s'allume d'un coup
  const t1 = t0 + I.lights;
  const strike = gsap.timeline()
    .to(L, { lights: 1.6, duration: 0.3, ease: 'power3.in' })
    .to(L, { dark: 0.55, bg: 0.35, duration: 0.07, ease: 'none' })            // premier tube qui accroche
    .to(L, { dark: 0.1, bg: 0.05, duration: 0.09, ease: 'none' })
    .to(L, { dark: 1.45, bg: 1, duration: 0.5, ease: 'power4.out' })          // coup de lumière
    .to(L, { dark: 1, duration: 0.9, ease: 'power2.inOut' })                  // retombe sur l'éclairage nominal
    .to(L, { lights: 0, duration: 1.1, ease: 'power2.out' }, 0.45)
    .to(L, { hdr: 1, duration: 0.9, ease: 'power1.inOut' }, 1.0)
    .to(L, { idle: 1, duration: 1.2, ease: 'sine.inOut' }, 1.1);                // le C reste allumé, les barres s'éteignent
  tl.add(strike, t1);

  // 3 · FORD puis 2017 + texte de présentation
  tl.add(() => setActive(1), t1 + 0.55)
    .add(() => setActive(2), t1 + 0.55 + I.ford)
    .add(() => { introDone = true; phase = 2; s = 2; tl.timeScale(1); }, t1 + 0.55 + I.ford + I.settle);
  return tl;
}

function playIntro() {
  introDone = false; busy = false; phase = 0; s = 0;
  glide?.kill();
  setActive(-1);
  header.style.visibility = 'hidden';
  introTl?.kill();
  if (reduce) { finishIntro(); return; }
  introTl = buildIntro();
  introTl.play(0);
}
const skipIntro = () => { if (introTl && introTl.timeScale() < 4) gsap.to(introTl, { timeScale: 5, duration: 0.4 }); };
function finishIntro(at = 2) {
  introTl?.kill(); introTl = null; glide?.kill();
  Object.assign(L, LOOK_DONE);
  s = phase = at; busy = false; introDone = true;
  setActive(-1); setActive(at);
}
function replayIntro() {
  if (introTl && !introDone) return;
  gsap.to(veil, { opacity: 1, duration: 0.3, onComplete: () => {
    if (active === LAST) gallery.select(0, { instant: true });
    setActive(-1);
    playIntro();
    gsap.to(veil, { opacity: 0, duration: 0.5, delay: 0.1 });
  } });
}

// ---------- Boucle ----------
const cinema = new THREE.Color(COLORS.cinema), brand = new THREE.Color(COLORS.brand), tmpC = new THREE.Color();
let lastKey = '', lastBg = '', override = null, last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  tmpC.copy(cinema).lerp(brand, clamp(L.bg));
  const bg = `#${tmpC.getHexString()}`;
  if (bg !== lastBg) { document.documentElement.style.setProperty('--bg', bg); lastBg = bg; }
  if (active === LAST) gallery.update(dt);
  stage.setDark(L.dark);
  carApi.setLights(L.lights, L.idle);
  header.style.opacity = String(L.hdr);
  header.style.visibility = L.hdr < 0.02 ? 'hidden' : 'visible';

  let st = override ?? camBase(Math.max(s, 1));
  if (!override && L.push < 1) st = { ...st, dist: st.dist * (1 + MOTION.intro.pushAmount * (1 - L.push)) };
  const key = Object.values(st).map((v) => v.toFixed(3)).join('|') + stage.size.w + 'x' + stage.size.h + '|' + L.lights.toFixed(3) + '|' + L.dark.toFixed(3) + '|' + L.idle.toFixed(3);
  if (key !== lastKey) { rig.apply(st); stage.invalidate(); lastKey = key; }
  if (stage.renderIfNeeded()) bloom.render(carApi.lightState.guide, carApi.lightState.bars);
  requestAnimationFrame(frame);
}


// ---------- Démarrage ----------
const startIndex = hashToIndex[location.hash.slice(1)] ?? 0;
document.body.classList.remove('is-loading');
if (startIndex >= MIN_PHASE) finishIntro(startIndex);
else playIntro();
requestAnimationFrame((t) => { last = t; frame(t); });

// API de test / calibrage
window.__ford = {
  stage, rig, carApi, gallery, go, L, setActive,
  get introTl() { return introTl; },
  get introDone() { return introDone; },
  get busy() { return busy; },
  get phase() { return phase; },
  get s() { return s; },
  set s(v) { finishIntro(Math.max(MIN_PHASE, Math.round(v))); s = v; },
};

if (debug) {
  const { startCalibrator } = await import('./debug/calibrator.js');
  const goTo = (i) => { finishIntro(Math.max(MIN_PHASE, i)); };
  startCalibrator({ rig, SCREENS, GALLERY, states, gallery, goTo, setOverride: (o) => { override = o; lastKey = ''; }, setClip, base: import.meta.env.BASE_URL });
}
