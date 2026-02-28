/**
 * utils.js – Shared helpers: raycasting tooltips, coordinate display, etc.
 */
import * as THREE from 'three';
import CONFIG from '../config/config.js';
import { openDetail, isDetailOpen, justClosed } from './detailPanel.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/** Returns true when the credits or about overlay is currently visible. */
function overlayActive() {
  return document.getElementById('credits-overlay')?.classList.contains('visible') ||
         document.getElementById('about-overlay')?.classList.contains('visible');
}

/**
 * Set up mouse-move raycasting to show tooltips when hovering data points.
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 * @param {HTMLElement} tooltipEl
 */
export function setupTooltips(camera, scene, tooltipEl, modelBox, getDissected) {
  const DIM_OPACITY = 0.3;          // opacity for the non-hovered / non-selected sprites
  const FULL_OPACITY = 1.0;
  const HOVER_SCALE = 1.5;          // scale multiplier on hover
  const LERP_SPEED = 0.25;         // per-frame interpolation factor (scale)
  const OPACITY_LERP = 0.22;         // per-frame interpolation factor (opacity)

  // Map<SpriteMaterial, targetOpacity> — driven to completion each frame in tick()
  const opacityTargets = new Map();
  let activeType = null;              // currently hovered group label
  let hoveredSprite = null;           // currently hovered sprite
  let selectedSprite = null;          // sprite whose detail card is open

  // Crosshair lines (X, Z axes + downward Y drop line through hovered point, DISSECTED only)
  const _xPos = new Float32Array(6);
  const _zPos = new Float32Array(6);
  const _yPos = new Float32Array(6); // vertical drop: sprite → model ground (downward only)
  const _xGeom = new THREE.BufferGeometry();
  const _zGeom = new THREE.BufferGeometry();
  const _yGeom = new THREE.BufferGeometry();
  _xGeom.setAttribute('position', new THREE.BufferAttribute(_xPos, 3));
  _zGeom.setAttribute('position', new THREE.BufferAttribute(_zPos, 3));
  _yGeom.setAttribute('position', new THREE.BufferAttribute(_yPos, 3));
  const _crossMat = new THREE.LineBasicMaterial({
    color: 0xffffff,          // white source — blending inverts whatever is underneath
    transparent: true,        // rendered in transparent pass so it composites over the scene
    toneMapped: false,        // bypass ACES so the fragment stays at true (1,1,1) for perfect inversion
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,   // result = 1 × (1 - dst) = 1 - dst  (exact inversion)
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

  // Snap cursor — CSS element that jumps to the nearest data sprite within SNAP_RADIUS px
  const _snapCursor = document.createElement('div');
  _snapCursor.id = 'snap-cursor';
  document.body.appendChild(_snapCursor);
  const _tmpVec3 = new THREE.Vector3();
  const SNAP_RADIUS = 60;    // pixels — attraction radius
  let _snapX = null;         // effective client X while snapping, null when not
  let _snapY = null;
  let _clickSnapX = null;    // snap coords captured at pointerdown for use in pointerup
  let _clickSnapY = null;

  // Per-sprite selection highlight via material cloning.
  // All sprites in a group share ONE SpriteMaterial; to make only the selected
  // sprite bright we clone its material and assign the clone exclusively to it.
  let _selClone = null;   // cloned material on selectedSprite
  let _selOriginal = null;   // the shared material we borrowed from selectedSprite

  /** Dim everything except `sprite`, which gets its own full-opacity clone. */
  function applySelection(sprite) {
    clearSelectionMaterial();           // restore any previous selection first
    selectedSprite = sprite;
    _selOriginal = sprite.material; // shared material for this group
    // Set opacity 0.8 for all sprites in the selected dataset group
    sprite.parent.children.forEach(s => {
      if (s !== sprite && s.material) opacityTargets.set(s.material, 0.9);
    });
    // Dim every other group
    getDataGroups().forEach(g => {
      if (g !== sprite.parent) setGroupOpacity(g, DIM_OPACITY);
    });
    // Clone material for selected sprite
    _selClone = _selOriginal.clone();
    _selClone.opacity = FULL_OPACITY;
    // Swap to white-fill + colored-ring texture for the selected sprite
    const selTex = _selOriginal.userData?.selectedTex;
    if (selTex) { _selClone.map = selTex; _selClone.needsUpdate = true; }
    sprite.material = _selClone;       // only this sprite has the bright clone
    sprite.renderOrder = 1001;            // draw on top of all other sprites (group uses 999)

    // Dim and block CSS2D scene images so the selected sprite is never occluded by them
    document.querySelectorAll('.scene-image').forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
  }

  /** Restore the selected sprite's original material and discard the clone. */
  function clearSelectionMaterial() {
    if (selectedSprite && _selClone && _selOriginal) {
      selectedSprite.material = _selOriginal;
      selectedSprite.renderOrder = 999;   // restore to group default
      opacityTargets.delete(_selClone);   // discard any pending target before disposing
      _selClone.dispose();
      document.querySelectorAll('.scene-image').forEach(el => { el.style.opacity = ''; el.style.pointerEvents = ''; });
    }
    _selClone = null;
    _selOriginal = null;
    selectedSprite = null;
  }

  /** Compute the world-unit sprite size that keeps a constant screen fraction. */
  function getBaseSize() {
    if (camera.isOrthographicCamera) {
      const frustumH = (camera.top - camera.bottom) / (camera.zoom || 1);
      return CONFIG.marker.screenSize * frustumH;
    }
    return CONFIG.marker.screenSize;  // fallback for perspective
  }

  /** Find all THREE.Group objects that hold data points.
   *  Result is cached after first call — groups are fixed after CSV load. */
  let _groupCache = null;
  function getDataGroups() {
    if (!_groupCache) {
      _groupCache = scene.children.filter(
        c => c.isGroup && c.children.length && c.children[0]?.userData?.type
      );
    }
    return _groupCache;
  }

  /** Set target opacity on every unique material in a group (lerped in tick). */
  function setGroupOpacity(group, opacity) {
    group.children.forEach(sprite => {
      if (sprite.material) opacityTargets.set(sprite.material, opacity);
    });
  }

  /** Restore all groups to full opacity. */
  function resetAllGroups() {
    getDataGroups().forEach(g => setGroupOpacity(g, FULL_OPACITY));
    activeType = null;
  }

  /** Project all visible data sprites to screen space and return the nearest one
   *  within SNAP_RADIUS px, or null.  Fast path: only the group's Y offset is
   *  applied (true for the explode animation), avoiding a full matrix traversal. */
  function findSnapSprite(mx, my, canvasRect) {
    const cw = canvasRect.width, ch = canvasRect.height;
    let bestD2 = SNAP_RADIUS * SNAP_RADIUS, bestX = 0, bestY = 0, bestSprite = null;
    for (const group of getDataGroups()) {
      if (!group.visible) continue;
      const gy = group.position.y;
      for (const sprite of group.children) {
        _tmpVec3.set(sprite.position.x, sprite.position.y + gy, sprite.position.z);
        _tmpVec3.project(camera);
        if (_tmpVec3.z > 1) continue;   // behind camera or beyond far plane
        const px = ((_tmpVec3.x + 1) / 2) * cw + canvasRect.left;
        const py = ((1 - _tmpVec3.y) / 2) * ch + canvasRect.top;
        const dx = mx - px, dy = my - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestX = px; bestY = py; bestSprite = sprite; }
      }
    }
    return bestSprite ? { px: bestX, py: bestY } : null;
  }

  /* --- Constant-screen-size update + hover animation (called from render loop) --- */
  const animating = new Set();

  /** Call this every frame from the main render loop for jitter-free scaling. */
  let _lastBase = -1;
  function tick() {
    const base = getBaseSize();
    // Only update all sprite scales when the frustum/zoom actually changed.
    // With ~1 750 sprites this saves substantial JS time every idle frame.
    const baseDirty = Math.abs(base - _lastBase) > 0.5;
    if (baseDirty) _lastBase = base;
    const target = base * HOVER_SCALE;

    // Update ALL data-point sprites to the current constant-screen base size.
    // Opacity is managed imperatively by applySelection / clearSelectionMaterial,
    // not per-frame, so we only touch scale here.
    for (const group of getDataGroups()) {
      for (const sprite of group.children) {
        if (!animating.has(sprite)) {
          if (baseDirty) sprite.scale.set(base, base, 1);
        }
      }
    }

    // Lerp sprites that are being hover-animated
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

    // Selected sprite is always pinned at 2× base — override whatever the loop set.
    if (selectedSprite) {
      const sel = base * 2;
      selectedSprite.scale.set(sel, sel, 1);
      animating.delete(selectedSprite); // don't let hover lerp fight the pinned size
    }

    // Lerp material opacities toward their targets
    for (const [mat, target] of opacityTargets) {
      const next = THREE.MathUtils.lerp(mat.opacity, target, OPACITY_LERP);
      if (Math.abs(next - target) < 0.005) {
        mat.opacity = target;
        opacityTargets.delete(mat);
      } else {
        mat.opacity = next;
      }
    }

    // Crosshair lines: inversion blending needs no color sync — toggle visibility for instant show/hide
    _xLine.visible = _crossTarget > 0;
    _zLine.visible = _crossTarget > 0;
    _yLine.visible = _crossTarget > 0;
  }

  const viewerCanvas = document.querySelector('#viewer-container canvas');

  window.addEventListener('pointermove', (event) => {
    // Skip raycasting entirely while a full-screen overlay is open.
    if (overlayActive()) return;
    // Skip hover raycasting during any drag — hugely expensive on mobile touchmove.
    if (_pointerIsDown) return;

    // Normalise to canvas bounds (not window) so raycasting stays accurate
    // when the detail panel squeezes the viewer into a narrower rectangle.
    const canvasRect = viewerCanvas
      ? viewerCanvas.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };

    // Pointer is over the detail panel – hide tooltip and bail
    if (event.clientX > canvasRect.right) {
      if (viewerCanvas) viewerCanvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
      _crossTarget = 0;
      _snapCursor.style.display = 'none'; _snapX = null; _snapY = null;
      return;
    }

    // Snap: DISSECTED mode only — find the nearest data sprite and redirect the raycast toward it
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

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData?.type && i.object.parent?.visible !== false);

    const canvas = viewerCanvas;

    if (hit) {
      if (canvas && !_snapX) canvas.style.cursor = 'crosshair';
      const d = hit.object.userData;

      // Dim / highlight groups on hover – only when no specific point is selected
      if (!selectedSprite) {
        if (activeType !== d.type) {
          getDataGroups().forEach(g => {
            setGroupOpacity(g, g.name === d.type ? FULL_OPACITY : DIM_OPACITY);
          });
          activeType = d.type;
        }
      }

      // Scale up hovered sprite (always, even when a point is selected)
      if (hoveredSprite !== hit.object) {
        if (hoveredSprite) animating.add(hoveredSprite);  // shrink old
        hoveredSprite = hit.object;
        animating.add(hoveredSprite);                     // grow new
      }


      // Normalize for RCRA purple points: match on group name or type containing 'RCRA'
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

      // Crosshair lines through the hovered point — DISSECTED mode only
      if (modelBox && getDissected?.()) {
        const wp = new THREE.Vector3();
        hit.object.getWorldPosition(wp);
        // X-axis line: spans model bounding box in X, locked to sprite's Y and Z
        _xPos[0] = modelBox.min.x; _xPos[1] = wp.y; _xPos[2] = wp.z;
        _xPos[3] = modelBox.max.x; _xPos[4] = wp.y; _xPos[5] = wp.z;
        _xGeom.attributes.position.needsUpdate = true;
        // Z-axis line: spans model bounding box in Z, locked to sprite's Y and X
        _zPos[0] = wp.x; _zPos[1] = wp.y; _zPos[2] = modelBox.min.z;
        _zPos[3] = wp.x; _zPos[4] = wp.y; _zPos[5] = modelBox.max.z;
        _zGeom.attributes.position.needsUpdate = true;
        // Y drop line: straight down from the sprite to the model's ground plane
        // (downward only — does not extend above the sprite)
        _yPos[0] = wp.x; _yPos[1] = wp.y;           _yPos[2] = wp.z;
        _yPos[3] = wp.x; _yPos[4] = modelBox.min.y;  _yPos[5] = wp.z;
        _yGeom.attributes.position.needsUpdate = true;
        _crossTarget = CROSS_OPACITY;
      } else {
        _crossTarget = 0;
      }
    } else {
      if (canvas && !_snapX) canvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
      // Only reset group opacity when no point is selected
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
      _crossTarget = 0;
    }
  });

  /* --- Click a data point → open dataset detail panel --- */
  let pointerDownPos = { x: 0, y: 0 };
  // Track whether the pointer is currently pressed so pointermove can skip
  // expensive raycasting during drags (critical for touch performance).
  let _pointerIsDown = false;
  // Double-tap state (touch only — desktop uses native dblclick in viewer.js)
  let _lastTapTime = 0;
  let _lastTapX = 0;
  let _lastTapY = 0;

  window.addEventListener('pointerdown', (e) => {
    _pointerIsDown = true;
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
    // Capture the current snap position so pointerup can use it for the click raycast
    _clickSnapX = _snapX; _clickSnapY = _snapY;
    // Hide tooltip immediately on press so it doesn't linger during drag
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
    // Skip interaction entirely while a full-screen overlay is open.
    if (overlayActive()) return;
    // Ignore drags (only fire on actual clicks)
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (dx * dx + dy * dy > 25) {
      _lastTapTime = 0;   // drag breaks any pending double-tap sequence
      return;
    }

    if (justClosed()) return;

    // Don't let clicks on an open panel register as 3D scene interactions
    if (e.target.closest('.detail-panel')) return;

    // Double-tap detection — touch only; desktop gets native dblclick in viewer.js.
    // Two taps within 300 ms and 40 px of each other → camera toggle, skip panel open.
    if (e.pointerType === 'touch') {
      const now = performance.now();
      const tdx = e.clientX - _lastTapX;
      const tdy = e.clientY - _lastTapY;
      const isDoubleTap = (now - _lastTapTime) < 300 && (tdx * tdx + tdy * tdy) < 1600;
      _lastTapTime = now;
      _lastTapX = e.clientX;
      _lastTapY = e.clientY;
      if (isDoubleTap) {
        _lastTapTime = 0;   // reset so a third tap doesn't re-trigger
        window.dispatchEvent(new Event('double-tap'));
        return;             // suppress detail-panel open on this tap
      }
    }

    // Use canvas bounds for accurate normalised pointer coords
    const clickRect = viewerCanvas
      ? viewerCanvas.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };

    // Click is outside the 3D canvas (e.g. on the detail panel gap)
    if (e.clientX > clickRect.right) return;

    // Use the snap position captured at pointerdown so clicks hit the snapped sprite
    const cx = _clickSnapX ?? e.clientX;
    const cy = _clickSnapY ?? e.clientY;
    const clickPtr = new THREE.Vector2(
      ((cx - clickRect.left) / clickRect.width) * 2 - 1,
      -((cy - clickRect.top) / clickRect.height) * 2 + 1
    );
    raycaster.setFromCamera(clickPtr, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find(i => i.object.userData?.type && i.object.parent?.visible !== false);
    if (hit) {
      const sprite = hit.object;
      const group = sprite.parent;
      // Collect all visible sprites from this dataset group
      const sprites = group.children.filter(c => c.userData?.type);
      const index = sprites.indexOf(sprite);
      applySelection(sprite);
      openDetail({ type: sprite.userData.type, sprite, group: sprites, index });
    }
  });

  // detail-navigate: fired by detailPanel when prev/next arrows change the point
  window.addEventListener('detail-navigate', (e) => {
    const s = e.detail?.sprite;
    if (s?.isSprite || s?.isMesh) applySelection(s);
  });

  // detail-close: fired by detailPanel when the card is dismissed
  window.addEventListener('detail-close', () => {
    clearSelectionMaterial();
    resetAllGroups();
    activeType = null;
  });

  /** Expose the per-frame tick so the main render loop can call it. */
  return tick;
}

