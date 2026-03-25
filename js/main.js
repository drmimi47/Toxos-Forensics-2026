import * as THREE from "three";
import CONFIG from "../config/config.js";
import { createViewer } from "./viewer.js";
import { loadModel } from "./gltfLoader.js";
import { loadAllCSV } from "./csvLoader.js";
import { setupTooltips, frameBoundingBox, animateIntro } from "./utils.js";
import { closeDetail, closeAllDetails, getDetailType } from "./detailPanel.js";
import { addAllLabels, addAllImages } from "./labels.js";
import { buildTerrainSnapper } from "./terrainSnap.js";
import { initNarrativePanel, setNarrativeContent, NARRATIVE_CONTENT } from "./narrativeText.js";
import { mountPhaseViz } from "./phase-vizdata.js";

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
    preloaderEl?.classList.add("done");
    updatePageScrollLock();
    _onPreloaderComplete?.();
  }, 400);
}

async function init() {

  updatePageScrollLock();

  initNarrativePanel();

  setProgress(5, "Setting up 3D scene and camera");

  const initialVisuals = { bg: '#111111', darkUI: true, mdT: 0, labelColor: '#ffffff', labelOpacity: 0.75 };

  const { scene, getCamera, setCameraMode, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, enableDissectedTilt, getTiltInfo, setTiltTarget, setControlsInteraction, setNarrativeScrollHandler, setModelSphere } = createViewer();

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

    setProgress(88, "Adding overlay images to scene");
    const sceneImages = addAllImages(scene, getCamera);

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

      // Fixed CSO → NPDES → RCRA order for the sequential reveal in phase 0.
      const orderedGroups = [
        csvResults.cso?.group,
        csvResults.npdes?.group,
        csvResults.rcra_2263_clipped?.group,
      ].filter(Boolean);

      let _currentSubPhase = -1;

      const _subPhaseKeys = ['phase-1-cso', 'phase-1-npdes', 'phase-1-rcra'];

      function _applyDissectedSubPhase(idx) {
        if (idx === _currentSubPhase) return;
        _currentSubPhase = idx;
        setNarrativeContent(_subPhaseKeys[idx]);
        orderedGroups.forEach((g, i) => { if (g) g.visible = (i === idx); });
        for (const ann of _annData) {
          const active = ann.dataGroup === orderedGroups[idx];
          ann.svgLine.setAttribute('stroke-opacity', active ? '0.7' : '0');
          ann.svgDot.setAttribute('opacity', active ? '1' : '0');
          ann.panel.style.opacity = active ? '1' : '0';
          ann.panel.style.pointerEvents = active ? '' : 'none';
        }
      }

      const targetY = explodeGroups.map(() => 0);
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

      const creditsOverlay = document.getElementById('credits-overlay');
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
          for (const m of materials) { m.opacity = 0; m.needsUpdate = true; }
        }

        const startOp = toVisible ? 0 : 1;
        const endOp = toVisible ? 1 : 0;
        const t0 = performance.now();

        function tick() {
          if (_fadeCancelToken !== token) return;
          const p = Math.min((performance.now() - t0) / FADE_MS, 1);
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

      // ── Core mode switch (used by nav and narrative) ───────────
      function _doSwitchMode(name, force = false) {
        if (name === 'map') name = 'recorded'; // "Map" nav item = recorded/home mode
        const isCredits = name === 'credits';
        const isAbout = name === 'about';
        const isFatberg = name === 'fatberg';

        creditsOverlay?.classList.toggle('visible', isCredits);
        aboutOverlay?.classList.toggle('visible', isAbout);

        if (isCredits || isAbout) return;

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

      let currentPhase = -1;

      // Declarative model state per narrative phase.
      // Edit a row here to change which model version/visual state a phase uses.
      //
      // mode            – key into MODE_VISUALS (controls bg, texture, dark/light UI)
      // isDissected     – true while the exploded iso model is the primary view
      // bodyClass       – CSS class added to <body> for this phase (null = none)
      // overlays        – whether CSV sprite overlays are visible
      // explodeStacked  – true = layers spread apart (700ft each), false = collapsed
      // allGroupsVisible– force all CSV groups visible (phase 0 resets subPhase selection)
      // startDissLines  – start/continue the SVG dissection-line RAF loop
      // narrativeKey    – passed to setNarrativeContent; null = scroll card handles text
      // dissElsOpacity  – opacity for annotation panel elements ('0'|'1'|null=skip)
      // sceneImages     – show/hide anchored scene images (null = leave unchanged)
      // NOTE: whenever overlays are visible, data layers are automatically exploded
      // (stacked 700ft apart). No separate flag needed — overlays drives explosion.
      const PHASE_MODEL_CONFIG = {
        [-1]: { mode: 'recorded',   isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
        [-2]: { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
        [-3]: { mode: 'recorded',   isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
        [-4]: { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
        [-5]: { mode: 'fatberg',    isDissected: false, bodyClass: 'fatberg-mode',   overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
        [-6]: { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: null,      dissElsOpacity: '0', sceneImages: null },
          [0]: { mode: 'dissected',  isDissected: true,  bodyClass: 'dissected-mode', overlays: true,  allGroupsVisible: true,  startDissLines: true,  narrativeKey: 'phase-0', dissElsOpacity: '0', sceneImages: true },
          [1]: { mode: 'dissected',  isDissected: true,  bodyClass: 'dissected-mode', overlays: true,  allGroupsVisible: false, startDissLines: true,  narrativeKey: null,      dissElsOpacity: '1', sceneImages: true },
          [2]: { mode: 'fatberg',    isDissected: false, bodyClass: 'fatberg-mode',   overlays: false, allGroupsVisible: false, startDissLines: false, narrativeKey: 'phase-2', dissElsOpacity: '0', sceneImages: null },
          [3]: { mode: 'remediated', isDissected: false, bodyClass: null,             overlays: true,  allGroupsVisible: false, startDissLines: false, narrativeKey: 'phase-3', dissElsOpacity: '0', sceneImages: true },
      };

      function _applyPhase(phase) {
        if (phase === currentPhase) return;
        currentPhase = phase;

        const cfg = PHASE_MODEL_CONFIG[phase];
        if (!cfg) return;

        if (cfg.narrativeKey) setNarrativeContent(cfg.narrativeKey);

        isDissected = cfg.isDissected;
        _currentMode = cfg.mode;

        document.body.classList.remove('dissected-mode', 'fatberg-mode');
        if (cfg.bodyClass) document.body.classList.add(cfg.bodyClass);

        fadeOverlays(cfg.overlays);
        if (_triggerMode) _triggerMode(MODE_VISUALS[cfg.mode]);

        if (cfg.allGroupsVisible) orderedGroups.forEach(g => { if (g) g.visible = true; });

        // Data layers are always exploded when their overlays are visible.
        setExplode(cfg.overlays
          ? explodeGroups.map((_, i) => (i + 1) * 700)
          : explodeGroups.map(() => 0));

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
      }

      // Auto-start the narrative scroll experience once the preloader has faded out.
      _onPreloaderComplete = () => {
        closeAllDetails();
        currentPhase = -1;
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
        goHome();
        _startScrollNarrative();
      };
      function _startScrollNarrative() {
        const SECTIONS = [
          { key: 'phase--1',      phase: -1, subPhase: -1 },
          { key: 'phase-0',       phase: 0, subPhase: -1 },
          { key: 'phase-1-cso',   phase: 1, subPhase: 0  },
          { key: 'phase-1-npdes', phase: 1, subPhase: 1  },
          { key: 'phase-1-rcra',  phase: 1, subPhase: 2  },
          { key: 'phase-2',       phase: 2,  subPhase: -1 },
          { key: 'phase-2aa',     phase: -5, subPhase: -1 },
          { key: 'phase-2a',      phase: -2, subPhase: -1 },
          { key: 'phase-3',       phase: 3,  subPhase: -1 },
          { key: 'phase-3a',      phase: -6, subPhase: -1 },
          { key: 'phase-contact', phase: -4, subPhase: -1 },
          { key: 'phase-xx',      phase: -3, subPhase: -1 },
        ];

        const page = document.createElement('div');
        page.id = 'narrative-scroll-page';
        page.className = 'narrative-scroll-page';

        SECTIONS.forEach((sec, i) => {
          const content = NARRATIVE_CONTENT[sec.key];
          const section = document.createElement('div');
          section.className = 'narrative-scroll-section';
          if (sec.key === 'phase-contact') section.classList.add('narrative-scroll-section--contact');
          if (sec.key === 'phase-xx') section.classList.add('narrative-scroll-section--credits');
          section.dataset.sectionIdx = String(i);
          section.dataset.sectionKey = sec.key;

          const modelWindow = document.createElement('div');
          modelWindow.className = 'narrative-model-window';

          const card = document.createElement('div');
          card.className = 'narrative-text-card';

          const h = document.createElement('h2');
          h.className = 'narrative-heading';
          h.innerHTML = content.heading;

          card.appendChild(h);

          if (sec.phase < 0 && content.body.length === 0) {
            // Heading-only section: card centered inside the model window, no text block below
            section.classList.add('narrative-scroll-section--intro');
            modelWindow.appendChild(card);
            section.appendChild(modelWindow);
          } else {
            const body = document.createElement('div');
            body.className = 'narrative-body';
            body.innerHTML = sec.key === 'phase-xx'
              ? content.body.join('')
              : content.body.map(p => `<p>${p}</p>`).join('');
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

        // ── Explore Model sections (generalized) ──────────────────────────
        let _exploreActive = false;
        let _mouseInExplore = false;
        let _exploreForwardCleanup = null;
        let _exploreCamSnapshot = null;
        let _activeExploreSection = null;
        let _activeExploreMWin = null;

        const _exploreFooterControls = document.querySelector('.footer-controls');

        function activateExplore(section) {
          if (_exploreActive) return;
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
          section.classList.add('explore-mode-active');

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
            if (!e.ctrlKey) return;
            e.preventDefault();
            e.stopPropagation();
            canvas.dispatchEvent(new WheelEvent('wheel', {
              deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
              deltaMode: e.deltaMode,
              clientX: e.clientX, clientY: e.clientY,
              ctrlKey: true,
              bubbles: false,
            }));
          }

          mw.addEventListener('pointerdown',   fwdPointer);
          mw.addEventListener('pointermove',   fwdPointer);
          mw.addEventListener('pointerup',     fwdPointer);
          mw.addEventListener('pointercancel', fwdPointer);
          mw.addEventListener('wheel', fwdWheel, { passive: false });

          _exploreForwardCleanup = () => {
            mw.removeEventListener('pointerdown',   fwdPointer);
            mw.removeEventListener('pointermove',   fwdPointer);
            mw.removeEventListener('pointerup',     fwdPointer);
            mw.removeEventListener('pointercancel', fwdPointer);
            mw.removeEventListener('wheel', fwdWheel);
            mw.style.pointerEvents = '';
            mw.style.touchAction = '';
          };
        }

        function deactivateExplore() {
          if (!_exploreActive) return;
          _exploreActive = false;
          setControlsInteraction(false, false, false);
          _activeExploreSection?.classList.remove('explore-mode-active');
          if (_exploreForwardCleanup) { _exploreForwardCleanup(); _exploreForwardCleanup = null; }

          if (_exploreFooterControls) {
            _exploreFooterControls.style.opacity = '0';
            setTimeout(() => {
              _exploreFooterControls.style.display = 'none';
              _exploreFooterControls.style.transition = '';
            }, 400);
          }

          // Restore camera + controls to the state before explore was activated.
          if (_exploreCamSnapshot) {
            const cam = getCamera();
            cam.position.copy(_exploreCamSnapshot.position);
            cam.quaternion.copy(_exploreCamSnapshot.quaternion);
            cam.zoom = _exploreCamSnapshot.zoom;
            cam.updateProjectionMatrix();
            controls.target.copy(_exploreCamSnapshot.target);
            controls.update();
            _exploreCamSnapshot = null;
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

        // Block page scroll only when ctrl+scroll is used inside the active explore window.
        setNarrativeScrollHandler((_delta, e) => _exploreActive && _mouseInExplore && (e?.ctrlKey ?? false));

        // Enable native page scroll.
        document.documentElement.style.overflowY = 'scroll';
        document.documentElement.style.height = 'auto';
        document.body.style.overflowY = 'visible';
        document.body.style.height = 'auto';
        document.body.classList.add('narrative-scroll-mode');

        const viewerContainer = document.getElementById('viewer-container');
        // Hide the canvas initially if the first section is text-only.
        if (SECTIONS[0].phase < 0) {
          viewerContainer.style.opacity = '0';
        }
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

          // Hide the canvas on text-only sections (phase < 0); show it for all others.
          // Exception: explore model sections keep the canvas visible.
          const _activeSec = activeIdx >= 0 ? SECTIONS[activeIdx] : null;
          const _isExploreSec = _activeSec?.key === 'phase-2aa' || _activeSec?.key === 'phase-3a';
          viewerContainer.style.opacity = (_activeSec && _activeSec.phase < 0 && !_isExploreSec) ? '0' : '1';

          if (activeIdx >= 0) {
            const top = winTops[activeIdx] - scrollY;
            const isLast = activeIdx === SECTIONS.length - 1;

            // For the last section: once its model window has fully exited above
            // the viewport, pin the canvas at translateY(0) so the light
            // remediated model remains visible behind the narrative text.
            const translateY = (isLast && top + vh <= 0) ? 0 : top;
            viewerContainer.style.transform = `translateY(${translateY}px)`;

            const sec = SECTIONS[activeIdx];
            _applyPhase(sec.phase);
            if (sec.subPhase >= 0) _applyDissectedSubPhase(sec.subPhase);
            if (_exploreActive && _activeExploreSection?.dataset.sectionKey !== sec.key) deactivateExplore();
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
