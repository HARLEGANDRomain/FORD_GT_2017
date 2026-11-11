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
import { MOBILE } from './device.js';

/** Cadrage actif : `mcam` (portrait, ancre [x en px de 390, y en fraction de hauteur]) sur mobile, sinon `cam`. */
export const camOf = (e) => (MOBILE && e.mcam ? e.mcam : e.cam);
/** Découpe du canvas (état « Détails ») : `mclip` = [x px, y fraction, w px, h fraction] sur mobile. */
export const clipOf = (e) => (MOBILE && e.mclip ? e.mclip : e.clip);

export const SCREENS = [
  { n: 1, id: 'intro', hash: 'intro', ref: '1. GT40 - 2017 - Cinematique/intro Page@2x.png',
    cam: 'same-as-2', exposure: 0, bg: 'cinema', header: false },

  { n: 2, id: 'modele', hash: 'modele', ref: '2. GT40 - 2017 - Landing page@2x.png',
    cam: { az: 180, el: 4, dist: 8.3, fov: 28, pivot: 'center', anchor: [647, 700] },
    mcam: { az: 180, el: 4, dist: 10.3, fov: 28, pivot: 'center', anchor: [195, 0.6] } },

  { n: 3, id: 'presentation', hash: 'presentation', ref: '3. GT40 - 2017 - Landing page@2x.png',
    cam: 'same-as-2' },

  { n: 4, id: 'heritage', hash: 'histoire', ref: '4. La course en héritage@2x.png',
    cam: { az: 92, el: 6, dist: 6.7, fov: 28, pivot: 'center', anchor: [1085, 629] },
    mcam: { az: 92, el: 6, dist: 21, fov: 28, pivot: 'center', anchor: [195, 0.63] } },

  { n: 5, id: 'nouvelle-ere', hash: 'nouvelle-ere', ref: '5. Une nouvelle ère@2x.png',
    cam: { az: 92, el: 6, dist: 6.7, fov: 28, pivot: 'center', anchor: [625, 615] },
    mcam: { az: 92, el: 6, dist: 21, fov: 28, pivot: 'center', anchor: [195, 0.5] } },

  { n: 6, id: 'fabrication', hash: 'fabrication', ref: '6. Rare par nature@2x.png',
    cam: { az: 78, el: 6, dist: 6.7, fov: 28, pivot: 'rearWheelL', anchor: [560, 690] },
    mcam: { az: 78, el: 6, dist: 11.5, fov: 28, pivot: 'rearWheelL', anchor: [130, 0.59] } },

  { n: 7, id: 'performances', hash: 'performances', ref: '7. De la vision à la route@2x.png',
    cam: { az: 0, el: 5, dist: 7.7, fov: 28, pivot: 'center', anchor: [640, 745] },
    mcam: { az: 0, el: 5, dist: 10.5, fov: 28, pivot: 'center', anchor: [195, 0.56] } },

  { n: 8, id: 'le-mans', hash: 'le-mans', ref: '8. Le Mans encore@2x.png',
    cam: { az: 0, el: 89.6, dist: 11.7, fov: 28, pivot: 'center', anchor: [597, 598] },
    mcam: { az: 0, el: 89.6, dist: 21.5, fov: 28, pivot: 'center', anchor: [262, 0.5] } },

  { n: 9, id: 'derniere-edition', hash: 'derniere-edition', ref: '9. L’histoire continue@2x.png',
    cam: { az: 225, el: 22, dist: 10.6, fov: 28, pivot: 'center', anchor: [650, 520] },
    mcam: { az: 225, el: 22, dist: 19.5, fov: 28, pivot: 'center', anchor: [195, 0.465] } },

  // 10 · 11 · 12 : un seul écran de défilement, trois (quatre) états pilotés par les miniatures.
  { n: 10, id: 'galerie', hash: 'galerie', ref: '10. Galerie - Vue d\'ensemble@2x.png', cam: 'gallery' },

  // 13 · Épilogue : même cadrage de face que l'écran 02, studio éteint et phares allumés (miroir de l'intro).
  { n: 13, id: 'fin', hash: 'fin', ref: null, cam: 'same-as-2', look: 'night' },
];

/** Index de l'écran Galerie dans SCREENS (l'épilogue vient après). */
export const GALLERY_INDEX = SCREENS.findIndex((sc) => sc.cam === 'gallery');

