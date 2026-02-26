/**
 * main.js – Application entry point.
 *
 * 1. Shows preloader while assets load.
 * 2. Initialises the Three.js viewer (scene, camera, renderer, controls).
 * 3. Loads the GLB topography model.
 * 4. Loads CSV point data and overlays it on the model.
 * 5. Sets up interactive tooltips.
 * 6. Fades out the preloader.
 */
import * as THREE from "three";
import { createViewer } from "./viewer.js";
import { loadModel } from "./gltfLoader.js";
import { loadAllCSV } from "./csvLoader.js";
import { setupTooltips, frameBoundingBox, animateIntro } from "./utils.js";
import { closeDetail, getDetailType } from "./detailPanel.js";
import { addAllLabels, addAllImages } from "./labels.js";

/* ---------- Preloader helpers ---------- */
const preloaderEl = document.querySelector(".preloader");
const preBarEl = document.getElementById("preloader-bar");
const preTextEl = document.getElementById("preloader-text");

function setProgress(pct, label) {
  if (preBarEl) preBarEl.style.width = `${Math.min(pct, 100)}%`;
  if (preTextEl) preTextEl.textContent = label;
}

function hidePreloader() {
  setProgress(100, "Complete");
  // Small delay so user can see 100%
  setTimeout(() => {
    preloaderEl?.classList.add("done");
  }, 400);
}

