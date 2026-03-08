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

  // Crosshair lines shown in DISSECTED mode — inversion blending inverts whatever is underneath
  const _xPos = new Float32Array(6);
  const _zPos = new Float32Array(6);
  const _yPos = new Float32Array(6);
  const _xGeom = new THREE.BufferGeometry();
  const _zGeom = new THREE.BufferGeometry();
  const _yGeom = new THREE.BufferGeometry();
  _xGeom.setAttribute('position', new THREE.BufferAttribute(_xPos, 3));
  _zGeom.setAttribute('position', new THREE.BufferAttribute(_zPos, 3));
  _yGeom.setAttribute('position', new THREE.BufferAttribute(_yPos, 3));
  const _crossMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.ZeroFactor,
  });
  const _xLine = new THREE.Line(_xGeom, _crossMat);
  const _zLine = new THREE.Line(_zGeom, _crossMat);
  const _yLine = new THREE.Line(_yGeom, _crossMat);
  _xLine.renderOrder = 1002;
  _zLine.renderOrder = 1002;
  _yLine.renderOrder = 1002;
  scene.add(_xLine, _zLine, _yLine);
  let _crossTarget = 0;
  const CROSS_OPACITY = 1;

  const _snapCursor = document.createElement('div');
  _snapCursor.id = 'snap-cursor';
  _snapCursor.classList.add('snap-cursor');
  document.body.appendChild(_snapCursor);
  const _tmpVec3 = new THREE.Vector3();
  const SNAP_RADIUS = 60;
  let _snapX = null;
  let _snapY = null;
  let _clickSnapX = null;
  let _clickSnapY = null;

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
      opacityTargets.delete(_selClone);
      _selClone.dispose();
      document.querySelectorAll('.scene-image').forEach(el => { el.style.opacity = ''; el.style.pointerEvents = ''; });
    }
    _selClone = null;
    _selOriginal = null;
    selectedSprite = null;
  }

  function getBaseSize() {
    const camera = typeof getCamera === 'function' ? getCamera() : getCamera;
    if (camera.isOrthographicCamera) {
      const frustumH = (camera.top - camera.bottom) / (camera.zoom || 1);
      return CONFIG.marker.screenSize * frustumH;
    }
    // Calculate the frustum height at the center of the scene
    const distance = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const vFov = (camera.fov * Math.PI) / 180;
    const frustumH = 2 * Math.tan(vFov / 2) * distance / (camera.zoom || 1);
    return CONFIG.marker.screenSize * frustumH;
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

    _xLine.visible = _crossTarget > 0;
    _zLine.visible = _crossTarget > 0;
    _yLine.visible = _crossTarget > 0;
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
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
      _crossTarget = 0;
      _snapCursor.style.display = 'none'; _snapX = null; _snapY = null;
      return;
    }

    const _snap = getDissected?.() ? findSnapSprite(event.clientX, event.clientY, canvasRect) : null;
    if (_snap) {
      _snapX = _snap.px; _snapY = _snap.py;
      _snapCursor.style.display = 'block';
      _snapCursor.style.left = `${_snapX}px`;
      _snapCursor.style.top = `${_snapY}px`;
      if (viewerCanvas) viewerCanvas.style.cursor = 'none';
    } else {
      _snapX = null; _snapY = null;
      _snapCursor.style.display = 'none';
    }

    const effX = _snapX ?? event.clientX;
    const effY = _snapY ?? event.clientY;
    pointer.x = ((effX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointer.y = -((effY - canvasRect.top) / canvasRect.height) * 2 + 1;

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
      }

      let imgSrc = '';
      if (/rcra/i.test(d.type) || /rcra/i.test(hit.object.parent?.name)) {
        imgSrc = './assets/images/rcra.jpg';
      } else if (/cso/i.test(d.type)) {
        imgSrc = './assets/images/cso.jpg';
      } else if (/npdes/i.test(d.type)) {
        imgSrc = './assets/images/npdes.jpg';
      }

      tooltipEl.innerHTML = [
        `<strong>${d.type}</strong>`,
        imgSrc ? `<img class="tip-img" src="${imgSrc}" alt="${d.type}">` : '',
        d.handle ? `<span class="tip-label">Handle</span> <span class="tip-value">${d.handle}</span>` : '',
        d.text ? `<span class="tip-label">ID</span> <span class="tip-value">${d.text}</span>` : '',
        `<span class="tip-label">Easting</span> <span class="tip-value">${d.coordX?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`,
        `<span class="tip-label">Northing</span> <span class="tip-value">${d.coordY?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`
      ].filter(Boolean).join('<br>');

      tooltipEl.style.left = `${event.clientX + 14}px`;
      tooltipEl.style.top = `${event.clientY + 14}px`;
      tooltipEl.classList.remove('hidden');

      if (modelBox && getDissected?.()) {
        const wp = new THREE.Vector3();
        hit.object.getWorldPosition(wp);
        _xPos[0] = modelBox.min.x; _xPos[1] = wp.y; _xPos[2] = wp.z;
        _xPos[3] = modelBox.max.x; _xPos[4] = wp.y; _xPos[5] = wp.z;
        _xGeom.attributes.position.needsUpdate = true;
        _zPos[0] = wp.x; _zPos[1] = wp.y; _zPos[2] = modelBox.min.z;
        _zPos[3] = wp.x; _zPos[4] = wp.y; _zPos[5] = modelBox.max.z;
        _zGeom.attributes.position.needsUpdate = true;
        _yPos[0] = wp.x; _yPos[1] = wp.y; _yPos[2] = wp.z;
        _yPos[3] = wp.x; _yPos[4] = modelBox.min.y; _yPos[5] = wp.z;
        _yGeom.attributes.position.needsUpdate = true;
        _crossTarget = CROSS_OPACITY;
      } else {
        _crossTarget = 0;
      }
    } else {
      if (canvas && !_snapX) canvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
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
    _clickSnapX = _snapX; _clickSnapY = _snapY;
    tooltipEl.classList.add('hidden');
    _snapCursor.style.display = 'none';
  });
  window.addEventListener('pointercancel', () => {
    _pointerIsDown = false;
    _snapCursor.style.display = 'none';
    _snapX = null; _snapY = null;
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

    const cx = _clickSnapX ?? e.clientX;
    const cy = _clickSnapY ?? e.clientY;
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
    const zoomPad = CONFIG.camera.initialZoom ?? 0.7;
    const maxDim = Math.max(size.x, size.y, size.z) * zoomPad;
    const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
    camera.top = maxDim;
    camera.bottom = -maxDim;
    camera.left = -maxDim * aspect;
    camera.right = maxDim * aspect;
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