/**
 * Frame the camera to look at the center of a loaded model's bounding box.
 * Handles both orthographic and perspective cameras.
 */
export function frameBoundingBox(object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  controls.target.copy(center);

  if (camera.isOrthographicCamera) {
    // Keep the isometric direction but re-centre on the model
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center).addScaledVector(dir, 10000);
    // Adjust frustum to fit the model with zoom padding from config
    const zoomPad = CONFIG.camera.initialZoom ?? 0.7; // lower = more zoomed in
    const maxDim = Math.max(size.x, size.y, size.z) * zoomPad;
    const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
    camera.top = maxDim;
    camera.bottom = -maxDim;
    camera.left = -maxDim * aspect;
    camera.right = maxDim * aspect;
    camera.updateProjectionMatrix();
  } else {
    camera.position.set(
      center.x + size.x * 0.6,
      center.y + size.y * 2.0,
      center.z + size.z * 0.6
    );
  }
  controls.update();
}

/**
 * Animate the camera from a steeper (more top-down) angle to the current
 * isometric position over ~1 second with an ease-out curve.
 * Call this right after frameBoundingBox + hidePreloader so the user sees
 * the camera gently pivoting down into the final view.
 *
 * @param {THREE.Camera} camera
 * @param {OrbitControls} controls
 * @param {number} [duration=1200]  animation length in ms
 */
export function animateIntro(camera, controls, duration = 1200) {
  // Snapshot the final (target) camera state produced by frameBoundingBox
  const endPos = camera.position.clone();
  const endTarget = controls.target.clone();

  // Build a start position that is more elevated (steeper polar angle).
  // We raise Y and reduce XZ so the camera looks almost straight down at first.
  const dir = endPos.clone().sub(endTarget);
  const dist = dir.length();
  const startDir = dir.clone().normalize();
  // Increase elevation: blend toward a near-top-down direction
  startDir.y += 0.55;          // push upward
  startDir.normalize();
  const startPos = endTarget.clone().addScaledVector(startDir, dist);

  // Place camera at the elevated start position
  camera.position.copy(startPos);
  controls.target.copy(endTarget);
  controls.update();

  // Ease-out cubic: fast start, gentle finish
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
