import gsap from 'gsap';
import * as THREE from 'three';
import { GALLERY, HOTSPOTS, DEFAULT_SPOT, SPOT_ANCHOR, LIVERIES, ORBIT, camOf, clipOf } from '../config/screens.js';
import { MOBILE } from '../config/device.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Galerie (écrans 10 · 11 · 12) — caméra libre.
 *  - le glisser fait tourner la caméra tout autour de la voiture (élévation et zoom bornés), avec inertie ;
 *  - les miniatures sont des raccourcis : la caméra vole vers le cadrage voulu, puis reste libre ;
 *  - les repères (points blancs) sont projetés à chaque image et n'apparaissent que s'ils sont dans le champ
 *    et tournés vers la caméra ; un clic sur un repère mène à l'état « Détails » (cadrage découpé sur ce repère + sa fiche ;
 *    la fiche de l'aileron le déploie) ;
 *  - les pastilles de livrée changent la teinte et les bandes de la carrosserie (retour à la teinte de série en quittant la galerie).
 */
export function createGallery({ root, rig, carApi, setClip, stage }) {
  const states = GALLERY.map((g) => rig.toState(camOf(g)));
  const DETAIL = GALLERY.findIndex((g) => g.clip);
  const cam = { ...states[0] };            // état de caméra courant (lu par main.js)
  let index = 0;
  let tween = null;
  let active = false;
  const clipObj = { k: 0 };

  const thumbs = [...root.querySelectorAll('.thumb')];
  const groups = Object.fromEntries([...root.querySelectorAll('.gstate')].map((g) => [g.dataset.g, g]));
  const eyebrowDefault = root.querySelector('#g-eyebrow-default');
  const eyebrowDetail = root.querySelector('#g-eyebrow-detail');
  const hint = root.querySelector('#g-hint');
  const hotspots = []; // { def, p, n, el }
  const cardTitle = root.querySelector('.card h3'), cardText = root.querySelector('.card p');
  const liveriesEl = root.querySelector('#liveries');

  // ---------- fiche d'un repère : cadrage centré sur le repère + contenu de la fiche ----------
  function showSpot(h) {
    const { cam: c, mdist } = h.def.info;
    states[DETAIL] = rig.toState({ ...c, dist: MOBILE ? mdist ?? c.dist : c.dist, pivot: [h.p.x, h.p.y, h.p.z], anchor: MOBILE ? SPOT_ANCHOR.mobile : SPOT_ANCHOR.desktop });
    cardTitle.innerHTML = h.def.info.title;
    cardText.textContent = h.def.info.text;
  }

  // ---------- aileron actif ----------
  const wingObj = { k: 0 };
  let wingTween = null;
  function setWing(to, delay = 0) {
    wingTween?.kill();
    if (wingObj.k === to) return;
    wingTween = gsap.to(wingObj, { k: to, delay, duration: to ? 1.1 : 0.6, ease: 'power2.inOut', onUpdate: () => { carApi.setWing(wingObj.k); stage.invalidate(); } });
  }

  // ---------- livrées ----------
  const liv = { index: 0, k: 0, color: carApi.basePaint.clone(), tl: null };
  const livColor = (i) => (LIVERIES[i].color ? new THREE.Color(LIVERIES[i].color) : carApi.basePaint.clone());
  const pushLivery = () => { carApi.setLivery({ color: liv.color, k: liv.k }); stage.invalidate(); };
  function setLivery(i, { instant = false } = {}) {
    if (i === liv.index && !liv.tl) return;
    liv.index = i;
    const L = LIVERIES[i], to = livColor(i), from = liv.color.clone(), o = { t: 0 };
    liv.tl?.kill();
    liveriesEl?.querySelectorAll('.liv').forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
    if (liveriesEl) { liveriesEl.querySelector('.liv-name').textContent = L.name; liveriesEl.querySelector('.liv-note').textContent = L.note; }
    const swap = () => { if (L.stripe) carApi.setLivery({ stripe: new THREE.Color(L.stripe), band: L.band }); };
    if (instant) { liv.tl = null; swap(); liv.color.copy(to); liv.k = L.stripe ? 1 : 0; pushLivery(); return; }
    liv.tl = gsap.timeline({ onComplete: () => { liv.tl = null; } })
      .to(liv, { k: 0, duration: liv.k > 0 ? 0.25 : 0, ease: 'power1.in', onUpdate: pushLivery })      // les anciennes bandes s'effacent
      .add(swap)
      .to(o, { t: 1, duration: 0.55, ease: 'power2.inOut', onUpdate: () => { liv.color.copy(from).lerp(to, o.t); pushLivery(); } })
      .to(liv, { k: L.stripe ? 1 : 0, duration: L.stripe ? 0.45 : 0, ease: 'power2.out', onUpdate: pushLivery }, '-=0.2');
  }
  function buildLiveries() {
    if (!liveriesEl) return;
    const row = liveriesEl.querySelector('.liv-row');
    LIVERIES.forEach((L, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'liv'; b.dataset.liv = String(i);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === 0)); b.setAttribute('aria-label', L.name);
      b.style.setProperty('--c', L.swatch ?? L.color);
      b.style.setProperty('--s', L.stripe ?? L.swatch ?? L.color);
      row.appendChild(b);
    });
    liveriesEl.querySelector('.liv-name').textContent = LIVERIES[0].name;
    liveriesEl.querySelector('.liv-note').textContent = LIVERIES[0].note;
  }

  // ---------- repères : position + normale, boutons générés ----------
  function buildHotspots() {
    const layer = groups.free;
    layer.textContent = '';
    for (const def of HOTSPOTS) {
      let p = null;
      if (def.ray) p = carApi.raycastPoint(def.ray);
      else if (def.anchor) p = rig.anchors[def.anchor]?.clone();
      if (p && def.offset) p.add(new THREE.Vector3(...def.offset));
      if (!p) { console.warn('[galerie] repère introuvable :', def.id); continue; }
      const el = document.createElement('button');
      el.className = 'hotspot is-hidden';
      el.type = 'button';
      el.dataset.id = def.id;
      el.setAttribute('aria-label', def.label);
      el.innerHTML = `<span class="ring"></span><span class="hs-label ts-gt-legendes-petite">${def.label}</span>`;
      layer.appendChild(el);
      hotspots.push({ def, p, n: new THREE.Vector3(...def.normal).normalize(), el });
    }
  }

  const canOrbit = () => active && !tween && index !== DETAIL;

  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function updateHotspots() {
    if (!canOrbit()) { hotspots.forEach((h) => h.el.classList.add('is-hidden')); return; }
    const vp = rig.frame();
    const c = rig.apply(cam, rig.tmp, vp);
    const cands = [];
    for (const h of hotspots) {
      _v.copy(h.p).project(c);
      _d.copy(c.position).sub(h.p).normalize();
      const facing = _d.dot(h.n);
      const inView = _v.z < 1 && Math.abs(_v.x) < 0.94 && Math.abs(_v.y) < 0.94;
      h.x = ((_v.x + 1) / 2) * vp.W; h.y = ((1 - _v.y) / 2) * vp.H;
      h.score = inView && facing > ORBIT.facing ? facing : -1;
      cands.push(h);
    }
    const shown = new Set(cands.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, ORBIT.maxLabels));
    for (const h of hotspots) {
      const on = shown.has(h);
      h.el.classList.toggle('is-hidden', !on);
      if (on) { h.el.style.setProperty('--hx', `${h.x.toFixed(1)}px`); h.el.style.setProperty('--hy', `${h.y.toFixed(1)}px`); }
    }
  }

  // ---------- miniatures rendues depuis le modèle 3D ----------
  function renderThumbs() {
    GALLERY.forEach((g, i) => {
      const url = stage.snapshot((c, w, h) => rig.apply(rig.toState({ ...g.thumb, anchor: [640, 540] }), c, { W: w, H: h, u: Math.min(w / 1280, h / 1080), oy: 0 }));
      thumbs[i].querySelector('img').src = url;
    });
  }

  // ---------- états d'affichage ----------
  function showState(i, instant = false) {
    const detail = i === DETAIL;
    const g = detail ? groups.detail : groups.free;
    Object.values(groups).forEach((el) => el.classList.toggle('is-on', el === g));
    if (!instant) {
      if (detail) {
        gsap.fromTo(g.querySelectorAll('.ring-lg, .hline, .card > *'), { opacity: 0 }, { opacity: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out', clearProps: 'opacity' });
        gsap.fromTo(g.querySelector('.hline'), { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.6, delay: 0.1, ease: 'power2.inOut', clearProps: 'transform' });
      } else {
        gsap.fromTo(g, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out', clearProps: 'opacity' });
      }
    }
    if (eyebrowDefault) { eyebrowDefault.hidden = detail; eyebrowDetail.hidden = !detail; }
    if (hint) hint.hidden = detail;
    if (liveriesEl) liveriesEl.hidden = detail;
    document.body.classList.toggle('is-orbit', active && !detail);
  }

  // ---------- sélection d'un cadrage (miniatures, « Vue d'ensemble », clic sur une roue) ----------
  function select(i, { instant = false, spot = null } = {}) {
    if (i === index && !instant && !tween && thumbs[i].getAttribute('aria-selected') === 'true') return;
    const prev = index;
    index = i;
    const h = i === DETAIL ? spot ?? hotspots.find((x) => x.def.id === DEFAULT_SPOT) ?? hotspots[0] : null;
    if (h) showSpot(h);
    setWing(h?.def.info.wing ? 1 : 0, h?.def.info.wing && !instant ? 1.0 : 0);   // l'aileron se lève une fois la caméra presque arrivée
    thumbs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    tween?.kill();
    Object.values(groups).forEach((g) => g.classList.remove('is-on'));
    document.body.classList.remove('is-orbit');
    vel.az = vel.el = 0;

    const from = { ...cam };
    const to = states[i];
    const wantClip = GALLERY[i].clip ? 1 : 0;
    const done = () => { tween = null; if (active || instant) showState(i, instant); };
    const apply = (p) => {
      Object.assign(cam, rig.lerp(from, to, p));
      clipObj.k = clipObj.k0 + (wantClip - clipObj.k0) * p;
      setClip(clipObj.k, clipOf(GALLERY[wantClip ? i : prev]));
    };
    clipObj.k0 = clipObj.k;
    if (instant) { apply(1); done(); return; }
    const o = { p: 0 };
    tween = gsap.to(o, { p: 1, duration: wantClip || GALLERY[prev].clip ? 1.5 : 1.25, ease: 'power2.inOut', onUpdate: () => apply(o.p), onComplete: done });
  }

  function reset() {
    if (index !== 0 || tween || thumbs[0].getAttribute('aria-selected') !== 'true') select(0);
  }

  // ---------- caméra libre : glisser, inertie, zoom ----------
  const vel = { az: 0, el: 0 };      // °/s
  const pointers = new Map();
  let pinch = 0, dragged = false;

  const orbit = (dAz, dEl) => {
    cam.az += dAz;
    cam.el = clamp(cam.el + dEl, ORBIT.elMin, ORBIT.elMax);
  };
  const zoom = (factor) => {
    const base = states[index].dist;
    cam.dist = clamp(cam.dist * factor, base * ORBIT.zoom[0], base * ORBIT.zoom[1]);
  };
  const markFree = () => {
    if (dragged) return;
    dragged = true;
    thumbs.forEach((t) => t.setAttribute('aria-selected', 'false'));
  };

  window.addEventListener('pointerdown', (e) => {
    if (!canOrbit()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a, #site-header, #thumbs')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    vel.az = vel.el = 0;
    dragged = false;
    document.body.classList.add('is-dragging');
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  window.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || !canOrbit()) return;
    const now = performance.now(), dx = e.clientX - p.x, dy = e.clientY - p.y, dt = Math.max(1, now - p.t);
    p.x = e.clientX; p.y = e.clientY; p.t = now;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { markFree(); zoom(pinch / d); }
      pinch = d;
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    markFree();
    const dAz = dx * ORBIT.speed, dEl = dy * ORBIT.speed * 0.6;
    orbit(dAz, dEl);
    vel.az += ((dAz / dt) * 1000 - vel.az) * 0.5;
    vel.el += ((dEl / dt) * 1000 - vel.el) * 0.5;
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!pointers.size) document.body.classList.remove('is-dragging');
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // ---------- événements ----------
  root.addEventListener('click', (e) => {
    if (!active) return;
    const b = e.target.closest('[data-g-go]');
    if (b) { select(parseInt(b.dataset.gGo, 10)); return; }
    const lv = e.target.closest('[data-liv]');
    if (lv) { setLivery(parseInt(lv.dataset.liv, 10)); return; }
    const hs = e.target.closest('.hotspot');
    const h = hs && hotspots.find((x) => x.el === hs);
    if (h?.def.info && DETAIL >= 0) select(DETAIL, { spot: h });
  });
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'ArrowRight') select(Math.min(GALLERY.length - 1, index + 1));
    if (e.key === 'ArrowLeft') select(Math.max(0, index - 1));
  });
  window.addEventListener('resize', () => { if (active) setClip(clipObj.k, clipOf(GALLERY[DETAIL])); });

  return {
    cam,
    get index() { return index; },
    get canOrbit() { return canOrbit(); },
    init() { buildHotspots(); buildLiveries(); renderThumbs(); },
    /** Appelé quand l'écran Galerie devient l'écran actif (caméra arrêtée). */
    enter() { active = true; dragged = false; showState(index); },
    leave() { active = false; setWing(0); setLivery(0); Object.values(groups).forEach((g) => g.classList.remove('is-on')); document.body.classList.remove('is-orbit', 'is-dragging'); pointers.clear(); },
    reset,
    select,
    /** Appelé à chaque image tant que la galerie est affichée : inertie + repères. */
    update(dt) {
      if (!active) return;
      if (!pointers.size && canOrbit() && (Math.abs(vel.az) > 0.05 || Math.abs(vel.el) > 0.05)) {
        orbit(vel.az * dt, vel.el * dt);
        const k = Math.exp(-dt * ORBIT.damping);
        vel.az *= k; vel.el *= k;
      }
      updateHotspots();
    },
    /** Ctrl + molette / pincement du pavé tactile (ctrlKey) : deltaY est petit pour un pincement, grand pour une molette. */
    zoomBy(deltaY) { if (canOrbit()) { markFree(); zoom(clamp(1 + deltaY * 0.01, 0.88, 1.14)); } },
    refresh() {},
  };
}
