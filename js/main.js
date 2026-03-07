import * as THREE from "three";
import { createViewer } from "./viewer.js";
import { loadModel } from "./gltfLoader.js";
import { loadAllCSV } from "./csvLoader.js";
import { setupTooltips, frameBoundingBox, animateIntro } from "./utils.js";
import { closeDetail, getDetailType } from "./detailPanel.js";
import { addAllLabels, addAllImages } from "./labels.js";
import { createCollagePlanes } from "./collage.js";

// Per-mode visual settings. Edit these values to retheme each submenu independently.
// bg:           hex color for the 3D viewport background.
// darkUI:       true applies dark UI theme (panels, text, borders); false = light.
// mdT:          model texture blend — 0 = light texture, 1 = dark texture.
// labelColor:   hex color for anchored scene text (East River, borough names, etc.).
// labelOpacity: opacity of the anchored scene text (0–1).
const MODE_VISUALS = {
  recorded:   { bg: '#111111', darkUI: true,  mdT: 0, labelColor: '#ffffff', labelOpacity: 0.75 },
  remediated: { bg: '#eeeeee', darkUI: false, mdT: 1, labelColor: '#000000', labelOpacity: 0.75 },
  fatberg:    { bg: '#ffffff', darkUI: false, mdT: 0, labelColor: '#000000', labelOpacity: 0.75 },
  collage:    { bg: '#eeeeee', darkUI: false, mdT: 1, labelColor: '#000000', labelOpacity: 0.75 },
  dissected:  { bg: '#111111', darkUI: true,  mdT: 0, labelColor: '#ffffff', labelOpacity: 0.50 },
};

const preloaderEl = document.querySelector(".preloader");
const preBarEl = document.getElementById("preloader-bar");
const preTextEl = document.getElementById("preloader-text");

function setProgress(pct, label) {
  if (preBarEl) preBarEl.style.width = `${Math.min(pct, 100)}%`;
  if (preTextEl) preTextEl.textContent = label;
}

function hidePreloader() {
  setProgress(100, "Complete");
  setTimeout(() => {
    preloaderEl?.classList.add("done");
  }, 400);
}

