/**
 * viewer.js – Sets up the Three.js scene, camera, renderer, controls, and lights.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import CONFIG from '../config/config.js';

/** Create and return all core viewer objects. */
export function createViewer() {
  const container = document.getElementById('viewer-container');

  // ---- Renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // ---- CSS2D overlay renderer (labels that always face the camera) ----
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.id = 'label-renderer';
  container.appendChild(labelRenderer.domElement);

  // ---- Scene ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);

  // ---- Camera (Isometric / Orthographic) ----
  const aspect = container.clientWidth / container.clientHeight;
  const frustumSize = CONFIG.camera.orthoSize || 4000; // half-height in world units
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect,   // left
     frustumSize * aspect,   // right
     frustumSize,             // top
    -frustumSize,             // bottom
    CONFIG.camera.near,
    CONFIG.camera.far
  );

  // True isometric angle: rotate 45° around Y, then ~35.264° down (arctan(1/√2))
  const isoDist = 8000;
  const isoY = isoDist * Math.sin(Math.atan(1 / Math.SQRT2)); // ≈ elevation
  const isoXZ = isoDist * Math.cos(Math.atan(1 / Math.SQRT2)); // ≈ ground offset
  camera.position.set(isoXZ, isoY, isoXZ);
  camera.lookAt(0, 0, 0);

  // ---- Controls ----
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.28;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.enableZoom = true;
  // For ortho cameras OrbitControls zooms by scaling the frustum
  controls.minZoom = 0.1;
  controls.maxZoom = 10;
  controls.maxPolarAngle = Math.PI / 2.05;

  // ---- Lights ----
  // Soft ambient base
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // Main directional (warm sunlight from upper-right)
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sunLight.position.set(4000, 12000, 6000);
  scene.add(sunLight);

  // Secondary fill (cool, opposite side to reduce harsh shadows)
  const fillLight = new THREE.DirectionalLight(0xc8d8ec, 0.4);
  fillLight.position.set(-5000, 6000, -4000);
  scene.add(fillLight);

  // Hemisphere – warm sky / cool ground for natural tonal range
  const hemi = new THREE.HemisphereLight(0xe8e4dc, 0x8a9080, 0.5);
  scene.add(hemi);

  // ---- Resize handler ----
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const a = w / h;
    // Preserve current frustum height, just update aspect
    const halfH = camera.top;   // current half-height (may have been set by frameBoundingBox)
    camera.left   = -halfH * a;
    camera.right  =  halfH * a;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  });

  // ---- Double-click → smooth top-down view ----
  let topDownAnim = null;

  renderer.domElement.addEventListener('dblclick', () => {
    const target = controls.target.clone();
    const dist   = camera.position.distanceTo(target);

    // Tiny Z offset avoids gimbal-lock singularity when OrbitControls resumes
    const endPos    = new THREE.Vector3(target.x, target.y + dist, target.z + 0.1);
    const startPos  = camera.position.clone();
    const startQuat = camera.quaternion.clone();

    // Build a deterministic top-down quaternion from a fresh lookAt matrix.
    // Using an explicit up vector (negative Z = "north" on screen) avoids
    // inheriting any quirky orientation from the current camera state.
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 0, -1));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);

    if (topDownAnim) topDownAnim.done = true;

    topDownAnim = {
      startPos, endPos, startQuat, endQuat, target,
      t0: performance.now(), duration: 800, done: false
    };
    controls.enabled = false;
  });

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---- Render loop ----
  /** @type {Function|null} per-frame sprite-scale updater, set by setupTooltips */
  let _tickSprites = null;
  function setTickSprites(fn) { _tickSprites = fn; }

  function animate() {
    requestAnimationFrame(animate);

    if (topDownAnim && !topDownAnim.done) {
      const a = topDownAnim;
      const t = Math.min((performance.now() - a.t0) / a.duration, 1);
      const e = easeInOutCubic(t);

      // Slerp quaternion instead of per-frame lookAt → no gimbal-lock jitter
      camera.position.lerpVectors(a.startPos, a.endPos, e);
      camera.quaternion.slerpQuaternions(a.startQuat, a.endQuat, e);

      if (t >= 1) {
        // Drain any residual OrbitControls damping so it can't jiggle
        controls.enabled = true;
        controls.target.copy(a.target);
        const wasDamping = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();          // flushes internal sphericalDelta to zero
        controls.enableDamping = wasDamping;

        // Force the exact final pose (overrides whatever update() just did)
        camera.position.copy(a.endPos);
        camera.quaternion.copy(a.endQuat);

        a.done = true;
        // Next frame: controls.update() starts from this position with zero deltas
      }
    } else {
      controls.update();
    }

    if (_tickSprites) _tickSprites();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  return { scene, camera, renderer, controls, setTickSprites };
}
