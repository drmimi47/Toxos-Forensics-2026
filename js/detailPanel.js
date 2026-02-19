/**
 * detailPanel.js – Dataset detail overlay.
 *
 * When a user clicks a data-point sprite, this module slides in a full-screen
 * panel showing the dataset title and placeholder body text.
 * Pressing the browser Back button or the on-screen "← Back" button returns
 * to the 3D map view.
 *
 * Future-proof: content is keyed by the dataset `type` string (e.g. "CSO",
 * "NPDES"). Add entries to DATASET_CONTENT to extend.
 */

/* ---------- Per-dataset content (extend this object for new datasets) ---------- */
const DATASET_CONTENT = {
  CSO: {
    title: 'Combined Sewer Overflow (CSO)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vehicula
           libero at urna pretium, nec ullamcorper justo viverra. Fusce tincidunt
           eros id sapien laoreet, eget mollis nulla facilisis. Vestibulum ante
           ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae;
           Donec euismod quam vel leo cursus, at efficitur risus bibendum.
           Pellentesque habitant morbi tristique senectus et netus et malesuada
           fames ac turpis egestas. Curabitur at feugiat tortor. Integer
           condimentum, nulla at fermentum volutpat, sapien lacus interdum dolor,
           vel ultricies erat enim nec sem.`
  },
  NPDES: {
    title: 'National Pollutant Discharge Elimination System (NPDES)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi
           scelerisque lectus nec magna tempor, a sodales eros dictum. Praesent
           ullamcorper augue in ante vestibulum, quis tincidunt nisl pharetra.
           Aenean dapibus felis at dui fermentum, vel elementum magna venenatis.
           Nullam vehicula dui eu libero euismod, vel commodo nisi bibendum.
           Aliquam erat volutpat. Suspendisse potenti. Nam malesuada risus nec
           facilisis hendrerit. Vivamus in urna a turpis vestibulum iaculis.`
  },
  RCRA: {
    title: 'Regulated Hazardous Waste Management Facilities (RCRA)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam facilisis, urna at cursus dictum, nisi erat dictum erat, nec dictum urna erat nec erat.`,
    image: './assets/images/rcra.jpg'
  },
  'Regulated Hazardous Waste Management Facilities (RCRA)': {
    title: 'Regulated Hazardous Waste Management Facilities (RCRA)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam facilisis, urna at cursus dictum, nisi erat dictum erat, nec dictum urna erat nec erat.`,
    image: './assets/images/rcra.jpg'
  },
  RCRA_2263_CLIPPED: {
    title: 'Regulated Hazardous Waste Management Facilities (RCRA)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam facilisis, urna at cursus dictum, nisi erat dictum erat, nec dictum urna erat nec erat.`,
    image: './assets/images/rcra.jpg'
  },
  rcra_2263_clipped: {
    title: 'Regulated Hazardous Waste Management Facilities (RCRA)',
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam facilisis, urna at cursus dictum, nisi erat dictum urna erat nec erat.`,
    image: './assets/images/rcra.jpg'
  }
};

/** Fallback for datasets not yet in the lookup. */
function fallbackContent(type) {
  return {
    title: type,
    body: `Details for the ${type} dataset will appear here.`
  };
}

/* ---------- DOM refs ---------- */
let panel, titleEl, bodyEl, backBtn;
let mediaEl;
let isOpen = false;
let domReady = false;
let closedAt = 0;   // timestamp of last close, used to debounce re-open

function ensureDOM() {
  if (domReady) return;
  panel   = document.getElementById('detail-panel');
  titleEl = document.getElementById('detail-title');
  bodyEl  = document.getElementById('detail-body');
  // optional media element (created dynamically when needed)
  mediaEl = document.getElementById('detail-image') || null;
  backBtn = document.getElementById('detail-back');
  domReady = true;
}

/* Wire back button + clicking anywhere on the panel to close */
document.addEventListener('DOMContentLoaded', () => {
  ensureDOM();

  backBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeDetail();
    // Replace the history entry instead of going back, to avoid popstate re-opening
    history.replaceState(null, '', window.location.pathname);
  });

  panel?.addEventListener('pointerdown', (e) => {
    if (e.target === panel) {
      e.stopPropagation();
      closeDetail();
      history.replaceState(null, '', window.location.pathname);
    }
  });
});

/* ---------- Open / close ---------- */

export function openDetail(payload) {
  ensureDOM();
  if (isOpen) return;

  // Support both string keys (dataset types) and direct content objects
  let content;
  if (typeof payload === 'string') {
    content = DATASET_CONTENT[payload] || fallbackContent(payload);
  } else {
    // Expect an object like { title, body, image }
    content = payload || {};
  }

  titleEl.textContent = content.title || '';
  bodyEl.textContent  = content.body || '';

  // Remove previous media if present
  const prev = document.getElementById('detail-image');
  if (prev) prev.remove();

  // If an image is supplied, create and insert it after the title
  if (content.image) {
    const img = document.createElement('img');
    img.id = 'detail-image';
    img.className = 'detail-panel-image';
    img.src = content.image;
    img.alt = content.title || '';
    img.loading = 'eager';
    titleEl.insertAdjacentElement('afterend', img);
  }

  panel.classList.remove('hidden');
  isOpen = true;

  // Push a history entry so browser Back returns to the map
  // If content came from a named type, preserve that in history, otherwise use 'image'
  const histType = (typeof payload === 'string') ? payload : 'image';
  history.pushState({ detailPanel: true, type: histType }, '', `#${String(histType).toLowerCase()}`);
}

export function closeDetail() {
  ensureDOM();
  if (!isOpen) return;
  panel.classList.add('hidden');
  isOpen = false;
  closedAt = performance.now();
}

export function isDetailOpen() {
  return isOpen;
}

/** Returns true if the panel was closed very recently (within ms). */
export function justClosed(ms = 300) {
  return (performance.now() - closedAt) < ms;
}

/* ---------- Browser back / forward ---------- */
window.addEventListener('popstate', (e) => {
  if (isOpen && !e.state?.detailPanel) {
    closeDetail();
  } else if (e.state?.detailPanel) {
    openDetail(e.state.type);
  }
});
