/**
 * detailPanel.js – Right-side dataset detail card.
 *
 * Opens a card panel on the right side of the screen when a data-point
 * sprite is clicked. The 3D viewer transitions to fill the remaining
 * space. Left/right arrows navigate between all points in the same
 * dataset. Keyboard arrows and Escape also work.
 *
 * openDetail(payload) accepts:
 *   - a string  → dataset type key (legacy / history fallback)
 *   - an object → { type, sprite, group: Sprite[], index }
 */

/* ---------- Per-dataset content (extend for new datasets) ---------- */
const DATASET_CONTENT = {
  CSO: {
    title: 'Combined Sewer Overflow (CSO)',
    image: './assets/images/cso.jpg',
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
    image: './assets/images/npdes.jpg',
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

function fallbackContent(type) {
  return { title: type, body: `Details for the ${type} dataset will appear here.` };
}

// Make closeDetail globally accessible for utils.js
window.closeDetail = closeDetail;

/* ---------- Type → accent color ---------- */
function typeColor(type) {
  const t = String(type).toLowerCase();
  if (t.includes('cso'))   return 'var(--cso-color)';
  if (t.includes('npdes')) return 'var(--npdes-color)';
  if (t.includes('rcra'))  return 'var(--rcra-color)';
  return 'var(--accent)';
}

/* ---------- DOM refs ---------- */
let panel, titleEl, bodyEl, metaEl, imageWrap, badgeEl;
let prevBtn, nextBtn, counterEl, closeBtn;
let scrollEl;
let domReady  = false;
let isOpen    = false;
let closedAt  = 0;

/* ---------- Navigation state ---------- */
let currentGroup = [];   // flat array of sprites in the active dataset
let currentIndex = 0;

function ensureDOM() {
  if (domReady) return;
  panel      = document.getElementById('detail-panel');
  titleEl    = document.getElementById('detail-title');
  bodyEl     = document.getElementById('detail-body');
  metaEl     = document.getElementById('detail-meta');
  imageWrap  = document.getElementById('dp-image-wrap');
  badgeEl    = document.getElementById('dp-type-badge');
  prevBtn    = document.getElementById('detail-prev');
  nextBtn    = document.getElementById('detail-next');
  counterEl  = document.getElementById('dp-counter');
  closeBtn   = document.getElementById('detail-close');
  scrollEl   = panel?.querySelector('.dp-scroll');
  domReady   = true;
}

/* ---------- Content rendering ---------- */

function fillContent(content, userData, type) {
  if (titleEl) titleEl.textContent = content.title || '';
  if (bodyEl)  bodyEl.textContent  = content.body  || '';

  // Type badge with colored dot
  if (badgeEl) {
    const color = typeColor(type);
    badgeEl.innerHTML =
      `<span class="dp-type-dot" style="background:${color}"></span>${type}`;
  }

  // Per-point metadata grid
  if (metaEl) {
    const d = userData || {};
    const rows = [];
    if (d.handle) rows.push(
      `<span class="dp-meta-label">Handle</span>` +
      `<span class="dp-meta-value">${d.handle}</span>`
    );
    if (d.text) rows.push(
      `<span class="dp-meta-label">ID</span>` +
      `<span class="dp-meta-value">${d.text}</span>`
    );
    if (d.coordX != null) rows.push(
      `<span class="dp-meta-label">Easting</span>` +
      `<span class="dp-meta-value">${Number(d.coordX).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`
    );
    if (d.coordY != null) rows.push(
      `<span class="dp-meta-label">Northing</span>` +
      `<span class="dp-meta-value">${Number(d.coordY).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`
    );
    metaEl.innerHTML = rows.length
      ? `<div class="dp-meta-grid">${rows.join('')}</div>`
      : '';
  }

  // Image
  if (imageWrap) {
    imageWrap.innerHTML = '';
    if (content.image) {
      const img = document.createElement('img');
      img.className = 'detail-panel-image';
      img.src       = content.image;
      img.alt       = content.title || '';
      img.loading   = 'eager';
      imageWrap.appendChild(img);
    }
  }
}

/**
 * Render the current datapoint. Pass animate=true when navigating
 * between points to cross-fade the content.
 */
function renderPoint(animate) {
  const sprite  = currentGroup[currentIndex];
  const d       = sprite?.userData || {};
  const type    = d.type || '';
  const content = d._direct || DATASET_CONTENT[type] || fallbackContent(type);

  // Update counter
  if (counterEl) {
    counterEl.textContent = currentGroup.length > 1
      ? `${currentIndex + 1} / ${currentGroup.length}`
      : '';
  }

  // Disable nav arrows when there's only one point
  if (prevBtn) prevBtn.disabled = currentGroup.length <= 1;
  if (nextBtn) nextBtn.disabled = currentGroup.length <= 1;

  // Notify utils.js which sprite is now the selected one so it can apply
  // per-sprite dimming on the 3D scene.
  const currentSprite = currentGroup[currentIndex];
  if (currentSprite?.isSprite || currentSprite?.isMesh) {
    window.dispatchEvent(new CustomEvent('detail-navigate', { detail: { sprite: currentSprite } }));
  }

  if (animate && scrollEl) {
    // Quick fade out
    scrollEl.style.transition = 'opacity 0.1s ease, transform 0.12s ease, filter 0.1s ease';
    scrollEl.style.opacity    = '0';
    scrollEl.style.transform  = 'translateY(7px)';
    scrollEl.style.filter     = 'blur(4px)';

    setTimeout(() => {
      fillContent(content, d, type);
      // Scroll content back to top for new point
      if (scrollEl) scrollEl.scrollTop = 0;
      // Smooth fade in
      scrollEl.style.transition = 'opacity 0.38s cubic-bezier(0.2,0.8,0.3,1), transform 0.38s cubic-bezier(0.2,0.8,0.3,1), filter 0.32s ease';
      scrollEl.style.opacity    = '1';
      scrollEl.style.transform  = 'translateY(0)';
      scrollEl.style.filter     = 'blur(0px)';
    }, 115);
  } else {
    fillContent(content, d, type);
    if (scrollEl) {
      scrollEl.style.transition = '';
      scrollEl.style.opacity    = '1';
      scrollEl.style.transform  = 'translateY(0)';
      scrollEl.style.filter     = 'blur(0px)';
    }
  }
}

/* ---------- Wire UI events after DOM ready ---------- */

document.addEventListener('DOMContentLoaded', () => {
  ensureDOM();

  closeBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeDetail();
    history.replaceState(null, '', window.location.pathname);
  });

  prevBtn?.addEventListener('click', () => {
    if (!currentGroup.length) return;
    currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
    renderPoint(true);
  });

  nextBtn?.addEventListener('click', () => {
    if (!currentGroup.length) return;
    currentIndex = (currentIndex + 1) % currentGroup.length;
    renderPoint(true);
  });
});

