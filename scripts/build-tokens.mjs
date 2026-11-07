// Génère src/styles/tokens.css à partir de colorStyles.json et textStyles.json (exports Figma).
// Usage : npm run tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Surcharges volontaires par rapport au JSON Figma (décisions de design). */
const OVERRIDES = {
  // Tous les blancs de texte à 100 % (le « Blanc-80 » du JSON n'est plus utilisé).
  'c-neutres-blanc-80': '#ffffff',
};

// ---------- Couleurs ----------
const colors = JSON.parse(readFileSync(resolve(root, 'colorStyles.json'), 'utf8'));
const prim = [];
const sem = [];
const refToVar = (v) => {
  const m = /^\{(.+)\}$/.exec(v);
  return m ? `var(--c-${m[1].split('.').map(slug).join('-')})` : v;
};
for (const coll of colors) {
  for (const [collName, def] of Object.entries(coll)) {
    const isPrim = /primitives/i.test(collName);
    for (const mode of Object.values(def.modes)) {
      for (const [group, tokens] of Object.entries(mode)) {
        for (const [name, t] of Object.entries(tokens)) {
          if (isPrim) {
            const id = `c-${slug(group)}-${slug(name)}`;
            prim.push([id, OVERRIDES[id] ?? t.$value, OVERRIDES[id] ? `surcharge (JSON : ${t.$value})` : t.$description]);
          } else {
            sem.push([`${slug(group)}-${slug(name)}`, refToVar(t.$value), t.$description]);
          }
        }
      }
    }
  }
}

// ---------- Styles de texte ----------
const ts = JSON.parse(readFileSync(resolve(root, 'textStyles.json'), 'utf8')).textStyles;
const weight = { Regular: 400, Medium: 500, Bold: 700 };
const family = { Inter: 'var(--font-ui)', 'Iosevka Charon': 'var(--font-display)' };
const unitless = [];
let css = `/* GÉNÉRÉ par scripts/build-tokens.mjs — ne pas éditer à la main. */\n:root {\n  /* Primitives */\n`;
for (const [id, v, d] of prim) css += `  --${id}: ${v}; /* ${d} */\n`;
css += `\n  /* Sémantiques */\n`;
for (const [id, v, d] of sem) css += `  --${id}: ${v}; /* ${d} */\n`;
css += `}\n\n/* Styles de texte (taille exprimée en unité de scène --u, voir base.css) */\n`;
for (const s of ts) {
  const cls = `ts-${slug(s.name)}`;
  const ls = s.letterSpacing?.unit === 'PERCENT' ? `${(s.letterSpacing.value / 100).toFixed(3).replace(/\.?0+$/, '') || 0}em` : '0';
  css += `.${cls} { font-family: ${family[s.fontFamily] ?? s.fontFamily}; font-weight: ${weight[s.fontWeight] ?? 400}; font-size: calc(${s.fontSize} * var(--u)); letter-spacing: ${ls};${
    s.textCase === 'UPPER' ? ' text-transform: uppercase;' : ''
  } } /* ${s.name} */\n`;
}
writeFileSync(resolve(root, 'src/styles/tokens.css'), css);
console.log(`tokens.css : ${prim.length} primitives, ${sem.length} sémantiques, ${ts.length} styles de texte`);
