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
  // On mobile: skip antialias (big GPU win) and cap DPR at 1.5 (3× phones would
  // otherwise render 9× as many pixels for a barely perceptible quality bump).
  const isMobile = window.innerWidth <= 640;
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
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
  controls.minZoom = 0.50;
  controls.maxZoom = 25;
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
  // Pending renderer dimensions – updated by ResizeObserver every frame of the
  // CSS transition; consumed inside animate() so the canvas clear + redraw are
  // atomic and never produce a visible blank frame.
  let pendingW = 0, pendingH = 0;

  // ---- Panel shift state ----
  // When the detail card opens we shift + slightly shrink the camera frustum so
  // the scene re-centres in the visible area and appears a touch smaller.
  const PANEL_PX = 404;   // visual width the open card occupies (px)
  let panelT = 0;          // 0 = closed, 1 = fully open
  let panelTarget = 0;
  let panelPrevTime = performance.now();
  let _baseHalfH = 0;          // camera.top captured after frameBoundingBox

  /**
   * Shift + scale the orthographic frustum so the scene appears centred in
   * the remaining visible area and slightly zoomed out when the panel is open.
   *
   * Shift derivation: for the world origin to appear at NDC x = –P/W
   *   left  = –f + shift,  right = f + shift
   *   NDC(0) = –(right+left)/(right–left) = –shift/f  →  shift = P·f/W ✓
   */
  function applyPanelToCamera() {
    const base = _baseHalfH || camera.top;  // post-framing half-height
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    const a = w / h;
    const scale = 1 + 0.12 * panelT;       // expand frustum → objects appear smaller
    const halfH = base * scale;
    const halfW = halfH * a;

    if (w <= 640) {
      // Mobile: bottom sheet at 72 vh — shift frustum up so scene centres in top 28 %.
      // Derivation (analogous to horizontal case):
      //   NDC_y(origin) = –s / halfH  →  want that = PANEL_FRAC * panelT
      //   ∴  s = –PANEL_FRAC * panelT * halfH
      const PANEL_FRAC = 0.72;
      const s = -(PANEL_FRAC * panelT) * halfH;
      camera.top = halfH + s;
      camera.bottom = -halfH + s;
      camera.left = -halfW;
      camera.right = halfW;
    } else {
      // Desktop: right card at 404 px — shift frustum right so scene centres in remaining area.
      const P = PANEL_PX * panelT;
      const shift = P * halfW / w;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.left = -halfW + shift;
      camera.right = halfW + shift;
    }
    camera.updateProjectionMatrix();
  }

  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    // Recompute frustum (incorporates current panelT).
    // Pure math op – no canvas side-effects.
    applyPanelToCamera();

    // Mark renderer resize pending; animate() will consume this once per frame
    // right before renderer.render(), so the canvas is never left blank.
    pendingW = w;
    pendingH = h;
  }

  // Fire on true window resize (browser chrome, orientation change, etc.)
  window.addEventListener('resize', handleResize);

  // Also fire whenever the container itself resizes.
  new ResizeObserver(handleResize).observe(container);

  // Listen for panel open / close to start the camera animation
  window.addEventListener('detail-open', () => {
    if (!_baseHalfH) _baseHalfH = camera.top;  // capture once, post-framing
    panelTarget = 1;
    panelPrevTime = performance.now();
  });
  window.addEventListener('detail-close', (e) => {
    // Only unshift the camera when the very last panel has closed.
    // With multi-panel, intermediate closes carry panelCount > 0.
    if ((e.detail?.panelCount ?? 0) === 0) {
      panelTarget = 0;
      panelPrevTime = performance.now();
    }
  });

  // ---- Double-click → toggle between top-down and isometric home view ----
  let topDownAnim = null;
  let homeState = null;

  /** Store the post-framing isometric camera state so we can return to it. */
  function setHomeState(pos, target) {
    homeState = { pos: pos.clone(), target: target.clone() };
  }

  // Shared handler for both desktop dblclick and mobile double-tap.
  function handleDoubleActivate() {
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target);

    // Detect if camera is already in top-down view:
    // when near-vertical, the XZ offset from the target is a tiny fraction of dist.
    const toCamera = camera.position.clone().sub(target);
    const xzLen = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
    const isTopDown = xzLen / dist < 0.08;

    if (topDownAnim) topDownAnim.done = true;

    if (isTopDown && homeState) {
      // Already top-down → animate back to isometric home
      const endPos = homeState.pos.clone();
      const homeTarget = homeState.target.clone();
      const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, homeTarget, new THREE.Vector3(0, 1, 0));
      const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);

      topDownAnim = {
        startPos: camera.position.clone(), endPos,
        startQuat: camera.quaternion.clone(), endQuat,
        target: homeTarget,
        t0: performance.now(), duration: 800, done: false
      };
    } else {
      // Animate to top-down view.
      // Tiny Z offset avoids gimbal-lock singularity when OrbitControls resumes.
      const endPos = new THREE.Vector3(target.x, target.y + dist, target.z + 0.1);
      const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 0, -1));
      const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);

      topDownAnim = {
        startPos: camera.position.clone(), endPos,
        startQuat: camera.quaternion.clone(), endQuat,
        target,
        t0: performance.now(), duration: 800, done: false
      };
    }
    controls.enabled = false;
  }

  // Desktop: native double-click on the canvas
  renderer.domElement.addEventListener('dblclick', handleDoubleActivate);
  // Mobile: custom event dispatched by utils.js double-tap detector
  window.addEventListener('double-tap', handleDoubleActivate);

  function easeInOutQuart(t) {
    return t < 0.5
      ? 8 * t * t * t * t
      : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }

  // ---- Render loop ----
  /** @type {Function|null} per-frame sprite-scale updater, set by setupTooltips */
  let _tickSprites = null;
  function setTickSprites(fn) { _tickSprites = fn; }

  function animate() {
    requestAnimationFrame(animate);

    // Flush any pending renderer resize here – immediately before rendering –
    // so the canvas clear and the redraw are in the same frame and never visible.
    if (pendingW > 0) {
      renderer.setSize(pendingW, pendingH);
      labelRenderer.setSize(pendingW, pendingH);
      pendingW = 0;
      pendingH = 0;
    }

    // Ease-in-out panel frustum shift
    {
      // Animate panelT over a fixed duration
      const duration = 0.38; // seconds
      // Store animation start time and initial value
      if (typeof animate.panelAnim === 'undefined') animate.panelAnim = null;
      if (panelT !== panelTarget && !animate.panelAnim) {
        animate.panelAnim = {
          startT: panelT,
          endT: panelTarget,
          startTime: performance.now(),
        };
      }
      if (animate.panelAnim) {
        const now = performance.now();
        const t = Math.min((now - animate.panelAnim.startTime) / (duration * 1000), 1);
        panelT = animate.panelAnim.startT + (animate.panelAnim.endT - animate.panelAnim.startT) * easeInOutQuart(t);
        applyPanelToCamera();
        if (t >= 1) {
          panelT = animate.panelAnim.endT;
          animate.panelAnim = null;
        }
      } else {
        panelT = panelTarget;
      }
    }

    if (topDownAnim && !topDownAnim.done) {
      const a = topDownAnim;
      const t = Math.min((performance.now() - a.t0) / a.duration, 1);
      const e = easeInOutQuart(t);

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

  /** Smoothly animate the camera back to the post-framing isometric home state. */
  function goHome() {
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;
    const endPos = homeState.pos.clone();
    const homeTarget = homeState.target.clone();
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, homeTarget, new THREE.Vector3(0, 1, 0));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target: homeTarget,
      t0: performance.now(), duration: 900, done: false
    };
    controls.enabled = false;
  }

  return { scene, camera, renderer, controls, setTickSprites, setHomeState, goHome };
}
