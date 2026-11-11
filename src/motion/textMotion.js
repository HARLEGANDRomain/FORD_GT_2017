import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/**
 * Motion du texte (spec §4) — 4 familles :
 *   poster : grands mots → reveal clip-path dans le sens de l'alignement + léger translateY/fondu
 *   num    : chiffres clés → compteur incrémental (easing out), unités en fondu
 *   label  : petits éléments (surtitres, légendes) → caractère par caractère, très court
 *   para   : paragraphes → ligne par ligne, fondu + translateY
 *   rule   : filets → tracé scaleX
 *   fade   : tout autre bloc
 * Le texte n'est déclenché qu'une fois la caméra arrêtée (délai appliqué par l'appelant).
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = new WeakMap(); // groupe → { tl, splits }

const align = (el) => {
  const cs = getComputedStyle(el);
  if (cs.textAlign === 'right' || cs.textAlign === 'end') return 'r';
  if (cs.textAlign === 'center') return 'c';
  return 'l';
};

// Virgule décimale et espace fine insécable pour les milliers (« 1 350 »)
const fmt = (v, dec) => v.toFixed(dec).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');

// Valeur finale de chaque compteur, mémorisée une fois pour toutes (sinon une animation interrompue
// laisserait une valeur intermédiaire dans le DOM, relue ensuite comme « valeur finale »).
document.querySelectorAll('[data-count]').forEach((el) => { el.dataset.final = el.textContent; });
const restoreCounters = (root) => root.querySelectorAll('[data-final]').forEach((el) => { el.textContent = el.dataset.final; el.style.fontVariantNumeric = ''; });

export function showGroup(group, delay = 0.12) {
  cancel(group);
  group.classList.add('is-on');
  const els = [...group.querySelectorAll('[data-mo]')];
  if (reduce || !els.length) {
    gsap.set(els, { clearProps: 'opacity,transform,clipPath,visibility' });
    return;
  }
  const splits = [];
  const tl = gsap.timeline({ delay });
  live.set(group, { tl, splits });

  els.forEach((el, i) => {
    const mo = el.dataset.mo;
    const at = Math.min(i * 0.045, 0.6); // légère cascade dans l'ordre du document
    if (mo === 'poster') {
      const a = align(el);
      const from = a === 'r' ? 'inset(-6% 0% -6% 100%)' : a === 'c' ? 'inset(-6% 50% -6% 50%)' : 'inset(-6% 100% -6% 0%)';
      gsap.set(el, { clipPath: from, opacity: 0, y: 12 });
      tl.to(el, { clipPath: 'inset(-6% 0% -6% 0%)', opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', clearProps: 'clipPath,transform,opacity' }, at);
    } else if (mo === 'num') {
      const target = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.dec || '0', 10);
      const suffix = el.dataset.suffix || '';
      const original = el.dataset.final;
      const o = { v: 0 };
      gsap.set(el, { opacity: 0 });
      el.style.fontVariantNumeric = 'tabular-nums';
      tl.to(el, { opacity: 1, duration: 0.25, ease: 'none' }, at);
      tl.to(o, {
        v: target, duration: 1.0, ease: 'power3.out',
        onUpdate: () => { el.textContent = fmt(o.v, dec) + suffix; },
        onComplete: () => { el.textContent = original; el.style.fontVariantNumeric = ''; },
      }, at);
    } else if (mo === 'label') {
      const s = SplitText.create(el, { type: 'chars', aria: 'auto' });
      splits.push(s);
      gsap.set(s.chars, { opacity: 0 });
      tl.to(s.chars, { opacity: 1, duration: 0.12, ease: 'none', stagger: { each: Math.min(0.02, 0.28 / Math.max(1, s.chars.length)) } }, at + 0.1);
    } else if (mo === 'para') {
      const s = SplitText.create(el, { type: 'lines', aria: 'auto' });
      splits.push(s);
      gsap.set(s.lines, { opacity: 0, y: 14 });
      tl.to(s.lines, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.07 }, at + 0.1);
    } else if (mo === 'rule') {
      gsap.set(el, { scaleX: 0 });
      tl.to(el, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, at);
    } else {
      gsap.set(el, { opacity: 0, y: 8 });
      tl.to(el, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, at + 0.1);
    }
  });
}

export function hideGroup(group, { instant = false } = {}) {
  const h = live.get(group);
  const finish = () => {
    cancel(group);
    group.classList.remove('is-on');
    const els = group.querySelectorAll('[data-mo]');
    if (els.length) gsap.set(els, { clearProps: 'opacity,transform,clipPath,visibility' });
  };
  if (!group.classList.contains('is-on')) return;
  if (instant || reduce) return finish();
  h?.tl.kill();
  const els = group.querySelectorAll('[data-mo]');
  if (!els.length) return finish();
  gsap.to(els, { opacity: 0, duration: 0.18, ease: 'power1.in', overwrite: 'auto', onComplete: finish });
}

function cancel(group) {
  restoreCounters(group);
  const h = live.get(group);
  if (!h) return;
  h.tl.kill();
  h.splits.forEach((s) => s.revert());
  live.delete(group);
}