/* Click outside panel + outside model → close */
document.addEventListener('pointerdown', (e) => {
  if (!isOpen) return;
  if (e.target.closest('#detail-panel')) return;
  if (e.target.closest('#viewer-container')) return;
  closeDetail();
});

/* Keyboard: ← → navigate, Escape closes */
window.addEventListener('keydown', (e) => {
  if (!isOpen) return;
  if (e.key === 'Escape') {
    closeDetail();
    history.replaceState(null, '', window.location.pathname);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (currentGroup.length > 1) {
      currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
      renderPoint(true);
    }
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (currentGroup.length > 1) {
      currentIndex = (currentIndex + 1) % currentGroup.length;
      renderPoint(true);
    }
  }
});

/* ---------- Open / close ---------- */

export function openDetail(payload) {
  ensureDOM();

  let type, group, index;

  if (typeof payload === 'string') {
    // Legacy / history-restore path
    type  = payload;
    group = [{ userData: { type } }];
    index = 0;
  } else if (payload.title || payload.image) {
    // Direct content from scene-image labels (labels.js) – no type lookup needed
    type  = payload.title || 'Image';
    group = [{ userData: { type, _direct: { title: payload.title, body: payload.body, image: payload.image } } }];
    index = 0;
  } else {
    type  = payload.type;
    group = payload.group  || [payload.sprite || { userData: { type } }];
    index = payload.index  ?? 0;
  }

  currentGroup = group;
  currentIndex = index;

  if (isOpen) {
    // Panel already open – just swap content with a cross-fade
    renderPoint(true);
    return;
  }

  // First render (no animation yet – panel still invisible)
  renderPoint(false);

  // Un-hide from display:none, then double-rAF so the browser paints
  // one frame with opacity:0 before adding .visible (triggers CSS transition)
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('visible');
    });
  });

  document.body.classList.add('panel-open');
  isOpen = true;
  window.dispatchEvent(new CustomEvent('detail-open'));

  const histType = type || 'detail';
  history.pushState(
    { detailPanel: true, type: histType },
    '',
    `#${String(histType).toLowerCase()}`
  );
}

export function closeDetail() {
  ensureDOM();
  if (!isOpen) return;

  panel.classList.remove('visible');
  document.body.classList.remove('panel-open');
  panel.setAttribute('aria-hidden', 'true');
  isOpen   = false;
  closedAt = performance.now();

  // Tell utils.js to clear the selected sprite and restore all opacities
  window.dispatchEvent(new CustomEvent('detail-close'));

  // After the CSS transition finishes, re-apply display:none
  setTimeout(() => {
    if (!isOpen) panel.classList.add('hidden');
  }, 580);
}

export function isDetailOpen() { return isOpen; }

/** Returns the dataset type key of the currently-open card, or null. */
export function getDetailType() {
  if (!isOpen) return null;
  return currentGroup[currentIndex]?.userData?.type ?? null;
}

/** Returns true if the panel was closed very recently (within ms). */
export function justClosed(ms = 300) {
  return (performance.now() - closedAt) < ms;
}

/* ---------- Browser back / forward ---------- */
window.addEventListener('popstate', (e) => {
  if (isOpen && !e.state?.detailPanel) {
    closeDetail();
  } else if (!isOpen && e.state?.detailPanel) {
    openDetail(e.state.type);
  }
});
