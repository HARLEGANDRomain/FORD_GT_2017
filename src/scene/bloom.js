import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Bloom sélectif, sans aucune lumière dans la scène.
 * 1. La scène est redessinée dans une cible basse résolution où tout est noir sauf les LED (matériaux émissifs « bloom »).
 * 2. UnrealBloom floute ce rendu sur plusieurs échelles → halo qui épouse la forme exacte des LED.
 * 3. Le résultat est ajouté (additif) par-dessus le rendu principal : aucune géométrie, aucun sprite, aucun point lumineux.
 */
export function createBloom(stage, car, led) {
  const { renderer, scene, camera, shadow } = stage;
  const bMat = () => new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const guideB = bMat(), barsB = bMat();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); // vitres : n'occultent pas
  const cache = new Map();

  const meshes = [];
  car.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const mapMat = (m) => (m === led.guideMat ? guideB : m === led.barsMat ? barsB : m.transparent ? ghost : black);
  for (const o of meshes) {
    cache.set(o, Array.isArray(o.material) ? o.material.map(mapMat) : mapMat(o.material));
  }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
  composer.renderToScreen = false;
  composer.addPass(new RenderPass(scene, camera));
  const pass = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0);
  composer.addPass(pass);

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, gain: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D map; uniform float gain; varying vec2 vUv;
      void main(){ vec3 c = texture2D(map, vUv).rgb * gain; gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0., 1.)); 
      #include <colorspace_fragment>
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
  }));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  qScene.add(quad);

  const SCALE = 0.5;
  function resize() {
    const w = Math.max(2, Math.round(stage.size.w * SCALE)), h = Math.max(2, Math.round(stage.size.h * SCALE));
    composer.setPixelRatio(1);
    composer.setSize(w, h);
  }
  resize();

  /** guide / bars : niveaux d'émission (≥ 0). À appeler après le rendu principal. */
  function render(guide, bars) {
    const g = Math.max(0, guide), b = Math.max(0, bars);
    if (g < 0.003 && b < 0.003) return;
    guideB.color.setScalar(g); barsB.color.setScalar(b);
    pass.strength = 0.7 + Math.min(1, Math.max(g, b)) * 0.4;
    for (const [o, m] of cache) { o.userData._m = o.material; o.material = m; }
    const sh = shadow.visible; shadow.visible = false;
    const bg = scene.background, env = scene.environment;
    scene.background = null; scene.environment = null;
    const prevTarget = renderer.getRenderTarget();
    composer.render();
    scene.background = bg; scene.environment = env;
    shadow.visible = sh;
    for (const o of cache.keys()) { o.material = o.userData._m; }
    quad.material.uniforms.map.value = composer.readBuffer.texture;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(prevTarget);
    renderer.render(qScene, qCam);
    renderer.autoClear = ac;
  }
  return { render, resize };
}
