import * as THREE from 'three';
import CONFIG from '../config/config.js';
import { openDetail, isDetailOpen, justClosed } from './detailPanel.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function overlayActive() {
  return document.getElementById('credits-overlay')?.classList.contains('visible') ||
    document.getElementById('about-overlay')?.classList.contains('visible');
}

export function setupTooltips(getCamera, scene, tooltipEl, modelBox, getDissected) {
  const DIM_OPACITY = 0.3;
  const FULL_OPACITY = 1.0;
  const HOVER_SCALE = 1.5;
  const LERP_SPEED = 0.25;
  const OPACITY_LERP = 0.22;

  const opacityTargets = new Map();
  let activeType = null;
  let hoveredSprite = null;
  let selectedSprite = null;

  // Crosshair lines shown in DISSECTED mode — SVG overlay for crisp 1px lines
  const _crossSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _crossSvg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:900;overflow:visible;';
  document.body.appendChild(_crossSvg);
  const _svgLineX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const _svgLineZ = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  [_svgLineX, _svgLineZ].forEach(l => {
    l.setAttribute('stroke', '#ffffff');
    l.setAttribute('stroke-width', '1');
    l.setAttribute('shape-rendering', 'crispEdges');
    _crossSvg.appendChild(l);
  });

  // Reusable vector for projecting 3D endpoints to screen space
  const _cpA = new THREE.Vector3();

  // Scene-local 3D endpoints for each line (set on hover, projected each tick)
  const _crossX = { ax: 0, ay: 25, az: 0, bx: 0, by: 25, bz: 0 };
  const _crossZ = { ax: 0, ay: 25, az: 0, bx: 0, by: 25, bz: 0 };

  let _crossTarget = 0;
  const CROSS_OPACITY = 1;

  const _tmpVec3 = new THREE.Vector3();
  const SNAP_RADIUS = 60;

  // Per-sprite selection highlight: clone the shared material so only the selected sprite is bright
  let _selClone = null;
  let _selOriginal = null;

  function applySelection(sprite) {
    clearSelectionMaterial();
    selectedSprite = sprite;
    _selOriginal = sprite.material;
    sprite.parent.children.forEach(s => {
      if (s !== sprite && s.material) opacityTargets.set(s.material, 0.9);
    });
    getDataGroups().forEach(g => {
      if (g !== sprite.parent) setGroupOpacity(g, DIM_OPACITY);
    });
    _selClone = _selOriginal.clone();
    _selClone.opacity = FULL_OPACITY;
    const selTex = _selOriginal.userData?.selectedTex;
    if (selTex) { _selClone.map = selTex; _selClone.needsUpdate = true; }
    sprite.material = _selClone;
    sprite.renderOrder = 1001;

    document.querySelectorAll('.scene-image').forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
  }

  function clearSelectionMaterial() {
    if (selectedSprite && _selClone && _selOriginal) {
      selectedSprite.material = _selOriginal;
      selectedSprite.renderOrder = 999;
      animating.add(selectedSprite);
      opacityTargets.delete(_selClone);
      _selClone.dispose();
      document.querySelectorAll('.scene-image').forEach(el => { el.style.opacity = ''; el.style.pointerEvents = ''; });
    }
    _selClone = null;
    _selOriginal = null;
    selectedSprite = null;
  }

  // With sizeAttenuation:false, the perspective sprite shader applies
  // "scale *= depth" before projection, which cancels the perspective divide
  // and makes the dot occupy screenSize * proj11 * (viewport/2) pixels.
  // Ortho skips that step, so its world-space scale must be pre-multiplied by
  // the same proj11/2 factor to produce an equal pixel size.
  // proj11 = 1/tan(FOV/2) for a 35° perspective camera → factor ≈ 1.586.
  const _ORTHO_FACTOR = 1 / (2 * Math.tan(17.5 * Math.PI / 180)); // ≈ 1.586

  function getBaseSize() {
    const camera = typeof getCamera === 'function' ? getCamera() : getCamera;
    if (camera.isOrthographicCamera) {
      const frustumH = (camera.top - camera.bottom) / (camera.zoom || 1);
      return CONFIG.marker.screenSize * frustumH * _ORTHO_FACTOR;
    }
    // sizeAttenuation:false — fixed screen-space value, depth-independent.
    return CONFIG.marker.screenSize;
  }

  let _groupCache = null;
  function getDataGroups() {
    if (!_groupCache) {
      _groupCache = scene.children.filter(
        c => c.isGroup && c.children.length && c.children[0]?.userData?.type
      );
    }
    return _groupCache;
  }

  function setGroupOpacity(group, opacity) {
    group.children.forEach(sprite => {
      if (sprite.material) opacityTargets.set(sprite.material, opacity);
    });
  }

  function resetAllGroups() {
    getDataGroups().forEach(g => setGroupOpacity(g, FULL_OPACITY));
    activeType = null;
  }

  function findSnapSprite(mx, my, canvasRect) {
    const cw = canvasRect.width, ch = canvasRect.height;
    let bestD2 = SNAP_RADIUS * SNAP_RADIUS, bestX = 0, bestY = 0, bestSprite = null;
    for (const group of getDataGroups()) {
      if (!group.visible) continue;
      const gy = group.position.y;
      for (const sprite of group.children) {
        _tmpVec3.set(sprite.position.x, sprite.position.y + gy, sprite.position.z);
        _tmpVec3.project(typeof getCamera === 'function' ? getCamera() : getCamera);
        if (_tmpVec3.z > 1) continue;
        const px = ((_tmpVec3.x + 1) / 2) * cw + canvasRect.left;
        const py = ((1 - _tmpVec3.y) / 2) * ch + canvasRect.top;
        const dx = mx - px, dy = my - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestX = px; bestY = py; bestSprite = sprite; }
      }
    }
    return bestSprite ? { px: bestX, py: bestY } : null;
  }

  const animating = new Set();

  let _lastBase = -1;
  function tick() {
    const base = getBaseSize();
    const baseDirty = Math.abs(base - _lastBase) > 0.5;
    if (baseDirty) _lastBase = base;
    const target = base * HOVER_SCALE;

    for (const group of getDataGroups()) {
      for (const sprite of group.children) {
        if (!animating.has(sprite)) {
          if (baseDirty) sprite.scale.set(base, base, 1);
        }
      }
    }

    for (const sprite of animating) {
      const goal = sprite === hoveredSprite ? target : base;
      const cur = sprite.scale.x;
      const next = THREE.MathUtils.lerp(cur, goal, LERP_SPEED);
      if (Math.abs(next - goal) < 0.0001) {
        sprite.scale.set(goal, goal, 1);
        if (sprite !== hoveredSprite) animating.delete(sprite);
      } else {
        sprite.scale.set(next, next, 1);
      }
    }

    if (selectedSprite) {
      const sel = base * 2;
      selectedSprite.scale.set(sel, sel, 1);
      animating.delete(selectedSprite);
    }

    for (const [mat, target] of opacityTargets) {
      const next = THREE.MathUtils.lerp(mat.opacity, target, OPACITY_LERP);
      if (Math.abs(next - target) < 0.005) {
        mat.opacity = target;
        opacityTargets.delete(mat);
      } else {
        mat.opacity = next;
      }
    }

    // Project crosshair endpoints to screen and update SVG lines
    if (_crossTarget > 0) {
      const camera = typeof getCamera === 'function' ? getCamera() : getCamera;
      const canvas = document.querySelector('#viewer-container canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const cw = rect.width, ch = rect.height, cl = rect.left, ct = rect.top;

      function project(x, y, z) {
        _cpA.set(x, y, z).applyMatrix4(scene.matrixWorld).project(camera);
        return { x: (_cpA.x + 1) / 2 * cw + cl, y: (1 - _cpA.y) / 2 * ch + ct };
      }

      const xA = project(_crossX.ax, _crossX.ay, _crossX.az);
      const xB = project(_crossX.bx, _crossX.by, _crossX.bz);
      _svgLineX.setAttribute('x1', xA.x); _svgLineX.setAttribute('y1', xA.y);
      _svgLineX.setAttribute('x2', xB.x); _svgLineX.setAttribute('y2', xB.y);

      const zA = project(_crossZ.ax, _crossZ.ay, _crossZ.az);
      const zB = project(_crossZ.bx, _crossZ.by, _crossZ.bz);
      _svgLineZ.setAttribute('x1', zA.x); _svgLineZ.setAttribute('y1', zA.y);
      _svgLineZ.setAttribute('x2', zB.x); _svgLineZ.setAttribute('y2', zB.y);

      _crossSvg.style.display = '';
    } else {
      _crossSvg.style.display = 'none';
    }
  }

  const viewerCanvas = document.querySelector('#viewer-container canvas');

  window.addEventListener('pointermove', (event) => {
    if (overlayActive()) return;
    if (_pointerIsDown) return;

    const canvasRect = viewerCanvas
      ? viewerCanvas.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };

    if (event.clientX > canvasRect.right) {
      if (viewerCanvas) viewerCanvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; window.dispatchEvent(new CustomEvent('sprite-hover', { detail: null })); }
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
      _crossTarget = 0;
      return;
    }

    pointer.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointer.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

    const camera = typeof getCamera === 'function' ? getCamera() : getCamera;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData?.type && i.object.parent?.visible !== false);

    const canvas = viewerCanvas;

    if (hit) {
      if (canvas && !_snapX) canvas.style.cursor = 'crosshair';
      const d = hit.object.userData;

      if (!selectedSprite) {
        if (activeType !== d.type) {
          getDataGroups().forEach(g => {
            setGroupOpacity(g, g.name === d.type ? FULL_OPACITY : DIM_OPACITY);
          });
          activeType = d.type;
        }
      }

      if (hoveredSprite !== hit.object) {
        if (hoveredSprite) animating.add(hoveredSprite);
        hoveredSprite = hit.object;
        animating.add(hoveredSprite);
        const _hvGroup = hit.object.parent;
        const _hvSprites = _hvGroup.children.filter(c => c.userData?.type);
        window.dispatchEvent(new CustomEvent('sprite-hover', {
          detail: { index: _hvSprites.indexOf(hit.object), total: _hvSprites.length, type: hit.object.userData.type }
        }));
      }

      if (modelBox && getDissected?.()) {
        const wp = new THREE.Vector3();
        hit.object.getWorldPosition(wp);
        scene.worldToLocal(wp);
        _crossX.ax = modelBox.min.x; _crossX.ay = wp.y; _crossX.az = wp.z;
        _crossX.bx = modelBox.max.x; _crossX.by = wp.y; _crossX.bz = wp.z;
        _crossZ.ax = wp.x; _crossZ.ay = wp.y; _crossZ.az = modelBox.min.z;
        _crossZ.bx = wp.x; _crossZ.by = wp.y; _crossZ.bz = modelBox.max.z;
        _crossTarget = CROSS_OPACITY;
      } else {
        _crossTarget = 0;
      }
    } else {
      if (canvas && !_snapX) canvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; window.dispatchEvent(new CustomEvent('sprite-hover', { detail: null })); }
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
      _crossTarget = 0;
    }
  });

  let pointerDownPos = { x: 0, y: 0 };
  let _pointerIsDown = false;
  let _lastTapTime = 0;
  let _lastTapX = 0;
  let _lastTapY = 0;

  window.addEventListener('pointerdown', (e) => {
    _pointerIsDown = true;
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
    tooltipEl.classList.add('hidden');
  });
  window.addEventListener('pointercancel', () => {
    _pointerIsDown = false;
  });

  window.addEventListener('pointerup', (e) => {
    _pointerIsDown = false;
    if (overlayActive()) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (dx * dx + dy * dy > 25) {
      _lastTapTime = 0;
      return;
    }

    if (justClosed()) return;

    if (e.target.closest('.detail-panel')) return;

    // Double-tap detection (touch only — desktop uses native dblclick in viewer.js)
    if (e.pointerType === 'touch') {
      const now = performance.now();
      const tdx = e.clientX - _lastTapX;
      const tdy = e.clientY - _lastTapY;
      const isDoubleTap = (now - _lastTapTime) < 300 && (tdx * tdx + tdy * tdy) < 1600;
      _lastTapTime = now;
      _lastTapX = e.clientX;
      _lastTapY = e.clientY;
      if (isDoubleTap) {
        _lastTapTime = 0;
        window.dispatchEvent(new Event('double-tap'));
        return;
      }
    }

    const clickRect = viewerCanvas
      ? viewerCanvas.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };

    if (e.clientX > clickRect.right) return;

    const cx = e.clientX;
    const cy = e.clientY;
    const clickPtr = new THREE.Vector2(
      ((cx - clickRect.left) / clickRect.width) * 2 - 1,
      -((cy - clickRect.top) / clickRect.height) * 2 + 1
    );
    const camera = typeof getCamera === 'function' ? getCamera() : getCamera;
    raycaster.setFromCamera(clickPtr, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find(i => i.object.userData?.type && i.object.parent?.visible !== false);
    if (hit) {
      const sprite = hit.object;
      const group = sprite.parent;
      const sprites = group.children.filter(c => c.userData?.type);
      const index = sprites.indexOf(sprite);
      applySelection(sprite);
      openDetail({ type: sprite.userData.type, sprite, group: sprites, index });
    }
  });

  window.addEventListener('detail-navigate', (e) => {
    const s = e.detail?.sprite;
    if (s?.isSprite || s?.isMesh) applySelection(s);
  });

  window.addEventListener('detail-close', () => {
    clearSelectionMaterial();
    resetAllGroups();
    activeType = null;
  });

  return tick;
}

