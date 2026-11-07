/**
 * Source de vérité des 12 écrans : caméra, ancre de navigation, référence Figma.
 *
 * Convention caméra (spec §3) — repère voiture : avant = +X, haut = +Y, gauche = −Z
 *   az   : azimut en ° — 0 = vue arrière stricte · 90 = flanc gauche · 180 = face · 270 = flanc droit
 *   el   : élévation en ° — 0 = hauteur pare-chocs · ~90 = plongée
 *   dist : distance caméra → pivot (m, voiture ≈ 4,76 m de long)
 *   fov  : champ vertical (°) calé sur le format de référence 1280×1080
 *   pivot: point visé — 'center' | 'front' | 'rear' | 'frontWheelL' | 'rearWheelL' | [x,y,z]
 *   anchor: position écran (px dans le cadre 1280×1080) où le pivot doit se projeter → décale la voiture
 *           dans le cadre (c'est ce qui permet les débordements voulus des écrans 04, 05, 06…)
 *
 * Les valeurs sont un premier calage : utiliser le mode ?debug (voir README) pour les affiner
 * en superposant la maquette Figma.
 */
export const SCREENS = [
  { n: 1, id: 'intro', hash: 'intro', ref: '1. GT40 - 2017 - Cinematique/intro Page@2x.png',
    cam: 'same-as-2', exposure: 0, bg: 'cinema', header: false },

  { n: 2, id: 'modele', hash: 'modele', ref: '2. GT40 - 2017 - Landing page@2x.png',
    cam: { az: 180, el: 4, dist: 8.3, fov: 28, pivot: 'center', anchor: [647, 700] } },

  { n: 3, id: 'presentation', hash: 'presentation', ref: '3. GT40 - 2017 - Landing page@2x.png',
    cam: 'same-as-2' },

  { n: 4, id: 'heritage', hash: 'histoire', ref: '4. La course en héritage@2x.png',
    cam: { az: 92, el: 6, dist: 6.7, fov: 28, pivot: 'center', anchor: [1085, 629] } },

  { n: 5, id: 'nouvelle-ere', hash: 'nouvelle-ere', ref: '5. Une nouvelle ère@2x.png',
    cam: { az: 92, el: 6, dist: 6.7, fov: 28, pivot: 'center', anchor: [625, 615] } },

  { n: 6, id: 'fabrication', hash: 'fabrication', ref: '6. Rare par nature@2x.png',
    cam: { az: 78, el: 6, dist: 6.7, fov: 28, pivot: 'rearWheelL', anchor: [560, 690] } },

  { n: 7, id: 'performances', hash: 'performances', ref: '7. De la vision à la route@2x.png',
    cam: { az: 0, el: 5, dist: 7.7, fov: 28, pivot: 'center', anchor: [640, 745] } },

  { n: 8, id: 'le-mans', hash: 'le-mans', ref: '8. Le Mans encore@2x.png',
    cam: { az: 0, el: 89.6, dist: 11.7, fov: 28, pivot: 'center', anchor: [597, 598] } },

  { n: 9, id: 'derniere-edition', hash: 'derniere-edition', ref: '9. L’histoire continue@2x.png',
    cam: { az: 225, el: 22, dist: 10.6, fov: 28, pivot: 'center', anchor: [650, 520] } },

  // 10 · 11 · 12 : un seul écran de défilement, trois (quatre) états pilotés par les miniatures.
  { n: 10, id: 'galerie', hash: 'galerie', ref: '10. Galerie - Vue d\'ensemble@2x.png', cam: 'gallery' },
];

/** États de la galerie (miniatures). `thumb` = cadrage de la miniature (rendu 16:9 depuis le même modèle). */
export const GALLERY = [
  { key: 'avant', label: 'Avant', n: 10, ref: '10. Galerie - Vue d\'ensemble@2x.png',
    cam: { az: 222, el: 10, dist: 5.65, fov: 40, pivot: 'center', anchor: [565, 455] },
    thumb: { az: 225, el: 10, dist: 8.6, fov: 20, pivot: 'center' } },
  { key: 'profil', label: 'Profil', n: 10, ref: null, // pas de maquette : cadrage dérivé
    cam: { az: 90, el: 6, dist: 9.4, fov: 28, pivot: 'center', anchor: [640, 530] },
    thumb: { az: 90, el: 8, dist: 6.0, fov: 20, pivot: [0.35, 0.55, 0] } },
  { key: 'arriere', label: 'Arrière', n: 11, ref: '11. Galerie - Vue arrière@2x.png',
    cam: { az: 0, el: 5, dist: 7.0, fov: 28, pivot: 'center', anchor: [632, 500] },
    thumb: { az: 0, el: 8, dist: 6.2, fov: 20, pivot: [0, 0.6, 0] } },
  { key: 'detail', label: 'Détails', n: 12, ref: '12. Galerie - Détail@2x.png',
    cam: { az: 92, el: 3, dist: 6.7, fov: 28, pivot: 'frontWheelL', anchor: [380, 510] },
    thumb: { az: 92, el: 6, dist: 3.4, fov: 20, pivot: 'frontWheelL' },
    /** cadrage de découpe du canvas (px de maquette) : x, y, w, h */
    clip: [48, 240, 620, 560] },
];