async function init() {

  setProgress(5, "Setting up 3D scene and camera");

  // Ensure initial background and model type match 'recorded' submenu specs
  // (bg: '#111111', mdT: 0)
  // This must be set before _triggerMode is called, in case the model/scene defaults differ
  // Set background color
  const initialVisuals = { bg: '#111111', darkUI: true, mdT: 0, labelColor: '#ffffff', labelOpacity: 0.75 };

  // If scene is not yet created, set after createViewer()

  const { scene, camera, renderer, controls, setTickSprites, setHomeState, goHome, goDissectedView, goFatbergView, goTopDown, enableDissectedTilt } = createViewer();

  // Set initial background color for the scene
  scene.background = new THREE.Color(initialVisuals.bg);

  // If model is loaded later, model texture blend will be set by _triggerMode
  const tooltipEl = document.getElementById("tooltip");

  try {
    setProgress(10, "Loading 3D model geometry and textures");

    const { model, setModeProgress } = await loadModel(
      scene,
      (pct) => {
        if (pct < 30) setProgress(10 + pct * 0.2, `Loading model geometry: ${Math.round(pct)}%`);
        else if (pct < 60) setProgress(16 + (pct-30) * 0.2, `Loading model textures: ${Math.round(pct)}%`);
        else setProgress(22 + (pct-60) * 0.5, `Finalizing 3D model: ${Math.round(pct)}%`);
      },
      renderer,
    );

    setProgress(75, "Calculating model bounding box and camera framing");

    const modelBox = new THREE.Box3().setFromObject(model);
    frameBoundingBox(model, camera, controls);
    setHomeState(camera.position, controls.target);
    const homeZoom = camera.zoom;

    setProgress(80, "Loading CSV data: CSO, NPDES, RCRA");
    const csvResults = await loadAllCSV(scene);

    setProgress(85, "Adding anchored labels to scene");
    const sceneLabels = addAllLabels(scene);

    setProgress(88, "Adding overlay images to scene");
    const sceneImages = addAllImages(scene);

    setProgress(91, "Creating collage planes");
    const collage = createCollagePlanes(scene, modelBox);

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
      { result: csvResults.cso,               name: 'CSO',   color: 'var(--cso-color)',   terminusIndex: null, lorem: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim.' },
      { result: csvResults.npdes,             name: 'NPDES', color: 'var(--npdes-color)', terminusIndex: null, lorem: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure.' },
      { result: csvResults.rcra_2263_clipped, name: 'RCRA',  color: 'var(--rcra-color)',  terminusIndex: 907, lorem: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat.' },
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
        svgDot.setAttribute('opacity',          dissVisible ? '1'   : '0.18');
        if (!dissVisible && new RegExp(name, 'i').test(getDetailType())) {
          closeDetail();
        }
      });

      return [{ sprite, svgLine, svgDot, nameEl, side }];
    });

    let _dissLineRafId = null;
    const _dissVec = new THREE.Vector3();
    function _tickDissLines() {
      if (!isDissected) { _dissLineRafId = null; return; }
      const rect = renderer.domElement.getBoundingClientRect();
      for (const ann of _annData) {
        ann.sprite.getWorldPosition(_dissVec);
        const n = _dissVec.clone().project(camera);
        const ax = rect.left + (n.x *  0.5 + 0.5) * rect.width;
        const ay = rect.top  + (n.y * -0.5 + 0.5) * rect.height;
        const range = document.createRange();
        range.selectNodeContents(ann.nameEl);
        const nr = range.getBoundingClientRect();
        const TEXT_GAP = 6;
        const bx = ann.side === 'right' ? nr.left - TEXT_GAP : nr.right + TEXT_GAP;
        const by = nr.top + nr.height / 2;
        ann.svgLine.setAttribute('x1', ax); ann.svgLine.setAttribute('y1', ay);
        ann.svgLine.setAttribute('x2', bx); ann.svgLine.setAttribute('y2', by);
        ann.svgDot.setAttribute('cx', ax);  ann.svgDot.setAttribute('cy', ay);
      }
      _dissLineRafId = requestAnimationFrame(_tickDissLines);
    }

    {
      const explodeGroups = [
        csvResults.cso?.group,
        csvResults.npdes?.group,
        csvResults.rcra_2263_clipped?.group,
      ].filter(Boolean).sort((a, b) => b.children.length - a.children.length);

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

      // Cancel programmatic zoom on manual scroll so tickZoom() never fights OrbitControls.
      controls.addEventListener('change', () => {
        if (zoomRafId) {
          cancelAnimationFrame(zoomRafId);
          zoomRafId = null;
          zoomTarget = camera.zoom;
        }
      });

      const creditsOverlay = document.getElementById('credits-overlay');
      const aboutOverlay = document.getElementById('about-overlay');

      const overlayObjects = [...sceneLabels, ...sceneImages];
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
            o.visible = true;
            requestAnimationFrame(() => { el.style.opacity = '1'; });
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

          creditsOverlay?.classList.toggle('visible', isCredits);
          aboutOverlay?.classList.toggle('visible', isAbout);

          if (isCredits || isAbout) return;

          if (name === _currentMode) return;
          _currentMode = name;

          isDissected = (name === 'dissected');

          enableDissectedTilt(isDissected);

          if (name === 'collage') { collage.show(); } else { collage.hide(); }

          const isCollage = name === 'collage';
          controls.mouseButtons.LEFT  = (isCollage || isDissected) ? null : THREE.MOUSE.ROTATE;
          controls.mouseButtons.RIGHT = isDissected ? null : THREE.MOUSE.PAN;
          controls.enableZoom         = !isDissected;
          document.body.classList.toggle('collage-mode', isCollage);
          document.body.classList.toggle('dissected-mode', isDissected);
          document.body.classList.toggle('fatberg-mode', isFatberg);

          document.querySelectorAll('.ctrl-pulse').forEach(el => el.classList.remove('ctrl-pulse'));

          // Fade overlays (data points/images) away in both FATBERG and COLLAGE
          const hideOverlays = isFatberg || isCollage;
          fadeOverlays(!hideOverlays);

          const visuals = MODE_VISUALS[name];
          if (visuals) _triggerMode?.(visuals);

          if (isFatberg) { goFatbergView(); setZoom(homeZoom); for (const el of _dissEls) el.style.opacity = '0'; return; }
          // lower the 0.x multiplier to zoom out more in collage
          if (name === 'collage') {
            goTopDown();
            setExplode(explodeGroups.map(() => 0));
            setZoom(homeZoom * 0.4);
            for (const el of _dissEls) el.style.opacity = '0';
            // Ensure only anchored text (sceneLabels) is visible in COLLAGE, with correct opacity
            requestAnimationFrame(() => requestAnimationFrame(() => {
              for (const label of sceneLabels) {
                label.element.style.opacity = MODE_VISUALS.collage.labelOpacity;
                label.element.style.display = '';
              }
              for (const img of sceneImages) {
                img.element.style.opacity = '0';
                img.element.style.display = 'none';
              }
            }));
            return;
          }

          if (name === 'dissected') {
            goDissectedView();
            setExplode(explodeGroups.map((_, i) => (i + 1) * 700));
            setZoom(homeZoom * 0.70);
            if (!_dissLineRafId) _dissLineRafId = requestAnimationFrame(_tickDissLines);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              for (const img of sceneImages) img.element.style.opacity = '0.5';
              for (const el of _dissEls) el.style.opacity = '1';
            }));
          } else {
            if (name === 'recorded' || name === 'remediated') goHome();
            setExplode(explodeGroups.map(() => 0));
            setZoom(homeZoom);
            for (const el of _dissEls) el.style.opacity = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              for (const img of sceneImages) img.element.style.opacity = '1';
            }));
          }
        });
      });
    }

    const tickSprites = setupTooltips(camera, scene, tooltipEl, modelBox, () => isDissected);
    setTickSprites(tickSprites);

    function pulseCtrl(selector) {
      const el = document.querySelector(selector);
      if (!el) return;
      el.classList.remove('ctrl-pulse');
      void el.offsetWidth;
      el.classList.add('ctrl-pulse');
    }

    const _canvas = renderer.domElement;

    _canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (document.body.classList.contains('collage-mode') ||
          document.body.classList.contains('dissected-mode')) {
        pulseCtrl('.ctrl-lmb');
      }
    });

    _canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      if (document.body.classList.contains('dissected-mode')) pulseCtrl('.ctrl-rmb');
    });

    _canvas.addEventListener('dblclick', () => {
      if (document.body.classList.contains('dissected-mode')) pulseCtrl('.ctrl-dblclick');
    });

    hidePreloader();

    // bgColorFrom/bgColorTo: lerp endpoints for the background transition.
    // modeT animates 0→1 from the snapshot color at trigger time to the new target color.
    const bgColorFrom = new THREE.Color(0xeeeeee);
    const bgColorTo   = new THREE.Color(0xeeeeee);
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

      const bgSettled    = Math.abs(modeT  - modeTarget)  <= 0.0001;
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
      const newBgTo  = new THREE.Color(bg);
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
        for (const label of sceneLabels) {
          label.element.style.color   = labelColor;
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

    animateIntro(camera, controls, 1750);
  } catch (err) {
    setProgress(100, "Error – see console");
    console.error("[main] Initialisation failed:", err);
    setTimeout(() => preloaderEl?.classList.add("done"), 2000);
  }
}

{
  const dot   = document.getElementById('subnav-dot');
  const wrap  = document.querySelector('.subnav-wrap');
  const items = document.querySelectorAll('.subnav-item');

  function moveDot(item, animate) {
    const wrapRect = wrap.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const x = itemRect.left - wrapRect.left + itemRect.width / 2 - 2;
    if (!animate) dot.style.transition = 'none';
    dot.style.transform = `translateX(${x}px)`;
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.transition = ''; }));
  }

  const initialActive = document.querySelector('.subnav-item.active');
  if (dot && wrap && initialActive) moveDot(initialActive, false);

  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      moveDot(item, true);
    });
  });

  window.addEventListener('resize', () => {
    const current = document.querySelector('.subnav-item.active');
    if (dot && wrap && current) moveDot(current, false);
  });
}

init();
