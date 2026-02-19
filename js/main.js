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
import { createViewer }   from './viewer.js';
import { loadModel } from './gltfLoader.js';
import { loadAllCSV }     from './csvLoader.js';
import { setupTooltips, frameBoundingBox, animateIntro } from './utils.js';
import { addAllLabels }   from './labels.js';


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
  setProgress(5, 'Setting up scene…');

  // 1. Spin up the 3D viewer
  const { scene, camera, renderer, controls, setTickSprites } = createViewer();
  const tooltipEl = document.getElementById('tooltip');

  try {
    setProgress(10, 'Loading 3D model…');

    // 2. Load the GLB model
    const model = await loadModel(scene, (pct) => {
      setProgress(10 + pct * 0.7, `Loading model… ${Math.round(pct)}%`);
    }, renderer);

    setProgress(80, 'Framing view…');

    // 3. Auto-frame the camera around the loaded model
    frameBoundingBox(model, camera, controls);

    setProgress(85, 'Loading data overlays…');

    // 4. Overlay CSV data points
    const csvResults = await loadAllCSV(scene);

    // 4b. Add CSS2D point-of-interest labels
    addAllLabels(scene);

    // Update legend counts
    if (csvResults.cso) {
      const el = document.getElementById('count-cso');
      if (el) el.textContent = csvResults.cso.group.children.length;
    }
    if (csvResults.npdes) {
      const el = document.getElementById('count-npdes');
      if (el) el.textContent = csvResults.npdes.group.children.length;
    }

    setProgress(95, 'Preparing interactions…');

    // 5. Tooltips via raycasting
    const tickSprites = setupTooltips(camera, scene, tooltipEl);
    setTickSprites(tickSprites);

    // 6. Done!
    hidePreloader();

    // 7. Gentle camera intro animation (pivot down into isometric view)
    animateIntro(camera, controls, 1750);


  } catch (err) {
    setProgress(100, 'Error – see console');
    console.error('[main] Initialisation failed:', err);
    setTimeout(() => preloaderEl?.classList.add('done'), 2000);
  }
}

init();