/** Apparence « nuit » de l'épilogue : mêmes grandeurs que l'intro (voir L dans main.js). */
export const NIGHT = { lights: 1, dark: 0.008, bg: 0, idle: 1 };

/** États de la galerie (miniatures). `thumb` = cadrage de la miniature (rendu 16:9 depuis le même modèle). */
export const GALLERY = [
  { key: 'avant', label: 'Avant', n: 10, ref: '10. Galerie - Vue d\'ensemble@2x.png',
    cam: { az: 222, el: 10, dist: 5.65, fov: 40, pivot: 'center', anchor: [565, 455] },
    mcam: { az: 222, el: 10, dist: 14, fov: 40, pivot: 'center', anchor: [195, 0.5] },
    thumb: { az: 225, el: 10, dist: 8.6, fov: 20, pivot: 'center' } },
  { key: 'profil', label: 'Profil', n: 10, ref: null, // pas de maquette : cadrage dérivé
    cam: { az: 90, el: 6, dist: 9.4, fov: 28, pivot: 'center', anchor: [640, 530] },
    mcam: { az: 90, el: 6, dist: 24, fov: 28, pivot: 'center', anchor: [195, 0.5] },
    thumb: { az: 90, el: 8, dist: 6.0, fov: 20, pivot: [0.35, 0.55, 0] } },
  { key: 'arriere', label: 'Arrière', n: 11, ref: '11. Galerie - Vue arrière@2x.png',
    cam: { az: 0, el: 5, dist: 7.0, fov: 28, pivot: 'center', anchor: [632, 500] },
    mcam: { az: 0, el: 5, dist: 10.5, fov: 28, pivot: 'center', anchor: [195, 0.48] },
    thumb: { az: 0, el: 8, dist: 6.2, fov: 20, pivot: [0, 0.6, 0] } },
  { key: 'detail', label: 'Détails', n: 12, ref: '12. Galerie - Détail@2x.png',
    cam: { az: 92, el: 3, dist: 6.7, fov: 28, pivot: 'frontWheelL', anchor: [380, 510] },
    mcam: { az: 92, el: 3, dist: 6, fov: 28, pivot: 'frontWheelL', anchor: [195, 0.38] },
    thumb: { az: 92, el: 6, dist: 3.4, fov: 20, pivot: 'frontWheelL' },
    /** cadrage de découpe du canvas (px de maquette) : x, y, w, h */
    clip: [48, 240, 620, 560], mclip: [20, 0.19, 350, 0.38] },
];

/**
 * Repères de la galerie (caméra libre). Chaque repère a une position (lancer de rayon sur la carrosserie ou point
 * de référence du modèle) et une NORMALE sortante : il n'est affiché que s'il est dans le champ ET tourné vers la caméra.
 * `detail: true` → un clic mène à l'état « Détails » (roue & frein avant).
 */
// Fiches des repères : un clic sur un repère cadre la caméra dessus (même mise en page que l'écran 12) et affiche la fiche.
//   cam = angle de vue de la fiche (le pivot est le repère lui-même) ; mdist = distance sur mobile ; wing = déploie l'aileron.
const INFO = {
  arches: { title: 'Arches <br class="dbr" />aérodynamiques', text: 'Entre le cockpit en goutte d’eau et les ailes arrière, deux arches laissent l’air traverser la carrosserie et le guident vers l’aileron. Elles sont creuses : l’air comprimé par les turbos y circule avant de rejoindre le moteur.' },
  phares: { title: 'Signature <br class="dbr" />lumineuse', text: 'Les phares à LED dessinent un C ouvert vers l’extérieur. C’est lui que l’on voit en premier, seul dans le noir, au tout début de ce récit.' },
  roue:   { title: 'Roue &amp; Frein <br class="dbr" />Avant', text: 'Les branches sombres de la jante dévoilent le disque de frein et son étrier doré. Un jeu de contrastes qui souligne le dessin de la roue avant.' },
  aileron: { title: 'Aileron <br class="dbr" />actif', text: 'Escamoté dans la poupe, il se déploie avec la vitesse et change de profil pour augmenter l’appui. Au freinage, il se redresse et sert d’aérofrein.' },
  echappements: { title: 'Double sortie <br class="dbr" />centrale', text: 'Les deux sorties du V6 biturbo sont regroupées au centre de la poupe. De part et d’autre, les feux ronds sont creux : ils évacuent l’air chaud des échangeurs.' },
};

