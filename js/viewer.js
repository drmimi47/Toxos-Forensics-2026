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

  const orthoCamera = new THREE.OrthographicCamera(
    -frustumSize * aspect,
    frustumSize * aspect,
    frustumSize,
    -frustumSize,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
// camera perspective angle
  const perspCamera = new THREE.PerspectiveCamera(
    35,
    aspect,
    CONFIG.camera.near,
    CONFIG.camera.far
  );

  // True isometric angle: 45° around Y, ~35.264° down (arctan(1/√2))
  const isoDist = 8000;
  const isoY = isoDist * Math.sin(Math.atan(1 / Math.SQRT2));
  const isoXZ = isoDist * Math.cos(Math.atan(1 / Math.SQRT2));

  orthoCamera.position.set(isoXZ, isoY, isoXZ);
  orthoCamera.lookAt(0, 0, 0);

  perspCamera.position.set(isoXZ, isoY, isoXZ);
  perspCamera.lookAt(0, 0, 0);

  let activeCamera = orthoCamera; // always orthographic

  function setCameraMode(isPerspective) {
    const nextCamera = isPerspective ? perspCamera : orthoCamera;
    if (activeCamera === nextCamera) return;

    nextCamera.position.copy(activeCamera.position);
    nextCamera.quaternion.copy(activeCamera.quaternion);
    nextCamera.zoom = activeCamera.zoom;
    nextCamera.updateProjectionMatrix();

    activeCamera = nextCamera;
    controls.object = activeCamera;
    controls.update();
  }

  function getCamera() {
    return activeCamera;
  }

  const controls = new OrbitControls(activeCamera, renderer.domElement);
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

  // Stored after frameBoundingBox so resize can recompute the correct frustum
  // for any aspect ratio (portrait vs landscape) using the bounding sphere.
  let _sphereRadius = 0;
  let _spherePad = 0.80;

  function _baseHalfHFromSphere(w, h) {
    if (!_sphereRadius) return 0;
    const a = w / h;
    return Math.max(_sphereRadius / _spherePad, _sphereRadius / (_spherePad * a));
  }

  function setModelSphere(radius, pad) {
    _sphereRadius = radius;
    _spherePad = pad;
    // Seed _baseHalfH immediately so applyPanelToCamera uses the right base.
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w && h) _baseHalfH = _baseHalfHFromSphere(w, h);
  }

  function applyPanelToCamera() {
    const camera = activeCamera;
    if (!camera.isOrthographicCamera && !camera.isPerspectiveCamera) return;

    const base = _baseHalfH || (camera.isOrthographicCamera ? camera.top : 2000);
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    const a = w / h;
    const scale = 1 + 0.12 * panelT;

    if (camera.isOrthographicCamera) {
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
    } else {
      camera.aspect = a;
      // Provide basic aspect update, panel shifts not beautifully supported out-of-box for Persp yet
      // but it looks OK if we ignore view-offset.  
      if (w > 640 && panelT > 0) {
        // Perspective shift using setViewOffset
        const pixelShift = PANEL_PX * panelT;
        camera.setViewOffset(w, h, -pixelShift / 2, 0, w, h);
      } else {
        camera.clearViewOffset();
      }
    }
    camera.updateProjectionMatrix();
  }

  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    // Recompute base frustum height for the new aspect ratio so the model
    // always fits in both dimensions regardless of portrait/landscape changes.
    const newBase = _baseHalfHFromSphere(w, h);
    if (newBase > 0) _baseHalfH = newBase;
    applyPanelToCamera();
    pendingW = w;
    pendingH = h;
  }

  window.addEventListener('resize', handleResize);
  new ResizeObserver(handleResize).observe(container);

  window.addEventListener('detail-open', () => {
    if (document.body.classList.contains('collage-mode')) return;
    const camera = activeCamera;
    if (!_baseHalfH && camera.isOrthographicCamera) _baseHalfH = camera.top;
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
    const camera = activeCamera;
    if (document.body.classList.contains('dissected-mode')) return;
    if (document.body.classList.contains('collage-mode')) return;
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

  // ── Collage-mode two-finger trackpad pan ──────────────────────────────────
  let _collagePanActive = false;
  const COLLAGE_PAN_SPEED = 2.43;

  function _onCollagePanWheel(e) {
    if (!_collagePanActive) return;
    const camera = activeCamera;
    e.preventDefault();
    e.stopImmediatePropagation(); // block OrbitControls zoom & tilt handler

    // ctrlKey = trackpad pinch gesture → zoom
    if (e.ctrlKey) {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      if (e.deltaMode === 2) delta *= 300;
      const factor = Math.pow(0.98, delta);
      camera.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom * factor));
      camera.updateProjectionMatrix();
      return;
    }

    // Two-finger pan
    const scale = COLLAGE_PAN_SPEED / camera.zoom;

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

    const panDelta = new THREE.Vector3()
      .addScaledVector(right, e.deltaX * scale)
      .addScaledVector(up, -e.deltaY * scale);

    camera.position.add(panDelta);
    controls.target.add(panDelta);
  }
  // Register first so it can stopImmediatePropagation on later handlers
  renderer.domElement.addEventListener('wheel', _onCollagePanWheel, { passive: false });

  // ── Collage-mode pinch-to-zoom (touch only) ───────────────────────────────
  let _pinchActive = false;
  let _pinchStartDist = 0;
  let _pinchStartZoom = 1;

  function _pinchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  renderer.domElement.addEventListener('touchstart', (e) => {
    if (!_collagePanActive || e.touches.length !== 2) return;
    _pinchActive = true;
    _pinchStartDist = _pinchDist(e);
    _pinchStartZoom = activeCamera.zoom;
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', (e) => {
    if (!_collagePanActive || !_pinchActive || e.touches.length !== 2) return;
    e.preventDefault();
    const scale = _pinchDist(e) / _pinchStartDist;
    activeCamera.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, _pinchStartZoom * scale));
    activeCamera.updateProjectionMatrix();
  }, { passive: false });

  renderer.domElement.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) _pinchActive = false;
  }, { passive: true });

  function enableCollagePan(enable) { _collagePanActive = enable; }

  // ── Narrative scroll handler (runs after collage, before tilt) ──
  let _narrativeScrollHandler = null;

  function _onNarrativeWheel(e) {
    if (!_narrativeScrollHandler) return;
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;
    if (e.deltaMode === 2) delta *= 600;
    const shouldBlock = _narrativeScrollHandler(delta);
    if (shouldBlock) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  renderer.domElement.addEventListener('wheel', _onNarrativeWheel, { passive: false });

  function setNarrativeScrollHandler(fn) { _narrativeScrollHandler = fn; }

  function setTiltTarget(theta) {
    _tiltTargetTheta = THREE.MathUtils.clamp(theta, TILT_THETA_MIN, TILT_THETA_MAX);
  }

  function getTiltInfo() {
    return { current: _tiltCurrentTheta, target: _tiltTargetTheta, min: TILT_THETA_MIN, max: TILT_THETA_MAX };
  }

  function setControlsInteraction(rotate, pan, zoom) {
    controls.mouseButtons.LEFT = rotate ? THREE.MOUSE.ROTATE : null;
    controls.mouseButtons.RIGHT = pan ? THREE.MOUSE.PAN : null;
    controls.enableZoom = zoom;
  }

  // ── Dissected-mode tilt ───────────────────────────────────────────────────
  let _tiltActive = false;
  let _tiltNeedsSnapshot = false;
  let _tiltCurrentTheta = 0;
  let _tiltTargetTheta = 0;
  let _tiltPhi = 0;
  let _tiltR = 0;

  const TILT_THETA_MIN = 0.05;
  const TILT_THETA_MAX = 1.40; // ~80° — steep oblique by the end of the narrative
  const TILT_SPEED = 0.0007;
  const TILT_LERP = 0.10;

  function _snapshotTilt() {
    const camera = activeCamera;
    const offset = camera.position.clone().sub(controls.target);
    _tiltR = offset.length();
    _tiltCurrentTheta = Math.acos(THREE.MathUtils.clamp(offset.y / _tiltR, -1, 1));
    _tiltPhi = Math.atan2(offset.x, offset.z);
    _tiltTargetTheta = _tiltCurrentTheta;
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

    const camera = activeCamera;
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
        if (a.onComplete) a.onComplete();
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
    const camera = activeCamera;
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
    const camera = activeCamera;
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;
    const offset = new THREE.Vector3(0, yOffset, 0);
    const target = homeState.target.clone().add(offset);
    const dist = homeState.pos.distanceTo(homeState.target);

    // Flatten isometric direction: pull Y up to 1.15 (~15% steeper) to match visual constraints requested
    const homeDir = homeState.pos.clone().sub(homeState.target).normalize();
    const steepDir = new THREE.Vector3(homeDir.x, homeDir.y * 1.15, homeDir.z).normalize();

    const endPos = target.clone().addScaledVector(steepDir, dist);
    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 1, 0));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target: target,
      t0: performance.now(), duration: 900, done: false
    };
    controls.enabled = false;
  }

  function goFatbergView() {
    const camera = activeCamera;
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;
    const target = homeState.target.clone();
    const dist = homeState.pos.distanceTo(target);
    // Flatten isometric direction: keep XZ azimuth, pull Y up to 0.75 to look down more directly than before
    const homeDir = homeState.pos.clone().sub(target).normalize();
    const flatDir = new THREE.Vector3(homeDir.x, homeDir.y * 0.75, homeDir.z).normalize();
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
    const camera = activeCamera;
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

  // Animate to a near-top-down position aligned with the home horizontal direction,
  // so the tilt system's phi matches the isometric axis and the scroll-driven tilt
  // flows continuously from top-down toward the home camera angle.
  function goDissectedTopDown() {
    const camera = activeCamera;
    if (!homeState) return;
    if (topDownAnim) topDownAnim.done = true;

    const target = homeState.target.clone();
    const dist = homeState.pos.distanceTo(target);

    // Derive the horizontal direction (phi) from the home position so tilting
    // tracks the same azimuth as the recorded / remediated views.
    const phi = Math.atan2(
      homeState.pos.x - target.x,
      homeState.pos.z - target.z
    );

    // Place camera at TILT_THETA_MIN elevation in that direction — nearly top-down
    // but well-defined so lookAt won't hit a gimbal singularity.
    const endPos = new THREE.Vector3(
      target.x + dist * Math.sin(TILT_THETA_MIN) * Math.sin(phi),
      target.y + dist * Math.cos(TILT_THETA_MIN),
      target.z + dist * Math.sin(TILT_THETA_MIN) * Math.cos(phi)
    );

    const lookAtMatrix = new THREE.Matrix4().lookAt(endPos, target, new THREE.Vector3(0, 1, 0));
    const endQuat = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
    topDownAnim = {
      startPos: camera.position.clone(), endPos,
      startQuat: camera.quaternion.clone(), endQuat,
      target,
      t0: performance.now(), duration: 1200, done: false
    };
    controls.enabled = false;
  }

  function setAnimOnComplete(fn) {
    if (topDownAnim && !topDownAnim.done) topDownAnim.onComplete = fn;
  }

  return { scene, getCamera, setCameraMode, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, goTopDown, goDissectedTopDown, enableDissectedTilt, enableCollagePan, setNarrativeScrollHandler, getTiltInfo, setTiltTarget, setControlsInteraction, setAnimOnComplete, setModelSphere };
}
