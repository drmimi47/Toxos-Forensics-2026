import * as THREE from "three";
import CONFIG from "../config/config.js";
import { createViewer } from "./viewer.js";
import { loadModel } from "./gltfLoader.js";
import { loadAllCSV } from "./csvLoader.js";
import { setupTooltips, frameBoundingBox, animateIntro } from "./utils.js";
import { closeDetail, closeAllDetails, getDetailType } from "./detailPanel.js";
import { addAllLabels } from "./labels.js";
import { buildTerrainSnapper } from "./terrainSnap.js";
import { initNarrativePanel, setNarrativeContent, NARRATIVE_CONTENT } from "./narrativeText.js";
import { mountPhaseViz } from "./phase-vizdata.js";
import { mountNarrativeTimeline } from "./narrativeTimeline.js";

// Per-mode visual settings. Edit these values to retheme each submenu independently.
// bg:           hex color for the 3D viewport background.
// darkUI:       true applies dark UI theme (panels, text, borders); false = light.
// mdT:          model texture blend — 0 = light texture, 1 = dark texture.
// labelColor:   hex color for anchored scene text (East River, borough names, etc.).
// labelOpacity: opacity of the anchored scene text (0–1).
const MODE_VISUALS = {
  recorded:   { bg: '#111111', darkUI: true,  mdT: 0, labelColor: '#ffffff', labelOpacity: 0.75 },
  remediated: { bg: '#eeeeee', darkUI: false, mdT: 1, labelColor: '#000000', labelOpacity: 0.75 },
  fatberg:    { bg: '#111111', darkUI: true,  mdT: 0, labelColor: '#000000', labelOpacity: 0.75 },
  dissected:  { bg: '#111111', darkUI: true,  mdT: 0, labelColor: '#ffffff', labelOpacity: 0.50 },
};

const preloaderEl = document.querySelector(".preloader");
const preBarEl = document.getElementById("preloader-bar");
const preTextEl = document.getElementById("preloader-text");

let _onPreloaderComplete = null;

function updatePageScrollLock() {
  const isLoading = !!preloaderEl && !preloaderEl.classList.contains("done");
  const lock = isLoading;
  document.body.classList.toggle("scroll-locked", lock);
  document.documentElement.classList.toggle("scroll-locked", lock);
}

function getPageScroller() {
  const bodyScrollable = document.body.scrollHeight > document.body.clientHeight;
  if (bodyScrollable) return document.body;
  return document.scrollingElement || document.documentElement || document.body;
}

function setProgress(pct, label) {
  if (preBarEl) preBarEl.style.width = `${Math.min(pct, 100)}%`;
  if (preTextEl) preTextEl.textContent = label;
}

function hidePreloader() {
  setProgress(100, "Complete");
  setTimeout(() => {
    const brandEl     = preloaderEl?.querySelector('.preloader-brand');
    const headerBrand = document.querySelector('.brand-mark');
    const barTrackEl  = preloaderEl?.querySelector('.preloader-bar-track');
    const textEl      = preloaderEl?.querySelector('.preloader-text');

    if (!brandEl || !headerBrand || !preloaderEl) {
      preloaderEl?.classList.add("done");
      updatePageScrollLock();
      _onPreloaderComplete?.();
      return;
    }

    // Fade out the bar and status text before the logo animation begins.
    const fadeEls = [barTrackEl, textEl].filter(Boolean);
    fadeEls.forEach(el => {
      el.style.transition = 'opacity 0.3s linear';
      el.style.opacity    = '0';
    });

    setTimeout(() => {
      const fromRect = brandEl.getBoundingClientRect();
      const toRect   = headerBrand.getBoundingClientRect();

      // Hide header logo while the preloader logo travels into its place.
      headerBrand.style.visibility = 'hidden';

      // Pin brand at its current screen position and move it to <body> so it
      // is unaffected by the preloader's visibility or transform later.
      brandEl.style.position  = 'fixed';
      brandEl.style.left      = fromRect.left + 'px';
      brandEl.style.top       = fromRect.top  + 'px';
      brandEl.style.margin    = '0';
      brandEl.style.transform = 'none';
      brandEl.style.zIndex    = '10000';
      document.body.appendChild(brandEl);

      // Suppress the stylesheet opacity transition so we drive everything manually.
      preloaderEl.style.transition = 'none';

      const dx       = toRect.left - fromRect.left;
      const dy       = toRect.top  - fromRect.top;
      const duration = 1125; // ms – total logo travel time
      let overlayStarted = false;
      let start = null;

      // Cubic ease-in-out: slow → fast → slow.
      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      }

      function tick(ts) {
        if (!start) start = ts;
        const t  = Math.min((ts - start) / duration, 1);
        const et = easeInOut(t);

        // Eased logo movement.
        brandEl.style.left = (fromRect.left + dx * et) + 'px';
        brandEl.style.top  = (fromRect.top  + dy * et) + 'px';

        // At 50% of logo travel, slide the overlay panel upward off-screen.
        // Only mark done via transitionend so visibility:hidden never kills the animation mid-slide.
        if (t >= 0.5 && !overlayStarted) {
          overlayStarted = true;
          preloaderEl.addEventListener('transitionend', function onDone() {
            preloaderEl.removeEventListener('transitionend', onDone);
            preloaderEl.style.transition = 'none';
            preloaderEl.classList.add("done");
          });
          preloaderEl.style.transition = 'transform 1.4s cubic-bezier(0.42, 0, 0.58, 1)';
          preloaderEl.style.transform  = 'translateY(-120vh)';
        }

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          // Logo has arrived — reveal header brand, unlock scroll, fire callbacks.
          // The panel continues its own transition independently until transitionend.
          headerBrand.style.visibility = '';
          document.body.classList.remove("scroll-locked");
          document.documentElement.classList.remove("scroll-locked");
          _onPreloaderComplete?.();
          brandEl.remove();
        }
      }

      requestAnimationFrame(tick);
    }, 350); // wait for bar + text fade to finish
  }, 400);
}

