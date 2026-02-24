/**
 * utils.js – Shared helpers: raycasting tooltips, coordinate display, etc.
 */
import * as THREE from 'three';
import CONFIG from '../config/config.js';
import { openDetail, isDetailOpen, justClosed } from './detailPanel.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/**
 * Set up mouse-move raycasting to show tooltips when hovering data points.
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 * @param {HTMLElement} tooltipEl
 */
export function setupTooltips(camera, scene, tooltipEl) {
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

  /** Find all THREE.Group objects that hold data points. */
  function getDataGroups() {
    return scene.children.filter(
      c => c.isGroup && c.children.length && c.children[0]?.userData?.type
    );
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

  /* --- Constant-screen-size update + hover animation (called from render loop) --- */
  const animating = new Set();

  /** Call this every frame from the main render loop for jitter-free scaling. */
  function tick() {
    const base = getBaseSize();
    const target = base * HOVER_SCALE;

    // Update ALL data-point sprites to the current constant-screen base size.
    // Opacity is managed imperatively by applySelection / clearSelectionMaterial,
    // not per-frame, so we only touch scale here.
    for (const group of getDataGroups()) {
      for (const sprite of group.children) {
        if (!animating.has(sprite)) {
          sprite.scale.set(base, base, 1);
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
  }

  const viewerCanvas = document.querySelector('#viewer-container canvas');

  window.addEventListener('pointermove', (event) => {
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
      return;
    }

    pointer.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointer.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData?.type && i.object.parent?.visible !== false);

    const canvas = viewerCanvas;

    if (hit) {
      if (canvas) canvas.style.cursor = 'pointer';
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
    } else {
      if (canvas) canvas.style.cursor = '';
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
      // Only reset group opacity when no point is selected
      if (!selectedSprite && activeType !== null) resetAllGroups();
      tooltipEl.classList.add('hidden');
    }
  });

  /* --- Click a data point → open dataset detail panel --- */
  let pointerDownPos = { x: 0, y: 0 };

  window.addEventListener('pointerdown', (e) => {
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
  });

  window.addEventListener('pointerup', (e) => {
    // Ignore drags (only fire on actual clicks)
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (dx * dx + dy * dy > 25) return;   // moved more than 5 px → drag

    if (justClosed()) return;

    // If card is open and click is outside the card and not on the model, close the card
    if (isDetailOpen()) {
      // If click is NOT on the detail panel and NOT on a model sprite
      const isOnPanel = e.target.closest('#detail-panel');
      // Use canvas bounds for accurate normalised pointer coords
      const clickRect = viewerCanvas
        ? viewerCanvas.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };
      // Raycast to check if click is on a model sprite
      const clickPtr = new THREE.Vector2(
        ((e.clientX - clickRect.left) / clickRect.width) * 2 - 1,
        -((e.clientY - clickRect.top) / clickRect.height) * 2 + 1
      );
      raycaster.setFromCamera(clickPtr, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const hit = hits.find(i => i.object.userData?.type && i.object.parent?.visible !== false);
      if (!isOnPanel && !hit) {
        // Clicked outside the card and not on the model
        // Call closeDetail() directly to ensure full close behavior
        if (typeof window.closeDetail === 'function') {
          window.closeDetail();
        } else {
          window.dispatchEvent(new CustomEvent('detail-close'));
        }
        return;
      }
      // If click is on panel or model, continue as normal
      if (isOnPanel) return;
      if (hit) {
        const sprite = hit.object;
        const group = sprite.parent;
        // Collect all visible sprites from this dataset group
        const sprites = group.children.filter(c => c.userData?.type);
        const index = sprites.indexOf(sprite);
        applySelection(sprite);
        openDetail({ type: sprite.userData.type, sprite, group: sprites, index });
      }
      return;
    }

    // Ignore clicks on UI overlays (detail panel, buttons, etc.)
    if (e.target.closest('#detail-panel')) return;

    // Use canvas bounds for accurate normalised pointer coords
    const clickRect = viewerCanvas
      ? viewerCanvas.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth };

    // Click is outside the 3D canvas (e.g. on the detail panel gap)
    if (e.clientX > clickRect.right) return;

    const clickPtr = new THREE.Vector2(
      ((e.clientX - clickRect.left) / clickRect.width) * 2 - 1,
      -((e.clientY - clickRect.top) / clickRect.height) * 2 + 1
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
