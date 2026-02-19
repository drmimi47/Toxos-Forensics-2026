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
  const DIM_OPACITY = 0.45;          // opacity for the non-hovered group
  const FULL_OPACITY = 1.0;
  const HOVER_SCALE = 1.5;            // scale multiplier on hover
  const LERP_SPEED = 0.25;           // per-frame interpolation factor
  let activeType = null;              // currently hovered group label
  let hoveredSprite = null;           // currently hovered sprite

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

  /** Set opacity on every sprite in a group. */
  function setGroupOpacity(group, opacity) {
    group.children.forEach(sprite => {
      if (sprite.material) sprite.material.opacity = opacity;
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

    // Update ALL data-point sprites to the current constant-screen base size
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
  }

  window.addEventListener('pointermove', (event) => {
    pointer.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData?.type);

    if (hit) {
      const d = hit.object.userData;

      // Dim / highlight groups when the hovered type changes
      if (activeType !== d.type) {
        getDataGroups().forEach(g => {
          setGroupOpacity(g, g.name === d.type ? FULL_OPACITY : DIM_OPACITY);
        });
        activeType = d.type;
      }

      // Scale up hovered sprite
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
        d.text   ? `<span class="tip-label">ID</span> <span class="tip-value">${d.text}</span>` : '',
        `<span class="tip-label">Easting</span> <span class="tip-value">${d.coordX?.toLocaleString(undefined, {maximumFractionDigits:0})}</span>`,
        `<span class="tip-label">Northing</span> <span class="tip-value">${d.coordY?.toLocaleString(undefined, {maximumFractionDigits:0})}</span>`
      ].filter(Boolean).join('<br>');

      tooltipEl.style.left = `${event.clientX + 14}px`;
      tooltipEl.style.top  = `${event.clientY + 14}px`;
      tooltipEl.classList.remove('hidden');
    } else {
      if (hoveredSprite) { animating.add(hoveredSprite); hoveredSprite = null; }
      if (activeType !== null) resetAllGroups();
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

    if (isDetailOpen() || justClosed()) return;

    // Ignore clicks on UI overlays (detail panel, buttons, etc.)
    if (e.target.closest('#detail-panel')) return;

    const clickPtr = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(clickPtr, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find(i => i.object.userData?.type);
    if (hit) {
      openDetail(hit.object.userData.type);
    }
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
    camera.top    =  maxDim;
    camera.bottom = -maxDim;
    camera.left   = -maxDim * aspect;
    camera.right  =  maxDim * aspect;
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