async function init() {

  updatePageScrollLock();

  initNarrativePanel();

  setProgress(5, "Setting up 3D scene and camera");

  const initialVisuals = { bg: '#111111', darkUI: true, mdT: 0, labelColor: '#ffffff', labelOpacity: 0.75 };

  const { scene, getCamera, setCameraMode, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, goDissectedTopDown, enableDissectedTilt, getTiltInfo, setTiltTarget, setControlsInteraction, setNarrativeScrollHandler, setModelSphere, setParallaxEnabled } = createViewer();

  renderer.domElement.addEventListener('wheel', (e) => {
    // Non-narrative wheel events are handled by viewer controls directly.
  }, { passive: true });

  scene.background = new THREE.Color(initialVisuals.bg);
  const tooltipEl = document.getElementById("tooltip");

  try {
    setProgress(10, "Loading 3D model geometry and textures");

    const { model, setModeProgress, topoMeshes } = await loadModel(
      scene,
      (pct) => {
        if (pct < 30) setProgress(10 + pct * 0.2, `Loading model geometry: ${Math.round(pct)}%`);
        else if (pct < 60) setProgress(16 + (pct - 30) * 0.2, `Loading model textures: ${Math.round(pct)}%`);
        else setProgress(22 + (pct - 60) * 0.5, `Finalizing 3D model: ${Math.round(pct)}%`);
      },
      renderer,
    );

    setProgress(75, "Calculating model bounding box and camera framing");

    const modelBox = new THREE.Box3().setFromObject(model);
    frameBoundingBox(model, getCamera(), controls);
    {
      const _box = new THREE.Box3().setFromObject(model);
      const _sphere = new THREE.Sphere();
      _box.getBoundingSphere(_sphere);
      setModelSphere(_sphere.radius, CONFIG.camera.initialZoom ?? 0.80);
    }
    setHomeState(getCamera().position, controls.target);
    goDissectedTopDown(); // run top-down animation during load so it's done before preloader fades
    const homeZoom = getCamera().zoom;

    // Capture the polar angle of the default load-in camera position.
    // Used to seed the inverted scroll-to-tilt mapping in the Start sequence.
    const _homeOffset = getCamera().position.clone().sub(controls.target);
    const homeTheta = Math.acos(THREE.MathUtils.clamp(_homeOffset.y / _homeOffset.length(), -1, 1));



    setProgress(80, "Loading CSV data: CSO, NPDES, RCRA");
    const csvResults = await loadAllCSV(scene);

    setProgress(83, "Snapping data points to terrain surface");
    scene.updateMatrixWorld(true);
    const snapToTerrain = buildTerrainSnapper(topoMeshes);
    for (const result of Object.values(csvResults)) {
      snapToTerrain(result.group.children, CONFIG.marker.heightOffset);
    }

    setProgress(85, "Adding anchored labels to scene");
    const sceneLabels = addAllLabels(scene);
    for (const label of sceneLabels) {
      label.visible = false;
      label.element.style.opacity = '0';
    }

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

    setProgress(95, "Preparing UI interactions and controls");

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

    let _triggerMode = null;
    let _labelsVisible = true;
    let isDissected = false;
    let _currentMode = 'recorded';

    const _dissectedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _dissectedSvg.id = 'diss-svg';
    _dissectedSvg.classList.add('diss-svg');
    document.body.appendChild(_dissectedSvg);

    const _dissectedPanelsRight = document.createElement('div');
    _dissectedPanelsRight.id = 'diss-panels-right';
    _dissectedPanelsRight.classList.add('diss-panels--right');
    document.body.appendChild(_dissectedPanelsRight);

    const _dissectedPanelsLeft = document.createElement('div');
    _dissectedPanelsLeft.id = 'diss-panels-left';
    _dissectedPanelsLeft.classList.add('diss-panels--left');
    document.body.appendChild(_dissectedPanelsLeft);

    const _dissEls = [_dissectedSvg, _dissectedPanelsRight, _dissectedPanelsLeft];

    const _annData = [
      { result: csvResults.cso, name: 'CSO', color: 'var(--cso-color)', terminusIndex: null, lorem: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim.' },
      { result: csvResults.npdes, name: 'NPDES', color: 'var(--npdes-color)', terminusIndex: null, lorem: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure.' },
      { result: csvResults.rcra_2263_clipped, name: 'RCRA', color: 'var(--rcra-color)', terminusIndex: 907, lorem: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat.' },
    ].flatMap(({ result, name, color, terminusIndex, lorem }, i) => {
      const side = i % 2 === 0 ? 'right' : 'left';

      const autoSprite = side === 'right' ? result?.edgeSpriteRight : result?.edgeSpriteLeft;
      const sprite = (terminusIndex != null)
        ? (result?.group?.children[terminusIndex - 1] ?? autoSprite)
        : autoSprite;
      if (!sprite) return [];

      const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      svgLine.style.stroke = color;
      svgLine.setAttribute('stroke-opacity', '0.7');
      svgLine.setAttribute('stroke-width', '1');
      _dissectedSvg.appendChild(svgLine);

      const svgDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svgDot.setAttribute('r', '2.5');
      svgDot.style.fill = color;
      _dissectedSvg.appendChild(svgDot);

      const panel = document.createElement('div');
      panel.className = 'diss-panel';
      const nameEl = document.createElement('p');
      nameEl.className = 'diss-name';
      nameEl.style.color = color;
      nameEl.textContent = name;
      const textEl = document.createElement('p');
      textEl.className = 'diss-text';
      textEl.textContent = lorem;
      panel.appendChild(nameEl);
      panel.appendChild(textEl);
      (side === 'right' ? _dissectedPanelsRight : _dissectedPanelsLeft).appendChild(panel);

      let dissVisible = true;
      panel.addEventListener('click', () => {
        dissVisible = !dissVisible;
        if (result?.group) result.group.visible = dissVisible;
        panel.classList.toggle('disabled', !dissVisible);
        svgLine.setAttribute('stroke-opacity', dissVisible ? '0.7' : '0.18');
        svgDot.setAttribute('opacity', dissVisible ? '1' : '0.18');
        if (!dissVisible && new RegExp(name, 'i').test(getDetailType())) {
          closeDetail();
        }
      });

      return [{ sprite, svgLine, svgDot, nameEl, side, panel, dataGroup: result.group }];
    });

    let _dissLineRafId = null;
    const _dissVec = new THREE.Vector3();
    function _tickDissLines() {
      if (!isDissected) { _dissLineRafId = null; return; }
      // Skip forced-reflow DOM reads while the SVG is hidden during narrative scroll.
      if (document.body.classList.contains('narrative-scroll-mode')) {
        _dissLineRafId = requestAnimationFrame(_tickDissLines);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      for (const ann of _annData) {
        ann.sprite.getWorldPosition(_dissVec);
        const n = _dissVec.clone().project(getCamera());
        const ax = rect.left + (n.x * 0.5 + 0.5) * rect.width;
        const ay = rect.top + (n.y * -0.5 + 0.5) * rect.height;
        const range = document.createRange();
        range.selectNodeContents(ann.nameEl);
        const nr = range.getBoundingClientRect();
        const TEXT_GAP = 6;
        const bx = ann.side === 'right' ? nr.left - TEXT_GAP : nr.right + TEXT_GAP;
        const by = nr.top + nr.height / 2;
        ann.svgLine.setAttribute('x1', ax); ann.svgLine.setAttribute('y1', ay);
        ann.svgLine.setAttribute('x2', bx); ann.svgLine.setAttribute('y2', by);
        ann.svgDot.setAttribute('cx', ax); ann.svgDot.setAttribute('cy', ay);
      }
      _dissLineRafId = requestAnimationFrame(_tickDissLines);
    }

    {
      const explodeGroups = [
        csvResults.cso?.group,
        csvResults.npdes?.group,
        csvResults.rcra_2263_clipped?.group,
      ].filter(Boolean).sort((a, b) => b.children.length - a.children.length);

      // Fixed CSO → NPDES → RCRA order for the sequential reveal in phase 2.
      const orderedGroups = [
        csvResults.cso?.group,
        csvResults.npdes?.group,
        csvResults.rcra_2263_clipped?.group,
      ].filter(Boolean);

      let _currentSubPhase = -1;
      let _subFadeToken = 0;
      const SUBFADE_MS = 220;

      const _subPhaseKeys = ['phase-2-a', 'phase-2-b', 'phase-2-c'];

      // Ordered parallel to orderedGroups: one material per CSV dataset.
      const orderedMaterials = [
        csvResults.cso?.material,
        csvResults.npdes?.material,
        csvResults.rcra_2263_clipped?.material,
      ].filter(Boolean);

      function _switchSubPhaseAnnotations(idx) {
        setNarrativeContent(_subPhaseKeys[idx]);
        for (const ann of _annData) {
          const active = ann.dataGroup === orderedGroups[idx];
          ann.svgLine.setAttribute('stroke-opacity', active ? '0.7' : '0');
          ann.svgDot.setAttribute('opacity', active ? '1' : '0');
          ann.panel.style.opacity = active ? '1' : '0';
          ann.panel.style.pointerEvents = active ? '' : 'none';
        }
      }

      function _applyDissectedSubPhase(idx) {
        if (idx === _currentSubPhase) return;
        _currentSubPhase = idx;
        const token = ++_subFadeToken;

        // Take material-opacity control away from any running fadeOverlays animation.
        ++_fadeCancelToken;
        if (_fadeRafId) { cancelAnimationFrame(_fadeRafId); _fadeRafId = null; }

        const nextMat = orderedMaterials[idx];
        const nextAlreadyFull = nextMat ? nextMat.opacity >= 0.99 : false;

        // Collect every non-target material that has visible opacity to fade out.
        const fadeOutIndices = [];
        const fadeOutStartOps = [];
        for (let i = 0; i < orderedMaterials.length; i++) {
          if (i === idx) continue;
          const m = orderedMaterials[i];
          if (m && m.opacity > 0.001) {
            fadeOutIndices.push(i);
            fadeOutStartOps.push(m.opacity);
          } else {
            // Already invisible — hide group immediately.
            if (m) { m.opacity = 0; m.needsUpdate = true; }
            if (orderedGroups[i]) orderedGroups[i].visible = false;
          }
        }

        // Make target group visible. Only reset to 0 if it isn't already showing.
        if (orderedGroups[idx]) orderedGroups[idx].visible = true;
        if (!nextAlreadyFull && nextMat) { nextMat.opacity = 0; nextMat.needsUpdate = true; }

        const hasFadeOut = fadeOutIndices.length > 0;
        const hasFadeIn  = !nextAlreadyFull;
        const totalMs    = (hasFadeOut ? SUBFADE_MS : 0) + (hasFadeIn ? SUBFADE_MS : 0);

        // Switch narrative + annotations at the crossover (when fade-out ends).
        if (!hasFadeOut) {
          _switchSubPhaseAnnotations(idx);
        } else {
          setTimeout(() => {
            if (_subFadeToken === token) _switchSubPhaseAnnotations(idx);
          }, SUBFADE_MS);
        }

        if (totalMs === 0) return;

        const t0 = performance.now();

        function tick() {
          if (_subFadeToken !== token) return;
          const elapsed = performance.now() - t0;

          // Fade out all non-target materials in parallel.
          if (hasFadeOut) {
            const p = Math.min(elapsed / SUBFADE_MS, 1);
            fadeOutIndices.forEach((i, j) => {
              const m = orderedMaterials[i];
              if (!m) return;
              m.opacity = fadeOutStartOps[j] * (1 - p);
              m.needsUpdate = true;
              if (p >= 1 && orderedGroups[i]) orderedGroups[i].visible = false;
            });
          }

          // Fade in target material (starts immediately after fade-out).
          if (hasFadeIn) {
            const offset = hasFadeOut ? SUBFADE_MS : 0;
            const p = Math.min(Math.max(elapsed - offset, 0) / SUBFADE_MS, 1);
            if (nextMat) { nextMat.opacity = p; nextMat.needsUpdate = true; }
          }

          if (elapsed < totalMs) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      }

      const targetY = explodeGroups.map(() => 0);
      let rafId = null;

      function setExplode(offsets) {
        const startYs = explodeGroups.map(g => g.position.y);
        offsets.forEach((y, i) => { targetY[i] = y; });
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

        // Net upward movement → ease-in (accelerate out).
        // Net downward movement → ease-out (decelerate in).
        const totalDelta = offsets.reduce((sum, y, i) => sum + (y - startYs[i]), 0);
        const easeFn = totalDelta > 0
          ? p => p * p * p            // cubic ease-in
          : p => 1 - Math.pow(1 - p, 3);     // cubic ease-out
        const DURATION = 900;       

        const t0 = performance.now();

        function tick() {
          const p = Math.min((performance.now() - t0) / DURATION, 1);
          const ep = easeFn(p);
          explodeGroups.forEach((g, i) => {
            g.position.y = startYs[i] + (targetY[i] - startYs[i]) * ep;
          });
          rafId = p < 1 ? requestAnimationFrame(tick) : null;
        }

        rafId = requestAnimationFrame(tick);
      }

      let zoomTarget = homeZoom;
      let zoomRafId = null;

      function tickZoom() {
        const camera = getCamera();
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

      function stopZoomTween(syncToCurrent = true) {
        if (zoomRafId) {
          cancelAnimationFrame(zoomRafId);
          zoomRafId = null;
        }
        if (syncToCurrent) zoomTarget = getCamera().zoom;
      }

      // Cancel programmatic zoom on manual scroll so tickZoom() never fights OrbitControls.
      controls.addEventListener('change', () => {
        stopZoomTween(true);
      });

      const aboutOverlay = document.getElementById('about-overlay');

      const overlayObjects = [...sceneLabels]; // sceneImages are now THREE.Mesh — handled separately
      const csvGroups = Object.values(csvResults).map(r => r?.group).filter(Boolean);

      let _fadeRafId = null;
      let _fadeCancelToken = 0;
      const FADE_MS = 320;

      function fadeOverlays(toVisible) {
        const token = ++_fadeCancelToken;
        if (_fadeRafId) { cancelAnimationFrame(_fadeRafId); _fadeRafId = null; }

        const materials = Object.values(csvResults).map(r => r?.material).filter(Boolean);

        for (const o of overlayObjects) {
          const el = o.element;
          el.style.transition = `opacity ${FADE_MS}ms ease`;
          if (toVisible) {
            if (_labelsVisible) {
              o.visible = true;
              requestAnimationFrame(() => { el.style.opacity = '1'; });
            }
          } else {
            el.style.opacity = '0';
            setTimeout(() => {
              if (_fadeCancelToken === token) o.visible = false;
            }, FADE_MS + 16);
          }
        }

        if (toVisible) {
          for (const g of csvGroups) g.visible = true;
          // Only reset materials that aren't already fully visible (e.g. coming from a subphase).
          for (const m of materials) { if (m.opacity < 1) { m.opacity = 0; m.needsUpdate = true; } }
        }

        // Capture per-material start opacities so each fades from its own current value.
        const startOps = materials.map(m => m.opacity);
        const endOp = toVisible ? 1 : 0;
        const t0 = performance.now();

        function tick() {
          if (_fadeCancelToken !== token) return;
          const p = Math.min((performance.now() - t0) / FADE_MS, 1);
          for (let i = 0; i < materials.length; i++) {
            const m = materials[i];
            if (toVisible && m.opacity >= 1) continue; // already at max — leave it alone
            m.opacity = startOps[i] + (endOp - startOps[i]) * p;
            m.needsUpdate = true;
          }
          if (p < 1) {
            _fadeRafId = requestAnimationFrame(tick);
          } else {
            _fadeRafId = null;
            if (!toVisible) for (const g of csvGroups) g.visible = false;
          }
        }
        _fadeRafId = requestAnimationFrame(tick);
      }

      // ── Core mode switch (used by nav and narrative) ───────────
      function _doSwitchMode(name, force = false) {
        if (name === 'map') name = 'recorded'; // "Map" nav item = recorded/home mode
        const isAbout = name === 'about';
        const isFatberg = name === 'fatberg';

        aboutOverlay?.classList.toggle('visible', isAbout);

        if (isAbout) return;

        if (!force && name === _currentMode) return;
        _currentMode = name;

        isDissected = (name === 'dissected');

        setCameraMode(false); // always orthographic

        enableDissectedTilt(isDissected);

        controls.mouseButtons.LEFT = isDissected ? null : THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = isDissected ? null : THREE.MOUSE.PAN;
        controls.enableZoom = !isDissected;
        document.body.classList.toggle('dissected-mode', isDissected);
        document.body.classList.toggle('fatberg-mode', isFatberg);
        updatePageScrollLock();

        fadeOverlays(!isFatberg);

        const visuals = MODE_VISUALS[name];
        if (visuals) _triggerMode?.(visuals);

        if (isFatberg) {
          goFatbergView();
          setZoom(homeZoom);
          setExplode(explodeGroups.map(() => 0));
          for (const el of _dissEls) el.style.opacity = '0';
          return;
        }

        if (name === 'dissected') {
          goDissectedView();
          setExplode(explodeGroups.map((_, i) => (i + 1) * 700));
          setZoom(homeZoom * 0.70);
          if (!_dissLineRafId) _dissLineRafId = requestAnimationFrame(_tickDissLines);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            for (const img of sceneImages) img.visible = true;
            for (const el of _dissEls) el.style.opacity = '1';
          }));
        } else {
          if (name === 'recorded' || name === 'remediated') goHome();
          setExplode(explodeGroups.map(() => 0));
          setZoom(homeZoom);
          for (const el of _dissEls) el.style.opacity = '0';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            for (const img of sceneImages) img.visible = true;
          }));
        }
      }

      // ── Nav click handler ───────────────────────────────────────
      document.querySelectorAll('.subnav-item').forEach(item => {
        item.addEventListener('click', () => {
          const name = item.textContent.trim().toLowerCase();
          _doSwitchMode(name);
        });
      });

      document.querySelector('.brand-mark')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeAllDetails();
        _doSwitchMode('map');
      });

      // ── Continuous scroll-driven narrative ──────────────────────
      // The full experience is one scroll axis: 0 → TOTAL_SCROLL.
      // Camera theta is a direct linear map of that position.
      // Visual/content changes happen at exactly 1/3 and 2/3.

      let currentPhase = null;

      // Declarative model state per narrative phase.
      // Edit a row here to change which model version/visual state a phase uses.
      //
      // mode            – key into MODE_VISUALS (controls bg, texture, dark/light UI)
      // isDissected     – true while the exploded iso model is the primary view
      // bodyClass       – CSS class added to <body> for this phase (null = none)
      // overlays        – whether CSV sprite overlays are visible
      // explodeStacked  – true = layers spread apart (700ft each), false = collapsed
      // allGroupsVisible– force all CSV groups visible (phase 3 resets subPhase selection)
      // startDissLines  – start/continue the SVG dissection-line RAF loop
      // narrativeKey    – passed to setNarrativeContent; null = scroll card handles text
      // dissElsOpacity  – opacity for annotation panel elements ('0'|'1'|null=skip)
      // sceneImages     – show/hide anchored scene images (null = leave unchanged)
      // NOTE: whenever overlays are visible, data layers are automatically exploded
      // (stacked 700ft apart). No separate flag needed — overlays drives explosion.
      const PHASE_MODEL_CONFIG = {
        [0]:  { mode: 'recorded',   isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null  },
        [1]:  { mode: 'recorded',   isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: false },
        [2]:  { mode: 'dissected',  isDissected: true,  bodyClass: 'dissected-mode', overlays: true,  allGroupsVisible: false, startDissLines: true,  narrativeKey: null,      dissElsOpacity: '1', sceneImages: true  },
        [3]:  { mode: 'dissected',  isDissected: true,  bodyClass: 'dissected-mode', overlays: true,  allGroupsVisible: true,  startDissLines: true,  narrativeKey: 'phase-3', dissElsOpacity: '0', sceneImages: true  },
        [4]:  { mode: 'fatberg',    isDissected: false, bodyClass: 'fatberg-mode',   overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: 'phase-4', dissElsOpacity: '0', sceneImages: null  },
        [5]:  { mode: 'fatberg',    isDissected: false, bodyClass: 'fatberg-mode',   overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null  },
        [6]:  { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null  },
        [7]:  { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: true,  allGroupsVisible: false, startDissLines: false, narrativeKey: 'phase-7', dissElsOpacity: '0', sceneImages: true  },
        [8]:  { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null  },
      };

      function _applyPhase(phase) {
        if (phase === currentPhase) return;
        const prevPhase = currentPhase;
        currentPhase = phase;

        const cfg = PHASE_MODEL_CONFIG[phase];
        if (!cfg) return;

        // Cancel any in-flight subphase fade so it can't hide groups after we show them.
        ++_subFadeToken;

        if (cfg.narrativeKey) setNarrativeContent(cfg.narrativeKey);

        isDissected = cfg.isDissected;
        _currentMode = cfg.mode;

        document.body.classList.remove('dissected-mode', 'fatberg-mode');
        if (cfg.bodyClass) document.body.classList.add(cfg.bodyClass);

        fadeOverlays(cfg.overlays);
        if (_triggerMode) _triggerMode(MODE_VISUALS[cfg.mode]);

        if (cfg.allGroupsVisible) orderedGroups.forEach(g => { if (g) g.visible = true; });

        if (phase === 3) {
          // Snap to stacked heights when coming from an elevated state or from phase 4
          // (so groups fly down into view). Skip snap when coming from phase 2 (already at ground).
          if (targetY.some(y => y > 10) || prevPhase === 4) {
            explodeGroups.forEach((g, i) => { g.position.y = (i + 1) * 700; targetY[i] = (i + 1) * 700; });
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          }
          setExplode(explodeGroups.map(() => 0));
        } else if (phase === 2) {
          // Sub-phases (CSO/NPDES/RCRA): keep all data points at ground level.
          setExplode(explodeGroups.map(() => 0));
        } else if (phase === 4) {
          // Coming from phase 3: fly datasets up to stacked heights as they fade out.
          // Any other direction: collapse to ground.
          setExplode(prevPhase === 3
            ? explodeGroups.map((_, i) => (i + 1) * 700)
            : explodeGroups.map(() => 0));
        } else {
          setExplode(cfg.overlays
            ? explodeGroups.map((_, i) => (i + 1) * 700)
            : explodeGroups.map(() => 0));
        }

        if (cfg.startDissLines) {
          _currentSubPhase = -1;
          if (!_dissLineRafId) _dissLineRafId = requestAnimationFrame(_tickDissLines);
        }

        if (cfg.dissElsOpacity !== null || cfg.sceneImages !== null) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (cfg.sceneImages !== null)
              for (const img of sceneImages) img.visible = cfg.sceneImages;
            if (cfg.dissElsOpacity !== null)
              for (const el of _dissEls) el.style.opacity = cfg.dissElsOpacity;
          }));
        }

        // Camera transitions for the opening sequence.
        if (phase === 0) goDissectedTopDown(); // title: top-down view
        if (phase === 1) goHome();             // blank model: animate to home pose

        // Zoom in on explore-model interstitials, zoom back out when leaving.
        const _nz = homeZoom * (CONFIG.camera.narrativeZoom ?? 0.92);
        if (phase === 5 || phase === 8) {
          setZoom(homeZoom * (CONFIG.camera.exploreZoom ?? 1.25));
        } else if (prevPhase === 5 || prevPhase === 8) {
          setZoom(_nz);
        }
      }

      // Auto-start the narrative scroll experience once the preloader has faded out.
      _onPreloaderComplete = () => {
        closeAllDetails();
        currentPhase = null;
        setControlsInteraction(false, false, false);
        enableDissectedTilt(false);

        // Hide anchored scene labels during the scroll experience.
        _labelsVisible = false;
        for (const label of sceneLabels) {
          label.element.style.transition = 'opacity 300ms ease';
          label.element.style.opacity = '0';
        }
        setTimeout(() => { for (const label of sceneLabels) label.visible = false; }, 320);

        // Apply initial phase and camera state.
        _applyPhase(-1);
        setZoom(homeZoom * (CONFIG.camera.narrativeZoom ?? 0.78));
        _startScrollNarrative();
      };
      function _startScrollNarrative() {
        const SECTIONS = [
          { key: 'phase-0',   phase: 0  }, //title
          { key: 'phase-1',   phase: 1  }, //context
          { key: 'phase-2-a', phase: 2, subPhase: 0 }, //CSO
          { key: 'phase-2-b', phase: 2, subPhase: 1 }, //NPDES
          { key: 'phase-2-c', phase: 2, subPhase: 2 }, //RCRA
          { key: 'phase-3',   phase: 3  }, //all groups
          { key: 'phase-4',   phase: 4  }, //Fatberg
          { key: 'phase-5',   phase: 5  }, //Explore Model
          { key: 'phase-6',   phase: 6  }, //Title
          { key: 'phase-7',   phase: 7  }, //Remediation
          { key: 'phase-8',   phase: 8  }, //Explore Model
        ];

        const page = document.createElement('div');
        page.id = 'narrative-scroll-page';
        page.className = 'narrative-scroll-page';

        SECTIONS.forEach((sec, i) => {
          const content = NARRATIVE_CONTENT[sec.key];
          const section = document.createElement('div');
          section.className = 'narrative-scroll-section';
          section.dataset.sectionIdx = String(i);
          section.dataset.sectionKey = sec.key;

          const debugLabel = document.createElement('div');
          debugLabel.textContent = sec.key;
          debugLabel.style.cssText = 'position:absolute;top:8px;left:12px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.5);z-index:999;pointer-events:none;';
          section.style.position = 'relative';
          section.appendChild(debugLabel);

          const modelWindow = document.createElement('div');
          modelWindow.className = 'narrative-model-window';

          const card = document.createElement('div');
          card.className = 'narrative-text-card';

          const h = document.createElement('h2');
          h.className = 'narrative-heading';
          h.innerHTML = content.heading;

          card.appendChild(h);

          if (content.body.length === 0) {
            // Heading-only section: card centered inside the model window, no text block below
            section.classList.add('narrative-scroll-section--intro');
            modelWindow.appendChild(card);

            // Explore frame overlay with close button (phases 5 & 8)
            const exploreFrame = document.createElement('div');
            exploreFrame.className = 'explore-frame';
            const exploreClose = document.createElement('button');
            exploreClose.className = 'explore-frame-close';
            exploreClose.setAttribute('aria-label', 'Exit explore mode');
            exploreClose.textContent = 'X';
            exploreFrame.appendChild(exploreClose);
            modelWindow.appendChild(exploreFrame);

            section.appendChild(modelWindow);
          } else {
            const body = document.createElement('div');
            body.className = 'narrative-body';
            body.innerHTML = content.body.map(p => `<p>${p}</p>`).join('');
            card.appendChild(body);
            mountPhaseViz(sec.key, card);

            const textBlock = document.createElement('div');
            textBlock.className = 'narrative-text-block';
            textBlock.appendChild(card);
            section.appendChild(modelWindow);
            section.appendChild(textBlock);
          }

          page.appendChild(section);
        });

        document.body.appendChild(page);

        // ── Page footer (contact + credits — not a scroll phase) ──────────
        const narrativeFooter = document.createElement('footer');
        narrativeFooter.className = 'narrative-footer';
        narrativeFooter.innerHTML = `
          <div class="narrative-footer__inner">
            <div class="footer-two-col">
              <div class="footer-col footer-col--left">
                <a class="footer-heading-link" href="https://www.instagram.com/toxos_x/?hl=en" target="_blank" rel="noopener noreferrer">Towards Detoxification</a>
                <p class="footer-inst-note">With support from the community of Columbia University GSAPP</p>
                <p class="footer-inst-note">© 2026 TOXOS. ALL RIGHTS RESERVED.</p>
              </div>
              <div class="footer-col footer-col--right">
                <div class="credits-list">
                  <span class="credits-label">Founders</span>
                  <span class="credits-name">Shannon Levkovitz</span>
                  <span class="credits-name">Julio Viejo Romero-Mazariegos</span>
                  <span class="credits-name">Patrick Rodriguez</span>
                  <span class="credits-name">Claire Galla</span>
                  <span class="credits-name">Samantha Nowak</span>
                  <span class="credits-label">Contributors</span>
                  <span class="credits-name">Benny Yang</span>
                  <span class="credits-name">Cole Chroman</span>
                  <span class="credits-name">Xiaodian Yi</span>
                  <span class="credits-label">Advisors</span>
                  <span class="credits-name">Amelyn Ng</span>
                  <span class="credits-name">Xiaoxi Chen</span>
                  <span class="credits-label">Guest Speakers</span>
                  <span class="credits-name">Christopher Swain</span>
                  <span class="credits-name">Mark Wasiuta</span>
                </div>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(narrativeFooter);

        // ── Narrative Timeline ────────────────────────────────────────────
        const { dotWraps: _dotWraps } = mountNarrativeTimeline(page, SECTIONS);

        // ── Explore Model sections (generalized) ──────────────────────────
        let _exploreActive = false;
        let _mouseInExplore = false;
        let _exploreForwardCleanup = null;
        let _exploreCamSnapshot = null;
        let _activeExploreSection = null;
        let _activeExploreMWin = null;
        let _restoreCamRafId = null;

        const _exploreFooterControls = document.querySelector('.footer-controls');

        function activateExplore(section) {
          if (_exploreActive) return;
          if (_restoreCamRafId) { cancelAnimationFrame(_restoreCamRafId); _restoreCamRafId = null; }
          _exploreActive = true;
          _activeExploreSection = section;
          _activeExploreMWin = section.querySelector('.narrative-model-window');

          // Snapshot camera + controls state so we can restore it on deactivate.
          const cam = getCamera();
          _exploreCamSnapshot = {
            position: cam.position.clone(),
            quaternion: cam.quaternion.clone(),
            zoom: cam.zoom,
            target: controls.target.clone(),
          };

          setControlsInteraction(true, true, true);
          setParallaxEnabled(false);
          section.classList.add('explore-mode-active');

          // Show anchored labels only during explore mode.
          for (const label of sceneLabels) {
            label.visible = true;
            label.element.style.transition = 'opacity 300ms ease';
            label.element.style.color = '#ffffff';
            requestAnimationFrame(() => { label.element.style.opacity = '0.75'; });
          }

          // Subtle zoom nudge to signal the model is now interactive.
          setZoom(homeZoom * (CONFIG.camera.exploreZoom ?? 1.25) * 1.06);

          if (_exploreFooterControls) {
            _exploreFooterControls.style.transition = 'opacity 0.4s';
            _exploreFooterControls.style.display = 'block';
            _exploreFooterControls.style.opacity = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              _exploreFooterControls.style.opacity = '1';
            }));
          }

          const canvas = renderer.domElement;
          const mw = _activeExploreMWin;
          mw.style.pointerEvents = 'auto';
          mw.style.touchAction = 'none';

          function fwdPointer(e) {
            e.preventDefault();
            canvas.dispatchEvent(new PointerEvent(e.type, {
              pointerId: e.pointerId, pointerType: e.pointerType,
              clientX: e.clientX, clientY: e.clientY,
              button: e.button, buttons: e.buttons,
              pressure: e.pressure, isPrimary: e.isPrimary,
              bubbles: false, cancelable: true,
            }));
          }
          function fwdWheel(e) {
            e.preventDefault();
            e.stopPropagation();
            canvas.dispatchEvent(new WheelEvent('wheel', {
              deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
              deltaMode: e.deltaMode,
              clientX: e.clientX, clientY: e.clientY,
              ctrlKey: e.ctrlKey,
              bubbles: false,
            }));
          }

          function blockContextMenu(e) { e.preventDefault(); }

          mw.addEventListener('pointerdown',   fwdPointer);
          mw.addEventListener('pointermove',   fwdPointer);
          mw.addEventListener('pointerup',     fwdPointer);
          mw.addEventListener('pointercancel', fwdPointer);
          mw.addEventListener('wheel', fwdWheel, { passive: false });
          mw.addEventListener('contextmenu', blockContextMenu);

          _exploreForwardCleanup = () => {
            mw.removeEventListener('pointerdown',   fwdPointer);
            mw.removeEventListener('pointermove',   fwdPointer);
            mw.removeEventListener('pointerup',     fwdPointer);
            mw.removeEventListener('pointercancel', fwdPointer);
            mw.removeEventListener('wheel', fwdWheel);
            mw.removeEventListener('contextmenu', blockContextMenu);
            mw.style.pointerEvents = '';
            mw.style.touchAction = '';
          };
        }

        function deactivateExplore() {
          if (!_exploreActive) return;
          _exploreActive = false;
          setControlsInteraction(false, false, false);
          setParallaxEnabled(true);
          _activeExploreSection?.classList.remove('explore-mode-active');
          if (_exploreForwardCleanup) { _exploreForwardCleanup(); _exploreForwardCleanup = null; }

          if (_exploreFooterControls) {
            _exploreFooterControls.style.opacity = '0';
            setTimeout(() => {
              _exploreFooterControls.style.display = 'none';
              _exploreFooterControls.style.transition = '';
            }, 400);
          }

          // Hide anchored labels on explore exit.
          for (const label of sceneLabels) {
            label.element.style.transition = 'opacity 300ms ease';
            label.element.style.opacity = '0';
          }
          setTimeout(() => { for (const label of sceneLabels) label.visible = false; }, 320);

          // Gently tween camera + controls back to the state before explore was activated.
          if (_exploreCamSnapshot) {
            const snap = _exploreCamSnapshot;
            _exploreCamSnapshot = null;
            if (_restoreCamRafId) { cancelAnimationFrame(_restoreCamRafId); _restoreCamRafId = null; }
            const cam = getCamera();
            const tPos  = snap.position.clone();
            const tQuat = snap.quaternion.clone();
            const tTgt  = snap.target.clone();
            const tZoom = snap.zoom;
            const a = 0.07;
            function tickRestore() {
              cam.position.lerp(tPos, a);
              cam.quaternion.slerp(tQuat, a);
              cam.zoom = THREE.MathUtils.lerp(cam.zoom, tZoom, a);
              cam.updateProjectionMatrix();
              controls.target.lerp(tTgt, a);
              controls.update();
              const done =
                cam.position.distanceTo(tPos) < 0.005 &&
                cam.quaternion.angleTo(tQuat)  < 0.0005 &&
                Math.abs(cam.zoom - tZoom)     < 0.0005 &&
                controls.target.distanceTo(tTgt) < 0.005;
              if (done) {
                cam.position.copy(tPos);
                cam.quaternion.copy(tQuat);
                cam.zoom = tZoom;
                cam.updateProjectionMatrix();
                controls.target.copy(tTgt);
                controls.update();
                _restoreCamRafId = null;
              } else {
                _restoreCamRafId = requestAnimationFrame(tickRestore);
              }
            }
            _restoreCamRafId = requestAnimationFrame(tickRestore);
          }

          _activeExploreSection = null;
          _activeExploreMWin = null;
        }

        // Wire up every section that contains an explore trigger.
        page.querySelectorAll('.explore-model-trigger').forEach(trigger => {
          const section = trigger.closest('[data-section-key]');
          const mw = section?.querySelector('.narrative-model-window');
          if (!section || !mw) return;

          trigger.addEventListener('click', () => activateExplore(section));
          trigger.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') activateExplore(section);
          });
          mw.addEventListener('pointerenter', () => { if (_activeExploreSection === section) _mouseInExplore = true; });
          mw.addEventListener('pointerleave', () => { if (_activeExploreSection === section) _mouseInExplore = false; });
        });

        // Close button on explore frame
        page.querySelectorAll('.explore-frame-close').forEach(btn => {
          btn.addEventListener('pointerdown', e => e.stopPropagation());
          btn.addEventListener('click', () => deactivateExplore());
        });

        // ESC key exits explore mode
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape') deactivateExplore();
        });

        // Block page scroll only when ctrl+scroll is used inside the active explore window.
        setNarrativeScrollHandler((_delta, e) => _exploreActive && _mouseInExplore && (e?.ctrlKey ?? false));

        // Enable native page scroll.
        document.documentElement.style.overflowY = 'scroll';
        document.documentElement.style.height = 'auto';
        document.body.style.overflowY = 'visible';
        document.body.style.height = 'auto';
        document.body.classList.add('narrative-scroll-mode');

        const viewerContainer = document.getElementById('viewer-container');
        // Hide canvas initially — scroll handler reveals it after the title screen.
        viewerContainer.style.opacity = '0';
        const { min: tMin } = getTiltInfo();
        const modelWindows = Array.from(page.querySelectorAll('.narrative-model-window'));

        // Precompute model-window page-offsets so the scroll handler never calls
        // getBoundingClientRect() (which forces layout) on every scroll event.
        let winTops = [];
        let maxScroll = 0;
        function _precompute() {
          winTops = modelWindows.map(win => {
            let top = 0, el = win;
            while (el && el !== document.body) { top += el.offsetTop; el = el.offsetParent; }
            return top;
          });
          maxScroll = Math.max(0, page.scrollHeight - window.innerHeight);
        }
        _precompute();
        window.addEventListener('resize', _precompute, { passive: true });

        function onNarrativeScroll() {
          const scrollY = window.scrollY;
          const vh = window.innerHeight;

          // Find the model window with the most pixels visible — no DOM reads,
          // uses precomputed winTops offsets.
          let activeIdx = -1;
          let bestVisible = -Infinity;
          for (let i = 0; i < winTops.length; i++) {
            const top = winTops[i] - scrollY;
            const vis = Math.min(top + vh, vh) - Math.max(top, 0);
            if (vis > bestVisible) { bestVisible = vis; activeIdx = i; }
          }

          // Canvas always visible — model shows in top-down for phase 0, transitions to home in phase 1.
          viewerContainer.style.opacity = '1';

          // From the start of the last section (phase 8) onward, the canvas scrolls up
          // with the page so the model exits through the top as the footer comes in.
          const lastSectionTop = winTops[winTops.length - 1];
          const scrolledPast = scrollY - lastSectionTop;
          viewerContainer.style.transform = scrolledPast > 0
            ? `translateY(${-scrolledPast}px)`
            : 'none';

          // Scroll-driven lift: scrub datapoints from ground to stacked heights
          // between the midpoint of phase-3 and the start of phase-4.
          // Hold activeIdx at phase-3 during the lift so _applyPhase(4) (and its
          // fadeOverlays(false)) doesn't fire until the groups are already up.
          const P3_IDX = 5, P4_IDX = 6;
          let inLiftZone = false;
          let liftT = 0;
          if (winTops.length > P4_IDX) {
            const liftStart = winTops[P3_IDX] + (winTops[P4_IDX] - winTops[P3_IDX]) * 0.5;
            const liftEnd   = winTops[P4_IDX];
            if (scrollY >= liftStart && scrollY < liftEnd && currentPhase !== 4) {
              inLiftZone = true;
              liftT = (scrollY - liftStart) / (liftEnd - liftStart);
              if (activeIdx === P4_IDX) activeIdx = P3_IDX;
            }
          }

          if (activeIdx >= 0) {
            const sec = SECTIONS[activeIdx];
            _applyPhase(sec.phase);
            if (sec.subPhase >= 0) _applyDissectedSubPhase(sec.subPhase);
            if (_exploreActive && _activeExploreSection?.dataset.sectionKey !== sec.key) deactivateExplore();
          }

          _dotWraps.forEach((w, i) => w.classList.toggle('active', i === activeIdx));

          if (inLiftZone) {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            explodeGroups.forEach((g, i) => {
              g.position.y = liftT * (i + 1) * 700;
              targetY[i]   = g.position.y;
            });
          }

          // Tilt: map overall scroll progress to camera angle.
          const progress = maxScroll > 0 ? Math.min(1, scrollY / maxScroll) : 0;
          setTiltTarget(homeTheta + (tMin - homeTheta) * progress);
        }

        window.addEventListener('scroll', onNarrativeScroll, { passive: true });
        // Apply initial state immediately (scrollY = 0).
        onNarrativeScroll();
      }

    }

    const tickSprites = setupTooltips(getCamera, scene, tooltipEl, modelBox, () => isDissected);
    setTickSprites(tickSprites);

    hidePreloader();

    // bgColorFrom/bgColorTo: lerp endpoints for the background transition.
    // modeT animates 0→1 from the snapshot color at trigger time to the new target color.
    const bgColorFrom = new THREE.Color(0xeeeeee);
    const bgColorTo = new THREE.Color(0xeeeeee);
    let modeT = 1;
    let modeTarget = 1;
    let modelT = 0;
    let modelTarget = 0;
    let modeRafId = null;
    let modePrevTime = performance.now();

    function tickModeFrame(now) {
      const dt = (now - modePrevTime) / 200;
      modePrevTime = now;

      if (modeTarget > modeT) modeT = Math.min(modeT + dt, modeTarget);
      else modeT = Math.max(modeT - dt, modeTarget);

      if (modelTarget > modelT) modelT = Math.min(modelT + dt, modelTarget);
      else modelT = Math.max(modelT - dt, modelTarget);

      const isDarkNow = modelT >= 0.5;
      for (const result of Object.values(csvResults)) {
        if (!result?.material) continue;
        const tex = isDarkNow ? result.darkTex : result.lightTex;
        if (result.material.map !== tex) {
          result.material.map = tex;
          result.material.needsUpdate = true;
        }
      }

      setModeProgress(modelT);
      scene.background.lerpColors(bgColorFrom, bgColorTo, modeT);
      document.body.style.setProperty('--bg-dark', '#' + scene.background.getHexString());

      const bgSettled = Math.abs(modeT - modeTarget) <= 0.0001;
      const modelSettled = Math.abs(modelT - modelTarget) <= 0.0001;
      if (!bgSettled || !modelSettled) {
        modeRafId = requestAnimationFrame(tickModeFrame);
      } else {
        modeT = modeTarget;
        modelT = modelTarget;
        setModeProgress(modelT);
        modeRafId = null;
      }
    }

    // bg/darkUI/mdT: background, UI theme, model texture — see MODE_VISUALS above.
    // labelColor/labelOpacity: applied directly to anchored scene text elements.
    _triggerMode = ({ bg, darkUI, mdT: mdT_new, labelColor, labelOpacity }) => {
      const newBgTo = new THREE.Color(bg);
      const bgChanged = !bgColorTo.equals(newBgTo);
      const mdChanged = modelTarget !== mdT_new;
      const uiChanged = document.body.classList.contains('dark') !== darkUI;
      if (!bgChanged && !mdChanged && !uiChanged) return;

      bgColorFrom.copy(scene.background);  // snapshot current color as lerp start
      bgColorTo.copy(newBgTo);
      modeT = 0;
      modeTarget = 1;
      modelTarget = mdT_new;

      document.body.classList.toggle('dark', darkUI);

      // Double RAF ensures these run after fadeOverlays' single RAF (which sets opacity '1').
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!_labelsVisible) return;
        for (const label of sceneLabels) {
          label.element.style.color = labelColor;
          label.element.style.opacity = labelOpacity;
        }
      }));

      if (!modeRafId) {
        modePrevTime = performance.now();
        modeRafId = requestAnimationFrame(tickModeFrame);
      }
    };

    // Apply initial mode visuals immediately on load (click handler never fires for the default mode).
    _triggerMode(MODE_VISUALS[_currentMode]);

    animateIntro(getCamera(), controls, 1750);
  } catch (err) {
    setProgress(100, "Error – see console");
    console.error("[main] Initialisation failed:", err);
    setTimeout(() => preloaderEl?.classList.add("done"), 2000);
  }
}


init();
