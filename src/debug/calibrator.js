import GUI from 'lil-gui';

/**
 * Mode calibrage : ouvrir le site avec ?debug
 *  - choisir un écran → la caméra passe en manuel et la maquette Figma s'affiche en surimpression
 *  - ajuster az / el / dist / fov / pivot / ancre, puis « Copier la config » et coller dans src/config/screens.js
 *  - touche « O » : bascule la maquette ; touche « M » : bascule caméra manuelle / pilotée par le scroll
 */
export function startCalibrator({ rig, SCREENS, GALLERY, states, gallery, goTo, setOverride, setClip, base }) {
  const entries = [
    ...SCREENS.slice(0, 9).map((s, i) => ({ label: `${String(s.n).padStart(2, '0')} · ${s.id}`, ref: s.ref, scroll: i, state: states[i], cfg: s.cam === 'same-as-2' ? SCREENS[1].cam : s.cam })),
    ...GALLERY.map((g, k) => ({ label: `${g.n} · galerie / ${g.key}`, ref: g.ref, scroll: 9, gallery: k, state: rig.toState(g.cam), cfg: g.cam })),
  ];
  const overlay = document.createElement('div');
  overlay.id = 'ref-overlay';
  document.body.appendChild(overlay);

  const P = { écran: entries[1].label, manuel: true, maquette: 0.5, az: 0, el: 0, dist: 0, fov: 28, px: 0, py: 0, pz: 0, ax: 640, ay: 540 };
  const gui = new GUI({ title: 'Calibrage caméra' });
  const apply = () => setOverride(P.manuel ? { az: P.az, el: P.el, dist: P.dist, fov: P.fov, px: P.px, py: P.py, pz: P.pz, ax: P.ax, ay: P.ay } : null);

  function load(label) {
    const e = entries.find((x) => x.label === label);
    Object.assign(P, { az: e.state.az, el: e.state.el, dist: e.state.dist, fov: e.state.fov, px: e.state.px, py: e.state.py, pz: e.state.pz, ax: e.state.ax, ay: e.state.ay });
    overlay.style.backgroundImage = e.ref ? `url("${base}SiteExemple/${encodeURI(e.ref)}")` : 'none';
    goTo(e.scroll, { jump: true });
    if (e.gallery !== undefined) setTimeout(() => gallery.select(e.gallery, { instant: true }), 700);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    apply();
  }
  gui.add(P, 'écran', entries.map((e) => e.label)).onChange(load);
  gui.add(P, 'manuel').name('caméra manuelle').onChange(apply);
  gui.add(P, 'maquette', 0, 1, 0.01).onChange((v) => (overlay.style.opacity = v));
  const f = gui.addFolder('Caméra');
  f.add(P, 'az', -360, 360, 0.1).onChange(apply);
  f.add(P, 'el', -5, 90, 0.1).onChange(apply);
  f.add(P, 'dist', 1, 30, 0.01).onChange(apply);
  f.add(P, 'fov', 8, 60, 0.1).onChange(apply);
  const g = gui.addFolder('Pivot (m)');
  g.add(P, 'px', -3, 3, 0.01).onChange(apply);
  g.add(P, 'py', 0, 2, 0.01).onChange(apply);
  g.add(P, 'pz', -2, 2, 0.01).onChange(apply);
  const a = gui.addFolder('Ancre écran (px maquette)');
  a.add(P, 'ax', -400, 1700, 1).onChange(apply);
  a.add(P, 'ay', 0, 1080, 1).onChange(apply);
  gui.add({ copier() {
    const r = (v, d = 2) => +v.toFixed(d);
    const out = `{ az: ${r(P.az, 1)}, el: ${r(P.el, 1)}, dist: ${r(P.dist)}, fov: ${r(P.fov, 1)}, pivot: [${r(P.px)}, ${r(P.py)}, ${r(P.pz)}], anchor: [${Math.round(P.ax)}, ${Math.round(P.ay)}] }`;
    console.log(out); navigator.clipboard?.writeText(out);
  } }, 'copier').name('Copier la config');

  window.addEventListener('keydown', (e) => {
    if (e.key === 'o' || e.key === 'O') { overlay.style.opacity = overlay.style.opacity === '0' ? P.maquette : '0'; }
    if (e.key === 'm' || e.key === 'M') { P.manuel = !P.manuel; gui.controllersRecursive().forEach((c) => c.updateDisplay()); apply(); }
  });
  overlay.style.opacity = P.maquette;
  load(P.écran);
}
