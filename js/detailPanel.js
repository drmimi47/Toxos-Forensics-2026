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
let isOpen = false;
let domReady = false;
let closedAt = 0;   // timestamp of last close, used to debounce re-open

function ensureDOM() {
  if (domReady) return;
  panel   = document.getElementById('detail-panel');
  titleEl = document.getElementById('detail-title');
  bodyEl  = document.getElementById('detail-body');
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

export function openDetail(type) {
  ensureDOM();
  if (isOpen) return;
  const content = DATASET_CONTENT[type] || fallbackContent(type);

  titleEl.textContent = content.title;
  bodyEl.textContent  = content.body;

  panel.classList.remove('hidden');
  isOpen = true;

  // Push a history entry so browser Back returns to the map
  history.pushState({ detailPanel: true, type }, '', `#${type.toLowerCase()}`);
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
