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
import * as THREE from 'three';
import { createViewer }   from './viewer.js';
import { loadModel } from './gltfLoader.js';
import { loadAllCSV }     from './csvLoader.js';
import { setupTooltips, frameBoundingBox, animateIntro } from './utils.js';
import { addAllLabels, addAllImages }   from './labels.js';


/* ---------- Preloader helpers ---------- */
const preloaderEl  = document.querySelector('.preloader');
const preBarEl     = document.getElementById('preloader-bar');
const preTextEl    = document.getElementById('preloader-text');

function setProgress(pct, label) {
  if (preBarEl)  preBarEl.style.width = `${Math.min(pct, 100)}%`;
  if (preTextEl) preTextEl.textContent = label;
}

function hidePreloader() {
  setProgress(100, 'Complete');
  // Small delay so user can see 100%
  setTimeout(() => {
    preloaderEl?.classList.add('done');
  }, 400);
}

/* ---------- Boot ---------- */
async function init() {
  setProgress(5, 'Setting up scene');

  // 1. Spin up the 3D viewer
  const { scene, camera, renderer, controls, setTickSprites } = createViewer();
  const tooltipEl = document.getElementById('tooltip');

  try {
    setProgress(10, 'Loading 3D model');

    // 2. Load the GLB model
    const { model, setModeProgress } = await loadModel(scene, (pct) => {
      setProgress(10 + pct * 0.7, `Loading model ${Math.round(pct)}%`);
    }, renderer);

    setProgress(80, 'Framing view');

    // 3. Auto-frame the camera around the loaded model
    frameBoundingBox(model, camera, controls);

    setProgress(85, 'Loading data overlays');

    // 4. Overlay CSV data points
    const csvResults = await loadAllCSV(scene);

    // 4b. Add CSS2D point-of-interest labels and anchored images
    addAllLabels(scene);
    addAllImages(scene);

    // Update legend counts
    if (csvResults.cso) {
      const el = document.getElementById('count-cso');
      if (el) el.textContent = csvResults.cso.group.children.length;
    }
    if (csvResults.npdes) {
      const el = document.getElementById('count-npdes');
      if (el) el.textContent = csvResults.npdes.group.children.length;
    }
    if (csvResults.rcra_2263_clipped) {
      const el = document.getElementById('count-rcra');
      if (el) el.textContent = csvResults.rcra_2263_clipped.group.children.length;
    }


    setProgress(95, 'Preparing interactions…');

    // --- Legend click interaction to toggle dataset visibility ---
    // Map legend dot class to csvResults key
    const legendMap = {
      cso: 'cso',
      npdes: 'npdes',
      rcra: 'rcra_2263_clipped'
    };
    Object.entries(legendMap).forEach(([dotClass, csvKey]) => {
      const dot = document.querySelector('.legend-dot.' + dotClass);
      if (!dot) return;
      dot.style.cursor = 'pointer';
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('title', 'Toggle visibility');
      let visible = true;
      dot.addEventListener('click', () => {
        visible = !visible;
        const group = csvResults[csvKey]?.group;
        if (group) group.visible = visible;
        dot.style.opacity = visible ? '1' : '0.35';
      });
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          dot.click();
        }
      });
    });

    // 5. Tooltips via raycasting
    const tickSprites = setupTooltips(camera, scene, tooltipEl);
    setTickSprites(tickSprites);

    // 6. Done!
    hidePreloader();

    // Dark mode — smooth crossfade via RAF lerp
    const BG_LIGHT = new THREE.Color(0xeeeeee);
    const BG_DARK  = new THREE.Color(0x111111);
    let modeT      = 0;   // current interpolation value (0=light, 1=dark)
    let modeTarget = 0;   // where we're animating towards
    let modeRafId  = null;
    let modePrevTime = performance.now();

    function tickModeFrame(now) {
      const dt = (now - modePrevTime) / 200; // 500ms total duration
      modePrevTime = now;

      if (modeTarget > modeT) modeT = Math.min(modeT + dt, modeTarget);
      else                     modeT = Math.max(modeT - dt, modeTarget);

      // Toggle CSS class at midpoint so @property transitions meet symmetrically
      if (modeTarget === 1 && modeT >= 0.5) document.body.classList.add('dark');
      if (modeTarget === 0 && modeT <= 0.5) document.body.classList.remove('dark');

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

    document.getElementById('dark-mode-btn')?.addEventListener('click', () => {
      if (modeRafId) return; // ignore while animating
      modeTarget     = modeT < 0.5 ? 1 : 0;
      modePrevTime   = performance.now();
      modeRafId      = requestAnimationFrame(tickModeFrame);
    });

    // 7. Gentle camera intro animation (pivot down into isometric view)
    animateIntro(camera, controls, 1750);


  } catch (err) {
    setProgress(100, 'Error – see console');
    console.error('[main] Initialisation failed:', err);
    setTimeout(() => preloaderEl?.classList.add('done'), 2000);
  }
}

init();


