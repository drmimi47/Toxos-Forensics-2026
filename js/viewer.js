import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import CONFIG from '../config/config.js';

export function createViewer() {
  const container = document.getElementById('viewer-container');

  const isMobile = window.innerWidth <= 640;
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.id = 'label-renderer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);

  const aspect = container.clientWidth / container.clientHeight;
  const frustumSize = CONFIG.camera.orthoSize || 4000;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect,
    frustumSize * aspect,
    frustumSize,
    -frustumSize,
    CONFIG.camera.near,
    CONFIG.camera.far
  );

  // True isometric angle: 45° around Y, ~35.264° down (arctan(1/√2))
  const isoDist = 8000;
  const isoY = isoDist * Math.sin(Math.atan(1 / Math.SQRT2));
  const isoXZ = isoDist * Math.cos(Math.atan(1 / Math.SQRT2));
  camera.position.set(isoXZ, isoY, isoXZ);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.28;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.enableZoom = true;
  controls.minZoom = 0.50;
  controls.maxZoom = 25;
  controls.maxPolarAngle = Math.PI / 2.05;

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sunLight.position.set(4000, 12000, 6000);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xc8d8ec, 0.4);
  fillLight.position.set(-5000, 6000, -4000);
  scene.add(fillLight);

  const hemi = new THREE.HemisphereLight(0xe8e4dc, 0x8a9080, 0.5);
  scene.add(hemi);

  let pendingW = 0, pendingH = 0;

  const PANEL_PX = 404;
  let panelT = 0;
  let panelTarget = 0;
  let panelPrevTime = performance.now();
  let _baseHalfH = 0;

  /**
   * Shift + scale the orthographic frustum so the scene appears centred in
   * the remaining visible area when the detail panel is open.
   *
   * Shift derivation: for the world origin to appear at NDC x = –P/W
   *   left  = –f + shift,  right = f + shift
   *   NDC(0) = –(right+left)/(right–left) = –shift/f  →  shift = P·f/W ✓
   */
  function applyPanelToCamera() {
    const base = _baseHalfH || camera.top;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    const a = w / h;
    const scale = 1 + 0.12 * panelT;
    const halfH = base * scale;
    const halfW = halfH * a;

    if (w <= 640) {
      const PANEL_FRAC = 0.72;
      const s = -(PANEL_FRAC * panelT) * halfH;
      camera.top = halfH + s;
      camera.bottom = -halfH + s;
      camera.left = -halfW;
      camera.right = halfW;
    } else {
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
    applyPanelToCamera();
    pendingW = w;
    pendingH = h;
  }

  window.addEventListener('resize', handleResize);
  new ResizeObserver(handleResize).observe(container);

  window.addEventListener('detail-open', () => {
    if (!_baseHalfH) _baseHalfH = camera.top;
    panelTarget = 1;
    panelPrevTime = performance.now();
  });
  window.addEventListener('detail-close', (e) => {
    if ((e.detail?.panelCount ?? 0) === 0) {
      panelTarget = 0;
      panelPrevTime = performance.now();
    }
  });

  let topDownAnim = null;
  let homeState = null;

  function setHomeState(pos, target) {
    homeState = { pos: pos.clone(), target: target.clone() };
  }

  function handleDoubleActivate() {
    if (document.body.classList.contains('dissected-mode')) return;
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target);

    const toCamera = camera.position.clone().sub(target);
    const xzLen = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
    const isTopDown = xzLen / dist < 0.08;

    if (topDownAnim) topDownAnim.done = true;

    if (isTopDown && homeState) {
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
      // Tiny Z offset avoids gimbal-lock singularity when OrbitControls resumes
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

  renderer.domElement.addEventListener('dblclick', handleDoubleActivate);
  window.addEventListener('double-tap', handleDoubleActivate);

  let _tiltActive        = false;
  let _tiltNeedsSnapshot = false;
  let _tiltCurrentTheta  = 0;
  let _tiltTargetTheta   = 0;
  let _tiltPhi           = 0;
  let _tiltR             = 0;

  const TILT_THETA_MIN = 0.05;
  const TILT_THETA_MAX = 1.45;
  const TILT_SPEED     = 0.0007;
  const TILT_LERP      = 0.10;

  function _snapshotTilt() {
    const offset = camera.position.clone().sub(controls.target);
    _tiltR            = offset.length();
    _tiltCurrentTheta = Math.acos(THREE.MathUtils.clamp(offset.y / _tiltR, -1, 1));
    _tiltPhi          = Math.atan2(offset.x, offset.z);
    _tiltTargetTheta  = _tiltCurrentTheta;
  }

  function _onTiltWheel(e) {
    if (!_tiltActive) return;
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;
    if (e.deltaMode === 2) delta *= 600;
    _tiltTargetTheta = THREE.MathUtils.clamp(
      _tiltTargetTheta + delta * TILT_SPEED,
      TILT_THETA_MIN,
      TILT_THETA_MAX
    );
  }
  renderer.domElement.addEventListener('wheel', _onTiltWheel, { passive: false });

  function enableDissectedTilt(enable) {
    _tiltActive = enable;
    if (enable) _tiltNeedsSnapshot = true;
  }

  function easeInOutQuart(t) {
    return t < 0.5
      ? 8 * t * t * t * t
      : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }

  let _tickSprites = null;
  function setTickSprites(fn) { _tickSprites = fn; }

  function animate() {
    requestAnimationFrame(animate);

    if (pendingW > 0) {
      renderer.setSize(pendingW, pendingH);
      labelRenderer.setSize(pendingW, pendingH);
      pendingW = 0;
      pendingH = 0;
    }

    {
      const duration = 0.38;
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

      camera.position.lerpVectors(a.startPos, a.endPos, e);
      camera.quaternion.slerpQuaternions(a.startQuat, a.endQuat, e);

      if (t >= 1) {
        controls.enabled = true;
        controls.target.copy(a.target);
        const wasDamping = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();
        controls.enableDamping = wasDamping;

        camera.position.copy(a.endPos);
        camera.quaternion.copy(a.endQuat);

        a.done = true;
      }
    } else {
      if (_tiltActive && _tiltNeedsSnapshot) {
        _snapshotTilt();
        _tiltNeedsSnapshot = false;
      }
      if (_tiltActive && Math.abs(_tiltCurrentTheta - _tiltTargetTheta) > 0.0001) {
        _tiltCurrentTheta = THREE.MathUtils.lerp(_tiltCurrentTheta, _tiltTargetTheta, TILT_LERP);
        const sinT = Math.sin(_tiltCurrentTheta);
        const cosT = Math.cos(_tiltCurrentTheta);
        camera.position.set(
          controls.target.x + _tiltR * sinT * Math.sin(_tiltPhi),
          controls.target.y + _tiltR * cosT,
          controls.target.z + _tiltR * sinT * Math.cos(_tiltPhi)
        );
        camera.lookAt(controls.target);
      }
      controls.update();
    }

    if (_tickSprites) _tickSprites();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

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

  function goDissectedView(yOffset = 1200) {
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;
    const offset   = new THREE.Vector3(0, yOffset, 0);
    const endPos   = homeState.pos.clone().add(offset);
    const endTarget = homeState.target.clone().add(offset);
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, endTarget, new THREE.Vector3(0, 1, 0));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target: endTarget,
      t0: performance.now(), duration: 900, done: false
    };
    controls.enabled = false;
  }

  function goFatbergView() {
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;
    const target = homeState.target.clone();
    const dist = homeState.pos.distanceTo(target);
    // Flatten isometric direction: keep XZ azimuth, pull Y to ~60% (shifts elevation from ~35° to ~22°)
    const homeDir = homeState.pos.clone().sub(target).normalize();
    const flatDir = new THREE.Vector3(homeDir.x, homeDir.y * 0.6, homeDir.z).normalize();
    const endPos = target.clone().addScaledVector(flatDir, dist);
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 1, 0));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target,
      t0: performance.now(), duration: 900, done: false
    };
    controls.enabled = false;
  }

  function goTopDown() {
    if (topDownAnim) topDownAnim.done = true;
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target);
    const endPos = new THREE.Vector3(target.x, target.y + dist, target.z + 0.1);
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 0, -1));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target,
      t0: performance.now(), duration: 800, done: false
    };
    controls.enabled = false;
  }

  return { scene, camera, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, goTopDown, enableDissectedTilt };
}
