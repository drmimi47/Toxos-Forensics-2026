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
import { createCollagePlanes } from "./collage.js";

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
  const { scene, camera, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, goTopDown, enableDissectedTilt } = createViewer();
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
    const modelBox = new THREE.Box3().setFromObject(model);
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

    // 4c. Create flat collage image planes (hidden until COLLAGE submenu is active)
    const collage = createCollagePlanes(scene, modelBox);

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
    let isDissected = false;
    let _currentMode = 'recorded'; // tracks active 3D submenu; matches HTML initial .active item

    // DISSECTED annotation system: SVG leader lines connect each dataset's extreme
    // data point (projected live each frame) to a fixed text panel on the left or right
    // side of the viewport. Panels alternate sides as datasets are added so each side
    // fills evenly. The edge sprite used is the one on the SAME side as the panel
    // (right panel → rightmost point, left panel → leftmost point) so the line takes
    // the shortest path. Point B is the inner edge of the text, facing the model.
    const _dissectedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _dissectedSvg.id = 'diss-svg';
    document.body.appendChild(_dissectedSvg);

    const _dissectedPanelsRight = document.createElement('div');
    _dissectedPanelsRight.id = 'diss-panels-right';
    document.body.appendChild(_dissectedPanelsRight);

    const _dissectedPanelsLeft = document.createElement('div');
    _dissectedPanelsLeft.id = 'diss-panels-left';
    document.body.appendChild(_dissectedPanelsLeft);

    // Convenience array for bulk opacity changes
    const _dissEls = [_dissectedSvg, _dissectedPanelsRight, _dissectedPanelsLeft];

    const _annData = [
      // ── TERMINUS POINT FINE-TUNING ──────────────────────────────────────────
      // terminusIndex: the 1-based point number shown in the detail side-panel
      //   (e.g. "42 / 71" → set terminusIndex: 42).
      // Set to null to auto-pick the leftmost or rightmost point depending on
      // which side the text panel is on (right panel → rightmost, left → leftmost).
      //
      // Point counts for reference:
      //   CSO  — 71 total   (terminusIndex range: 1 – 71)
      //   NPDES — 91 total  (terminusIndex range: 1 – 91)
      //   RCRA  — ~5383 total (terminusIndex range: 1 – 5383)
      // ────────────────────────────────────────────────────────────────────────
      // color values reference CSS custom properties so they automatically adapt
      // to light/dark mode without any JS involvement (see :root / body.dark in style.css).
      { result: csvResults.cso,               name: 'CSO',   color: 'var(--cso-color)',   terminusIndex: null, lorem: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim.' },
      { result: csvResults.npdes,             name: 'NPDES', color: 'var(--npdes-color)', terminusIndex: null, lorem: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure.' },
      { result: csvResults.rcra_2263_clipped, name: 'RCRA',  color: 'var(--rcra-color)',  terminusIndex: 907, lorem: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat.' },
    ].flatMap(({ result, name, color, terminusIndex, lorem }, i) => {
      // Alternate: even index → right side, odd index → left side
      const side = i % 2 === 0 ? 'right' : 'left';

      // Resolve terminus sprite:
      //   • terminusIndex set  → use the exact sprite at that 1-based position in the
      //     dataset (same numbering shown in the detail panel).  Falls back to the
      //     auto edge sprite if the index is out of range.
      //   • terminusIndex null → auto-pick the edge sprite on the same side as the
      //     text panel so the leader line takes the shortest path to the model edge.
      const autoSprite = side === 'right' ? result?.edgeSpriteRight : result?.edgeSpriteLeft;
      const sprite = (terminusIndex != null)
        ? (result?.group?.children[terminusIndex - 1] ?? autoSprite)
        : autoSprite;
      if (!sprite) return [];

      // SVG leader line (Point A → Point B).
      // stroke is set via style (not attribute) so CSS custom properties resolve correctly.
      const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      svgLine.style.stroke = color;
      svgLine.setAttribute('stroke-opacity', '0.7');
      svgLine.setAttribute('stroke-width', '1');
      _dissectedSvg.appendChild(svgLine);

      // Small dot at Point A (marks the chosen data point on the 3D side).
      // fill is set via style so CSS custom properties resolve correctly.
      const svgDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svgDot.setAttribute('r', '2.5');
      svgDot.style.fill = color;
      _dissectedSvg.appendChild(svgDot);

      // Text panel appended to the correct side container
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

      // Click-to-toggle: clicking the panel hides / shows that dataset, matching
      // the same interaction as clicking a legend item in RECORDED mode.
      let dissVisible = true;
      panel.addEventListener('click', () => {
        dissVisible = !dissVisible;
        // Toggle the 3D sprite group
        if (result?.group) result.group.visible = dissVisible;
        // Dim the panel text to signal the hidden state
        panel.classList.toggle('disabled', !dissVisible);
        // Dim the SVG leader line and dot proportionally
        svgLine.setAttribute('stroke-opacity', dissVisible ? '0.7' : '0.18');
        svgDot.setAttribute('opacity',          dissVisible ? '1'   : '0.18');
        // Close the detail card if it is showing a point from this dataset
        if (!dissVisible && new RegExp(name, 'i').test(getDetailType())) {
          closeDetail();
        }
      });

      return [{ sprite, svgLine, svgDot, nameEl, side }];
    });

    // Per-frame: project each edge sprite's world position to screen coords and
    // update the SVG line so it always runs from Point A → Point B.
    // Point B is the INNER edge of the text (the edge facing the 3D model):
    //   right panel → left edge of name   left panel → right edge of name
    let _dissLineRafId = null;
    const _dissVec = new THREE.Vector3();
    function _tickDissLines() {
      if (!isDissected) { _dissLineRafId = null; return; }
      const rect = renderer.domElement.getBoundingClientRect();
      for (const ann of _annData) {
        ann.sprite.getWorldPosition(_dissVec);
        const n = _dissVec.clone().project(camera);
        // Point A: live screen projection of the 3D edge sprite
        const ax = rect.left + (n.x *  0.5 + 0.5) * rect.width;
        const ay = rect.top  + (n.y * -0.5 + 0.5) * rect.height;
        // Point B: inner edge of the actual text glyphs (not the full element box).
        // A Range measures the tight rect around the rendered characters, so
        // nr.left / nr.right land exactly on the first / last letter edge
        // rather than on the paragraph container's layout boundary.
        const range = document.createRange();
        range.selectNodeContents(ann.nameEl);
        const nr = range.getBoundingClientRect();
        // TEXT_GAP: pixels of breathing room between the line tip and the glyph edge.
        const TEXT_GAP = 6;
        const bx = ann.side === 'right' ? nr.left - TEXT_GAP : nr.right + TEXT_GAP;
        const by = nr.top + nr.height / 2;
        ann.svgLine.setAttribute('x1', ax); ann.svgLine.setAttribute('y1', ay);
        ann.svgLine.setAttribute('x2', bx); ann.svgLine.setAttribute('y2', by);
        ann.svgDot.setAttribute('cx', ax);  ann.svgDot.setAttribute('cy', ay);
      }
      _dissLineRafId = requestAnimationFrame(_tickDissLines);
    }

    // 5. Dissected view: explode dataset groups vertically + snap camera home
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
      const aboutOverlay = document.getElementById('about-overlay');

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
          const isAbout   = name === 'about';
          const isFatberg = name === 'fatberg';

          // Show or hide the credits / about overlays
          creditsOverlay?.classList.toggle('visible', isCredits);
          aboutOverlay?.classList.toggle('visible', isAbout);

          // Don't change 3D state when just opening an overlay
          if (isCredits || isAbout) return;

          // Already in this 3D submenu — ignore re-clicks
          if (name === _currentMode) return;
          _currentMode = name;

          // Track DISSECTED mode so crosshair lines know when to appear
          isDissected = (name === 'dissected');

          // Tilt must be toggled here — before any early returns — so switching from
          // DISSECTED → COLLAGE / FATBERG correctly disables scroll-to-tilt.
          enableDissectedTilt(isDissected);

          // Show collage drawings when in COLLAGE mode, hide otherwise
          if (name === 'collage') { collage.show(); } else { collage.hide(); }

          // Disable LMB rotation in COLLAGE (top-down pan mode) and DISSECTED; restore otherwise
          const isCollage = name === 'collage';
          controls.mouseButtons.LEFT  = (isCollage || isDissected) ? null : THREE.MOUSE.ROTATE;
          controls.mouseButtons.RIGHT = isDissected ? null : THREE.MOUSE.PAN;
          controls.enableZoom         = !isDissected;
          document.body.classList.toggle('collage-mode', isCollage);
          document.body.classList.toggle('dissected-mode', isDissected);
          document.body.classList.toggle('fatberg-mode', isFatberg);

          // Cancel any in-flight or completed pulse animations so no hint carries
          // over a stale opacity into the incoming submenu's fresh state.
          document.querySelectorAll('.ctrl-pulse').forEach(el => el.classList.remove('ctrl-pulse'));

          // Fatberg: bare 3D model only — fade all data overlays out/in, reset camera
          fadeOverlays(!isFatberg);

          if (isFatberg) { goFatbergView(); setZoom(homeZoom); _triggerMode?.(false); for (const el of _dissEls) el.style.opacity = '0'; return; }
          // set * 0.x multiplier to lower to zoom out more in collage
          if (name === 'collage') { goTopDown(); setExplode(explodeGroups.map(() => 0)); setZoom(homeZoom * 0.4); for (const el of _dissEls) el.style.opacity = '0'; return; }

          if (name === 'dissected') {
            goDissectedView(); // shifts camera+target upward so model sits near bottom of screen
            setExplode(explodeGroups.map((_, i) => (i + 1) * 700));
            setZoom(homeZoom * 0.70);
            //abaove controls the spacing of the data sets and the extent of the camera zoom in the DISSECTED submenu.
            // Start SVG line loop immediately so positions are ready when elements fade in
            if (!_dissLineRafId) _dissLineRafId = requestAnimationFrame(_tickDissLines);
            // Dim scene labels and fade in annotation panels — double-RAF ensures this
            // runs after fadeOverlays' single-RAF restore so transitions animate correctly
            requestAnimationFrame(() => requestAnimationFrame(() => {
              for (const label of sceneLabels) label.element.style.opacity = '0.5';
              for (const img   of sceneImages)  img.element.style.opacity   = '0.5';
              for (const el of _dissEls) el.style.opacity = '1';
            }));
          } else {
            if (name === 'recorded' || name === 'remediated') goHome();
            setExplode(explodeGroups.map(() => 0));
            setZoom(homeZoom);
            _triggerMode?.(name === 'remediated');
            for (const el of _dissEls) el.style.opacity = '0';
            // _tickDissLines auto-stops on next tick via isDissected=false guard
            requestAnimationFrame(() => requestAnimationFrame(() => {
              for (const label of sceneLabels) label.element.style.opacity = '1';
              for (const img   of sceneImages)  img.element.style.opacity   = '1';
            }));
          }
        });
      });
    }

    // 6. Tooltips via raycasting
    const tickSprites = setupTooltips(camera, scene, tooltipEl, modelBox, () => isDissected);
    setTickSprites(tickSprites);

    // 7. Disabled-control pulse feedback
    // When the user triggers an input that is currently disabled, the corresponding
    // dimmed hint in the footer briefly flashes to remind them it's inactive.
    function pulseCtrl(selector) {
      const el = document.querySelector(selector);
      if (!el) return;
      el.classList.remove('ctrl-pulse');
      void el.offsetWidth; // force reflow so the animation restarts on rapid repeats
      el.classList.add('ctrl-pulse');
    }

    const _canvas = renderer.domElement;

    // LMB rotate — disabled in COLLAGE and DISSECTED
    _canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (document.body.classList.contains('collage-mode') ||
          document.body.classList.contains('dissected-mode')) {
        pulseCtrl('.ctrl-lmb');
      }
    });

    // RMB pan — disabled in DISSECTED
    _canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      if (document.body.classList.contains('dissected-mode')) pulseCtrl('.ctrl-rmb');
    });

    // Scroll zoom — disabled in DISSECTED (scroll tilts instead; no pulse since scroll IS functional)

    // DblClick top view — disabled in DISSECTED
    _canvas.addEventListener('dblclick', () => {
      if (document.body.classList.contains('dissected-mode')) pulseCtrl('.ctrl-dblclick');
    });

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