/* ---------- Boot ---------- */
async function init() {
  setProgress(5, "Setting up scene");

  // 1. Spin up the 3D viewer
  const { scene, camera, renderer, controls, setTickSprites, setHomeState, goHome } = createViewer();
  const tooltipEl = document.getElementById("tooltip");

  try {
    setProgress(10, "Loading 3D model");

    // 2. Load the GLB model
    const { model, setModeProgress } = await loadModel(
      scene,
      (pct) => {
        setProgress(10 + pct * 0.7, `Loading model ${Math.round(pct)}%`);
      },
      renderer,
    );

    setProgress(80, "Framing view");

    // 3. Auto-frame the camera around the loaded model
    frameBoundingBox(model, camera, controls);
    // Capture the isometric home position before animateIntro moves the camera
    setHomeState(camera.position, controls.target);
    const homeZoom = camera.zoom;

    setProgress(85, "Loading data overlays");

    // 4. Overlay CSV data points
    const csvResults = await loadAllCSV(scene);

    // 4b. Add CSS2D point-of-interest labels and anchored images
    const sceneLabels = addAllLabels(scene);
    const sceneImages = addAllImages(scene);

    // Update legend counts
    if (csvResults.cso) {
      const el = document.getElementById("count-cso");
      if (el) el.textContent = csvResults.cso.group.children.length;
    }
    if (csvResults.npdes) {
      const el = document.getElementById("count-npdes");
      if (el) el.textContent = csvResults.npdes.group.children.length;
    }
    if (csvResults.rcra_2263_clipped) {
      const el = document.getElementById("count-rcra");
      if (el)
        el.textContent = csvResults.rcra_2263_clipped.group.children.length;
    }

    setProgress(95, "Preparing interactions…");

    // --- Legend click interaction to toggle dataset visibility ---
    // Map legend dot class to csvResults key
    const legendMap = {
      cso: "cso",
      npdes: "npdes",
      rcra: "rcra_2263_clipped",
    };
    Object.entries(legendMap).forEach(([dotClass, csvKey]) => {
      const dot = document.querySelector(".legend-dot." + dotClass);
      if (!dot) return;
      const item = dot.closest(".legend-item");
      if (!item) return;

      item.style.cursor = "pointer";
      item.setAttribute("tabindex", "0");
      item.setAttribute("title", "Toggle visibility");
      let visible = true;

      item.addEventListener("click", () => {
        visible = !visible;
        const group = csvResults[csvKey]?.group;
        if (group) group.visible = visible;
        item.classList.toggle("disabled", !visible);
        // Close the detail card if it's showing a point from this dataset
        if (!visible && new RegExp(dotClass, "i").test(getDetailType())) {
          closeDetail();
        }
      });

      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          item.click();
        }
      });
    });

    // Callback assigned once the dark-mode engine is ready (see below)
    let _triggerMode = null;

    // 5. Disected view: explode dataset groups vertically + snap camera home
    {
      // Collect all loaded groups, then sort largest → smallest so the densest
      // dataset sits closest to the ground and the sparsest floats highest.
      const explodeGroups = [
        csvResults.cso?.group,
        csvResults.npdes?.group,
        csvResults.rcra_2263_clipped?.group,
      ].filter(Boolean).sort((a, b) => b.children.length - a.children.length);

      const targetY = explodeGroups.map(() => 0); // current Y targets per group
      let rafId = null;

      function tickGroupY() {
        let settling = false;
        explodeGroups.forEach((g, i) => {
          const next = THREE.MathUtils.lerp(g.position.y, targetY[i], 0.1);
          if (Math.abs(next - targetY[i]) < 0.5) {
            g.position.y = targetY[i];
          } else {
            g.position.y = next;
            settling = true;
          }
        });
        rafId = settling ? requestAnimationFrame(tickGroupY) : null;
      }

      function setExplode(offsets) {
        offsets.forEach((y, i) => { targetY[i] = y; });
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tickGroupY);
      }

      // Zoom animation — lerps camera.zoom toward a target each frame
      let zoomTarget = homeZoom;
      let zoomRafId = null;

      function tickZoom() {
        const next = THREE.MathUtils.lerp(camera.zoom, zoomTarget, 0.08);
        if (Math.abs(next - zoomTarget) < 0.0001) {
          camera.zoom = zoomTarget;
          camera.updateProjectionMatrix();
          zoomRafId = null;
        } else {
          camera.zoom = next;
          camera.updateProjectionMatrix();
          zoomRafId = requestAnimationFrame(tickZoom);
        }
      }

      function setZoom(z) {
        zoomTarget = z;
        if (zoomRafId) cancelAnimationFrame(zoomRafId);
        zoomRafId = requestAnimationFrame(tickZoom);
      }

      // Cancel programmatic zoom the moment the user manually scrolls/pinches,
      // so tickZoom() never fights OrbitControls and causes stutter.
      controls.addEventListener('change', () => {
        if (zoomRafId) {
          cancelAnimationFrame(zoomRafId);
          zoomRafId = null;
          zoomTarget = camera.zoom; // keep target in sync so next setZoom is relative
        }
      });

      const creditsOverlay = document.getElementById('credits-overlay');

      // All scene objects that Fatberg should hide
      const overlayObjects = [...sceneLabels, ...sceneImages];
      const csvGroups = Object.values(csvResults).map(r => r?.group).filter(Boolean);

      let _fadeRafId = null;
      let _fadeCancelToken = 0;
      const FADE_MS = 320;

      function fadeOverlays(toVisible) {
        const token = ++_fadeCancelToken;
        if (_fadeRafId) { cancelAnimationFrame(_fadeRafId); _fadeRafId = null; }

        const materials = Object.values(csvResults).map(r => r?.material).filter(Boolean);

        // CSS2D labels + images — fade via CSS transition on the underlying DOM element
        for (const o of overlayObjects) {
          const el = o.element;
          el.style.transition = `opacity ${FADE_MS}ms ease`;
          if (toVisible) {
            o.visible = true;
            // One RAF delay so CSS2DRenderer removes display:none before the opacity goes to 1
            requestAnimationFrame(() => { el.style.opacity = '1'; });
          } else {
            el.style.opacity = '0';
            // Hide after transition finishes; guard against rapid toggling
            setTimeout(() => {
              if (_fadeCancelToken === token) o.visible = false;
            }, FADE_MS + 16);
          }
        }

        // Sprite groups — lerp material opacity via RAF
        if (toVisible) {
          for (const g of csvGroups) g.visible = true;
          for (const m of materials) { m.opacity = 0; m.needsUpdate = true; }
        }

        const startOp = toVisible ? 0 : 1;
        const endOp   = toVisible ? 1 : 0;
        const t0 = performance.now();

        function tick() {
          if (_fadeCancelToken !== token) return;
          const p  = Math.min((performance.now() - t0) / FADE_MS, 1);
          const op = startOp + (endOp - startOp) * p;
          for (const m of materials) { m.opacity = op; m.needsUpdate = true; }
          if (p < 1) {
            _fadeRafId = requestAnimationFrame(tick);
          } else {
            _fadeRafId = null;
            if (!toVisible) for (const g of csvGroups) g.visible = false;
          }
        }
        _fadeRafId = requestAnimationFrame(tick);
      }

      document.querySelectorAll('.subnav-item').forEach(item => {
        item.addEventListener('click', () => {
          const name = item.textContent.trim().toLowerCase();
          const isCredits = name === 'credits';
          const isFatberg = name === 'fatberg';

          // Show or hide the credits overlay
          creditsOverlay?.classList.toggle('visible', isCredits);

          // Don't change 3D state when just opening credits
          if (isCredits) return;

          // Fatberg: bare 3D model only — fade all data overlays out/in, reset camera
          fadeOverlays(!isFatberg);

          if (isFatberg) { goHome(); setZoom(homeZoom); _triggerMode?.(false); return; }

          if (name === 'disected') {
            goHome();
            setExplode(explodeGroups.map((_, i) => (i + 1) * 400));
            setZoom(homeZoom * 0.75);
          } else {
            if (name === 'recorded' || name === 'remediated') goHome();
            setExplode(explodeGroups.map(() => 0));
            setZoom(homeZoom);
            _triggerMode?.(name === 'remediated');
          }
        });
      });
    }

    // 6. Tooltips via raycasting
    const tickSprites = setupTooltips(camera, scene, tooltipEl);
    setTickSprites(tickSprites);

    // 6. Done!
    hidePreloader();

    // Dark mode — smooth crossfade via RAF lerp
    const BG_LIGHT = new THREE.Color(0xeeeeee);
    const BG_DARK = new THREE.Color(0x111111);
    let modeT = 0; // current interpolation value (0=light, 1=dark)
    let modeTarget = 0; // where we're animating towards
    let modeRafId = null;
    let modePrevTime = performance.now();

    function tickModeFrame(now) {
      const dt = (now - modePrevTime) / 200; // 500ms total duration
      modePrevTime = now;

      if (modeTarget > modeT) modeT = Math.min(modeT + dt, modeTarget);
      else modeT = Math.max(modeT - dt, modeTarget);

      // Toggle CSS class at midpoint so @property transitions meet symmetrically
      if (modeTarget === 1 && modeT >= 0.5) document.body.classList.add("dark");
      if (modeTarget === 0 && modeT <= 0.5)
        document.body.classList.remove("dark");

      // Swap marker dot textures at the midpoint
      const isDarkNow = modeT >= 0.5;
      for (const result of Object.values(csvResults)) {
        if (!result?.material) continue;
        const tex = isDarkNow ? result.darkTex : result.lightTex;
        if (result.material.map !== tex) {
          result.material.map = tex;
          result.material.needsUpdate = true;
        }
      }

      setModeProgress(modeT);
      scene.background.lerpColors(BG_LIGHT, BG_DARK, modeT);

      if (Math.abs(modeT - modeTarget) > 0.0001) {
        modeRafId = requestAnimationFrame(tickModeFrame);
      } else {
        modeT = modeTarget;
        setModeProgress(modeT); // ensure endpoints (texture swap) are applied
        modeRafId = null;
      }
    }

    document.getElementById("dark-mode-btn")?.addEventListener("click", () => {
      if (modeRafId) return; // ignore while animating
      modeTarget = modeT < 0.5 ? 1 : 0;
      modePrevTime = performance.now();
      modeRafId = requestAnimationFrame(tickModeFrame);
    });

    // Wire subnav → dark mode now that the engine variables are in scope
    _triggerMode = (dark) => {
      const target = dark ? 1 : 0;
      if (modeTarget === target) return;
      modeTarget = target;
      if (!modeRafId) {
        modePrevTime = performance.now();
        modeRafId = requestAnimationFrame(tickModeFrame);
      }
    };

    // 7. Gentle camera intro animation (pivot down into isometric view)
    animateIntro(camera, controls, 1750);
  } catch (err) {
    setProgress(100, "Error – see console");
    console.error("[main] Initialisation failed:", err);
    setTimeout(() => preloaderEl?.classList.add("done"), 2000);
  }
}

/* ---------- Subnav sliding dot ---------- */
{
  const dot   = document.getElementById('subnav-dot');
  const wrap  = document.querySelector('.subnav-wrap');
  const items = document.querySelectorAll('.subnav-item');

  function moveDot(item, animate) {
    const wrapRect = wrap.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const x = itemRect.left - wrapRect.left + itemRect.width / 2 - 2; // 2 = half dot width
    if (!animate) dot.style.transition = 'none';
    dot.style.transform = `translateX(${x}px)`;
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.transition = ''; }));
  }

  // Place dot on the default active item immediately (no animation)
  const initialActive = document.querySelector('.subnav-item.active');
  if (dot && wrap && initialActive) moveDot(initialActive, false);

  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      moveDot(item, true);
    });
  });

  // Re-snap on resize (no animation)
  window.addEventListener('resize', () => {
    const current = document.querySelector('.subnav-item.active');
    if (dot && wrap && current) moveDot(current, false);
  });
}

init();