/**
 * Repères de la galerie (caméra libre). Chaque repère a une position (lancer de rayon sur la carrosserie ou point
 * de référence du modèle) et une NORMALE sortante : il n'est affiché que s'il est dans le champ ET tourné vers la caméra.
 * `detail: true` → un clic mène à l'état « Détails » (roue & frein avant).
 */
export const HOTSPOTS = [
  { id: 'sideR',  label: 'Ligne latérale', ray: { origin: [0.25, 0.62, 4], dir: [0, 0, -1] },  normal: [0, 0, 1] },
  { id: 'sideL',  label: 'Ligne latérale', ray: { origin: [0.1, 0.62, -4], dir: [0, 0, 1] },   normal: [0, 0, -1] },
  { id: 'headR',  label: 'Phares',         anchor: 'headlightR',                                normal: [0.75, 0.15, 0.65] },
  { id: 'headL',  label: 'Phares',         anchor: 'headlightL',                                normal: [0.75, 0.15, -0.65] },
  { id: 'wheelR', label: 'Roue',           anchor: 'frontWheelR', offset: [0, 0, 0.12],        normal: [0, 0, 1],  detail: true },
  { id: 'wheelL', label: 'Roue',           anchor: 'frontWheelL', offset: [0, 0, -0.12],       normal: [0, 0, -1], detail: true },
  { id: 'wing',   label: 'Aileron',        ray: { origin: [-6, 0.86, 0], dir: [1, 0, 0] },     normal: [-1, 0.25, 0] },
  { id: 'exhaust', label: 'Échappements',  ray: { origin: [-6, 0.6, 0], dir: [1, 0, 0] },      normal: [-1, 0, 0] },
];

/** Caméra libre de la galerie : rotation complète autour de la voiture, élévation et zoom bornés. */
export const ORBIT = {
  elMin: 2, elMax: 32,        // ° — pas de vue de dessous, pas de plongée complète
  speed: 0.28,                // ° par pixel de glissement
  damping: 3.4,               // inertie après relâchement (plus grand = s'arrête plus vite)
  zoom: [0.72, 1.3],          // multiple de la distance du cadrage de départ
  facing: 0.2,                // cos min. entre la normale du repère et la direction de la caméra
  maxLabels: 5,               // repères visibles en même temps
};

/** Rythme : transitions entre phases + intro automatique (secondes). */
export const MOTION = {
  step: 1.7,                 // durée d'un travelling entre deux phases
  ease: 'power3.inOut',
  textAt: 0.8,               // le texte démarre quand la transition est à 80 % (caméra qui finit de freiner)
  veilIn: 0.3, veilOut: 0.45, // fondu pour les sauts lointains (ancres du menu)
  // Défilement libre : sensibilité de la molette, lissage, seuils d'affichage du texte,
  // dwell = durée (s) pendant laquelle la molette est ignorée quand la caméra atteint un écran ; rearm = distance à parcourir avant qu'un écran bloque à nouveau
  free: { sens: 1 / 800, ease: 7, easeIn: 5, textIn: 0.18, textOut: 0.3, dwell: 1, rearm: 0.3 },
  intro: {
    dark: 0.8,               // noir complet avant l'allumage des phares
    lights: 2.4,             // phares seuls, avant l'éclair
    ford: 2.5,               // « FORD » affiché
    settle: 2.2,             // « 2017 » + texte avant de rendre la main
    push: 7.5,               // durée du travelling avant
    pushAmount: 0.12,        // +12 % de distance au départ
  },
};

export const COLORS = { brand: '#3366b4', cinema: '#090909' };