export const HOTSPOTS = [
  { id: 'sideR',  label: 'Arches',        ray: { origin: [-1.05, 0.88, 4], dir: [0, 0, -1] },  normal: [-0.25, 0.3, 1],
    info: { ...INFO.arches, cam: { az: 312, el: 16, dist: 5.4, fov: 28 }, mdist: 6.4 } },
  { id: 'sideL',  label: 'Arches',        ray: { origin: [-1.05, 0.88, -4], dir: [0, 0, 1] },  normal: [-0.25, 0.3, -1],
    info: { ...INFO.arches, cam: { az: 48, el: 16, dist: 5.4, fov: 28 }, mdist: 6.4 } },
  { id: 'headR',  label: 'Phares',         anchor: 'headlightR',                                normal: [0.75, 0.15, 0.65],
    info: { ...INFO.phares, cam: { az: 208, el: 7, dist: 4.6, fov: 28 }, mdist: 5.4 } },
  { id: 'headL',  label: 'Phares',         anchor: 'headlightL',                                normal: [0.75, 0.15, -0.65],
    info: { ...INFO.phares, cam: { az: 152, el: 7, dist: 4.6, fov: 28 }, mdist: 5.4 } },
  { id: 'wheelR', label: 'Roue',           anchor: 'frontWheelR', offset: [0, 0, 0.12],        normal: [0, 0, 1],
    info: { ...INFO.roue, cam: { az: 268, el: 3, dist: 6.7, fov: 28 }, mdist: 6 } },
  { id: 'wheelL', label: 'Roue',           anchor: 'frontWheelL', offset: [0, 0, -0.12],       normal: [0, 0, -1],
    info: { ...INFO.roue, cam: { az: 92, el: 3, dist: 6.7, fov: 28 }, mdist: 6 } },
  { id: 'wing',   label: 'Aileron',        anchor: 'wing',                                      normal: [-1, 0.6, 0],
    info: { ...INFO.aileron, cam: { az: 38, el: 15, dist: 5.6, fov: 28 }, mdist: 6.6, wing: true } },
  { id: 'exhaust', label: 'Échappements',  ray: { origin: [-6, 0.6, 0], dir: [1, 0, 0] },      normal: [-1, 0, 0],
    info: { ...INFO.echappements, cam: { az: 0, el: 5, dist: 5.0, fov: 28 }, mdist: 5.8 } },
];
/** Repère affiché par la miniature « Détails ». */
export const DEFAULT_SPOT = 'wheelL';
/** Point d'ancrage de la fiche : où le repère se projette dans le cadre (bureau : px de maquette ; mobile : [x px, y fraction]). */
export const SPOT_ANCHOR = { desktop: [380, 510], mobile: [195, 0.38] };

/**
 * Livrées proposées dans la galerie. La première est la teinte de série (couleur du modèle, sans bandes).
 * color / stripe = couleurs sRGB ; band = [bord intérieur, bord extérieur] des bandes en m depuis l'axe (−1 = bande centrale pleine).
 * Les numéros de course et cocardes des vraies Heritage Edition ne sont pas reproduits.
 */
export const LIVERIES = [
  { key: 'serie', name: 'Liquid Blue', note: 'La teinte de série, celle de ce récit.', swatch: '#0b2f8a' },
  { key: 'h66', name: '’66 Heritage Edition', note: 'Noir et bandes argent : hommage à la GT40 Mk II n° 2, victorieuse au Mans en 1966.', color: '#0a0a0c', stripe: '#b9bdc4', band: [0.07, 0.27] },
  { key: 'h67', name: '’67 Heritage Edition', note: 'Rouge et bandes blanches : hommage à la GT40 Mk IV n° 1, victorieuse au Mans en 1967.', color: '#b50a12', stripe: '#f4f4f4', band: [0.07, 0.27] },
  { key: 'h68', name: '’68 Heritage Edition', note: 'Bleu et orange Gulf : hommage à la GT40 n° 9, victorieuse au Mans en 1968.', color: '#8ec3e6', stripe: '#f2691c', band: [-1, 0.2] },
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