export function frameBoundingBox(object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  controls.target.copy(center);

  if (camera.isOrthographicCamera) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center).addScaledVector(dir, 10000);

    // Use the bounding sphere radius for frustum sizing.
    // An orthographic camera projects a sphere as a circle of equal radius
    // regardless of viewing angle, so this guarantees the model is always
    // fully in view during any camera tilt or rotation.
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const halfExt = sphere.radius;

    // pad = fraction of the viewport the model should fill (0–1).
    const pad = CONFIG.camera.initialZoom ?? 0.80;
    const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);

    // Use the binding axis (height or width) so the model fits in both dimensions.
    const halfH = Math.max(halfExt / pad, halfExt / (pad * aspect));
    const halfW = halfH * aspect;

    camera.top = halfH;
    camera.bottom = -halfH;
    camera.left = -halfW;
    camera.right = halfW;
    camera.updateProjectionMatrix();
  } else {
    // True isometric angle: 45° azimuth, arctan(1/√2) ≈ 35.26° elevation.
    // Equal components → unit direction (1/√3, 1/√3, 1/√3).
    const maxHoriz = Math.max(size.x, size.z);
    const dist = maxHoriz * 1.8;
    const f = 1 / Math.sqrt(3);
    camera.position.set(
      center.x + dist * f,
      center.y + dist * f,
      center.z + dist * f
    );
  }
  controls.update();
}

export function animateIntro(camera, controls, duration = 1200) {
  const endPos = camera.position.clone();
  const endTarget = controls.target.clone();

  const dir = endPos.clone().sub(endTarget);
  const dist = dir.length();
  const startDir = dir.clone().normalize();
  startDir.y += 0.55;
  startDir.normalize();
  const startPos = endTarget.clone().addScaledVector(startDir, dist);

  camera.position.copy(startPos);
  controls.target.copy(endTarget);
  controls.update();

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  const t0 = performance.now();
  let done = false;

  function tick() {
    if (done) return;
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    const e = easeOutCubic(t);

    camera.position.lerpVectors(startPos, endPos, e);
    controls.update();

    if (t >= 1) {
      camera.position.copy(endPos);
      controls.update();
      done = true;
    } else {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}
