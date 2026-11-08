/**
 * Mode mobile (portrait étroit) : mise en page dédiée dans un cadre de 390 px de large.
 * Le mode est fixé au chargement ; si l'écran traverse le seuil (rotation, redimensionnement), on recharge.
 */
const mq = window.matchMedia('(orientation: portrait) and (max-width: 600px)');
export const MOBILE = mq.matches;
export const DESIGN_W = MOBILE ? 390 : 1280;
document.documentElement.classList.toggle('m', MOBILE);
mq.addEventListener('change', () => location.reload());
