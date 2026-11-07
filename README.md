# Ford GT 2017 — site d'histoire (v1)

Site one-page : modèle 3D temps réel (three.js), scroll cinématique (GSAP), 10 écrans + galerie interactive.

## Lancer
```
npm install
npm run dev        # http://localhost:5173
npm run build      # production dans dist/
npm run tokens     # régénère src/styles/tokens.css depuis colorStyles.json / textStyles.json
```

## Calibrer les caméras
Ouvrir `http://localhost:5173/?debug` : panneau lil-gui + overlay Figma (touche O) pour régler
caméra par écran, puis "copy config" et coller dans `src/config/screens.js`.

## Navigation et rythme
- Écrans 01 → 03 : intro cinématique **automatique** (phares → éclair de lumière → FORD → 2017 + texte). Un clic, une touche ou un coup de molette l'accélère.
- Ensuite : une phase par geste (molette / balayage tactile / flèches, Espace / **clic dans le vide**), transition continue entre deux cadrages. Les liens du menu sautent avec un fondu.
- Tous les durées et le rythme de l'intro sont dans `MOTION` (`src/config/screens.js`).
- Le logo Ford rejoue l'intro.
- Galerie : caméra libre (glisser = tourner à 360°, élévation limitée à 2–32°, Ctrl + molette ou pincement = zoom). Les miniatures sont des raccourcis de cadrage. Les repères (`HOTSPOTS`, `ORBIT` dans `src/config/screens.js`) n'apparaissent que s'ils sont dans le champ et tournés vers la caméra ; un clic sur une roue ouvre « Détails ».

## Décisions
- Blanc 80 % remplacé par blanc 100 % (override dans `scripts/build-tokens.mjs`).
- Bleu profond `#204579` conservé tel quel.
- Navigation = ancres (Histoire / Performances / Galerie) avec fondu de transition.
- Phares : matériau émissif + halos additifs + deux lumières ponctuelles, pilotés en temps réel (`setLights` dans `src/scene/car.js`).
- Textes du bas centrés (S04, S05, S06, S09) ; S07 et S08 inchangés.
- S08 : textes placés d'après la maquette (diffère légèrement du .md).
- Vue « Profil » de la galerie dérivée (pas de maquette dédiée).
- Dossier parent contient `&` : lancer les commandes depuis le dossier du projet entre guillemets.

## Limites v1
Desktop d'abord (cadre de référence 1280×1080), pas de version mobile, calibration fine des caméras à faire écran par écran.
