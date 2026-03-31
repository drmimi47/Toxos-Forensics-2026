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
  }
};

function fallbackContent(type) {
  return { title: type, body: `Details for the ${type} dataset will appear here.` };
}

function normalizeKey(type) {
  const t = String(type).toLowerCase();
  if (t.includes('rcra'))  return 'RCRA';
  if (t.includes('cso'))   return 'CSO';
  if (t.includes('npdes')) return 'NPDES';
  return type;
}

function typeColor(type) {
  const t = String(type).toLowerCase();
  if (t.includes('cso'))   return 'var(--cso-color)';
  if (t.includes('npdes')) return 'var(--npdes-color)';
  if (t.includes('rcra'))  return 'var(--rcra-color)';
  return 'var(--accent)';
}

const SVG_PREV  = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L6 8l4 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_NEXT  = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l4 5-4 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_CLOSE = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const panelMap   = new Map();
let openCount    = 0;
let lastClosedAt = 0;
let lastActiveKey = null;
let openOrderCounter = 0;


function _randomPanelPosition() {
  const panelW  = 540;
  const panelH  = 480; // approximate panel height
  const margin  = 24;
  const headerH = 80;  // clear the top header
  const maxLeft = Math.max(margin, window.innerWidth  - panelW - margin);
  const maxTop  = Math.max(headerH, window.innerHeight - panelH - margin);
  return {
    left: Math.round(margin  + Math.random() * (maxLeft - margin)),
    top:  Math.round(headerH + Math.random() * (maxTop  - headerH)),
  };
}

class PanelInstance {
  constructor(key) {
    this.key           = key;
    this.displayOrder  = -1;
    this.isOpen        = false;
    this.dragTransform = '';
    this.currentGroup  = [];
    this.currentIndex  = 0;

    this.el = document.createElement('div');
    this.el.className = 'detail-panel hidden';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.top    = '0';
    this.el.style.bottom = 'auto';
    this.el.style.zIndex = '9000';
    this.el.innerHTML = `
      <div class="dp-tab">
        <span class="dp-counter"></span>
      </div>
      <div class="dp-body">
        <div class="dp-header dp-draggable" style="cursor:grab">
          <div class="dp-nav">
            <button class="dp-nav-btn dp-prev" aria-label="Previous point">${SVG_PREV}</button>
            <button class="dp-nav-btn dp-next" aria-label="Next point">${SVG_NEXT}</button>
          </div>
          <button class="dp-close-btn" aria-label="Close panel">${SVG_CLOSE}</button>
        </div>
        <div class="dp-scroll">
          <div class="dp-type-badge"></div>
          <h2 class="detail-title"></h2>
          <div class="detail-meta"></div>
          <div class="dp-image-wrap"></div>
          <p class="detail-body"></p>
        </div>
      </div>`;
    document.body.appendChild(this.el);

    this.dragHeader = this.el.querySelector('.dp-draggable');
    this.tabEl      = this.el.querySelector('.dp-tab');
    this.counterEl  = this.el.querySelector('.dp-counter');
    this.prevBtn    = this.el.querySelector('.dp-prev');
    this.nextBtn    = this.el.querySelector('.dp-next');
    this.closeBtn   = this.el.querySelector('.dp-close-btn');
    this.scrollEl   = this.el.querySelector('.dp-scroll');
    this.badgeEl    = this.el.querySelector('.dp-type-badge');
    this.titleEl    = this.el.querySelector('.detail-title');
    this.metaEl     = this.el.querySelector('.detail-meta');
    this.imageWrap  = this.el.querySelector('.dp-image-wrap');
    this.bodyEl     = this.el.querySelector('.detail-body');

    this._wireEvents();
  }

  _wireEvents() {
    // Bring this panel to front whenever the user clicks anywhere inside it.
    this.el.addEventListener('pointerdown', () => this._bringToFront());

    this.closeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.close();
      history.replaceState(null, '', window.location.pathname);
    });

    this.prevBtn.addEventListener('click', () => {
      if (!this.currentGroup.length) return;
      this.currentIndex = (this.currentIndex - 1 + this.currentGroup.length) % this.currentGroup.length;
      this.renderPoint(true);
    });

    this.nextBtn.addEventListener('click', () => {
      if (!this.currentGroup.length) return;
      this.currentIndex = (this.currentIndex + 1) % this.currentGroup.length;
      this.renderPoint(true);
    });

    this._enableDrag();
  }

  _enableDrag() {
    let dragging = false;
    let ds = { x: 0, y: 0 };
    let ps = { x: 0, y: 0 };

    const onDragStart = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      this.dragHeader.style.cursor = 'grabbing';
      if (this.tabEl) this.tabEl.style.cursor = 'grabbing';
      ds.x = e.clientX;
      ds.y = e.clientY;
      const m = this.dragTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      ps.x = m ? parseFloat(m[1]) : 0;
      ps.y = m ? parseFloat(m[2]) : 0;
      document.body.style.userSelect = 'none';
      this._bringToFront();
    };

    this.dragHeader.addEventListener('pointerdown', onDragStart);
    if (this.tabEl) this.tabEl.addEventListener('pointerdown', onDragStart);

    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - ds.x;
      const dy = e.clientY - ds.y;
      this.el.style.transition = 'none';
      this.dragTransform = `translate(${ps.x + dx}px, ${ps.y + dy}px)`;
      this.el.style.transform = this.dragTransform;
    });

    window.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      this.dragHeader.style.cursor = 'grab';
      if (this.tabEl) this.tabEl.style.cursor = '';
      document.body.style.userSelect = '';
      this.el.style.transition = '';
    });
  }

  _bringToFront() {
    let maxZ = 8999;
    panelMap.forEach(p => {
      const z = parseInt(p.el.style.zIndex || '9000', 10);
      if (z > maxZ) maxZ = z;
    });
    this.el.style.zIndex = String(maxZ + 1);
  }

  open(group, index) {
    this.currentGroup = group;
    this.currentIndex = index;

    if (this.isOpen) {
      this.renderPoint(true);
      this._bringToFront();
      return;
    }

    this.renderPoint(false);

    this.displayOrder = openOrderCounter++;
    const pos = _randomPanelPosition();
    this.el.style.left  = `${pos.left}px`;
    this.el.style.right = 'auto';
    this.el.style.top   = `${pos.top}px`;

    this.el.style.transform = this.dragTransform || '';
    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.el.classList.add('visible');
    }));

    this.isOpen = true;
    openCount++;

    if (openCount === 1) {
      document.body.classList.add('panel-open');
      window.dispatchEvent(new CustomEvent('detail-open'));
    }

    this._bringToFront();
  }

  close() {
    if (!this.isOpen) return;

    this.el.classList.remove('visible');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.transform = '';
    this.dragTransform = '';
    this.isOpen = false;
    this.displayOrder = -1;
    openCount = Math.max(0, openCount - 1);
    lastClosedAt = performance.now();

    window.dispatchEvent(new CustomEvent('detail-close', { detail: { panelCount: openCount } }));

    if (openCount === 0) {
      openOrderCounter = 0;
      document.body.classList.remove('panel-open');
    } else {
      panelMap.forEach(p => {
        if (p !== this && p.isOpen) {
          const s = p.currentGroup[p.currentIndex];
          if (s?.isSprite || s?.isMesh) {
            window.dispatchEvent(new CustomEvent('detail-navigate', { detail: { sprite: s } }));
          }
        }
      });
    }

    setTimeout(() => { if (!this.isOpen) this.el.classList.add('hidden'); }, 580);
  }

  fillContent(content, userData, type) {
    if (this.titleEl) this.titleEl.textContent = content.title || '';
    if (this.bodyEl)  this.bodyEl.textContent  = content.body  || '';

    if (this.badgeEl) {
      const color = typeColor(type);
      this.badgeEl.innerHTML = `<span class="dp-type-dot" style="background:${color}"></span>${type}`;
    }

    if (this.metaEl) {
      const d = userData || {};
      const rows = [];
      if (d.handle)     rows.push(`<span class="dp-meta-label">Handle</span><span class="dp-meta-value">${d.handle}</span>`);
      if (d.text)       rows.push(`<span class="dp-meta-label">ID</span><span class="dp-meta-value">${d.text}</span>`);
      if (d.coordX != null) rows.push(`<span class="dp-meta-label">Easting</span><span class="dp-meta-value">${Number(d.coordX).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`);
      if (d.coordY != null) rows.push(`<span class="dp-meta-label">Northing</span><span class="dp-meta-value">${Number(d.coordY).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`);
      this.metaEl.innerHTML = rows.length ? `<div class="dp-meta-grid">${rows.join('')}</div>` : '';
    }

    if (this.imageWrap) {
      this.imageWrap.innerHTML = '';
      if (content.image) {
        const img = document.createElement('img');
        img.className = 'detail-panel-image';
        img.src = content.image;
        img.alt = content.title || '';
        img.loading = 'eager';
        this.imageWrap.appendChild(img);
      }
    }
  }

  renderPoint(animate) {
    const sprite  = this.currentGroup[this.currentIndex];
    const d       = sprite?.userData || {};
    const type    = d.type || this.key;
    const content = d._direct || DATASET_CONTENT[normalizeKey(type)] || fallbackContent(type);

    if (this.counterEl) {
      this.counterEl.textContent = this.currentGroup.length > 1
        ? `${this.currentIndex + 1} / ${this.currentGroup.length}`
        : '';
    }

    if (this.prevBtn) this.prevBtn.disabled = this.currentGroup.length <= 1;
    if (this.nextBtn) this.nextBtn.disabled = this.currentGroup.length <= 1;

    const s = this.currentGroup[this.currentIndex];
    if (s?.isSprite || s?.isMesh) {
      window.dispatchEvent(new CustomEvent('detail-navigate', { detail: { sprite: s } }));
    }

    if (animate && this.scrollEl) {
      this.scrollEl.style.transition = 'opacity 0.1s ease, transform 0.12s ease, filter 0.1s ease';
      this.scrollEl.style.opacity    = '0';
      this.scrollEl.style.transform  = 'translateY(7px)';
      this.scrollEl.style.filter     = 'blur(4px)';
      setTimeout(() => {
        this.fillContent(content, d, type);
        if (this.scrollEl) this.scrollEl.scrollTop = 0;
        this.scrollEl.style.transition = 'opacity 0.38s cubic-bezier(0.2,0.8,0.3,1), transform 0.38s cubic-bezier(0.2,0.8,0.3,1), filter 0.32s ease';
        this.scrollEl.style.opacity    = '1';
        this.scrollEl.style.transform  = 'translateY(0)';
        this.scrollEl.style.filter     = 'blur(0px)';
      }, 115);
    } else {
      this.fillContent(content, d, type);
      if (this.scrollEl) {
        this.scrollEl.style.transition = '';
        this.scrollEl.style.opacity    = '1';
        this.scrollEl.style.transform  = 'translateY(0)';
        this.scrollEl.style.filter     = 'blur(0px)';
      }
    }
  }
}

function getOrCreate(key) {
  if (!panelMap.has(key)) panelMap.set(key, new PanelInstance(key));
  return panelMap.get(key);
}

window.addEventListener('keydown', (e) => {
  if (openCount === 0) return;

  if (e.key === 'Escape') {
    panelMap.forEach(p => { if (p.isOpen) p.close(); });
    history.replaceState(null, '', window.location.pathname);
  } else {
    const p = lastActiveKey ? panelMap.get(lastActiveKey) : null;
    if (!p?.isOpen) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (p.currentGroup.length > 1) {
        p.currentIndex = (p.currentIndex - 1 + p.currentGroup.length) % p.currentGroup.length;
        p.renderPoint(true);
      }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (p.currentGroup.length > 1) {
        p.currentIndex = (p.currentIndex + 1) % p.currentGroup.length;
        p.renderPoint(true);
      }
    }
  }
});

export function openDetail(payload) {
  let type, group, index;

  if (typeof payload === 'string') {
    type  = payload;
    group = [{ userData: { type } }];
    index = 0;
  } else if (payload.title || payload.image) {
    type  = payload.title || 'Image';
    group = [{ userData: { type, _direct: { title: payload.title, body: payload.body, image: payload.image } } }];
    index = 0;
  } else {
    type  = payload.type;
    group = payload.group || [payload.sprite || { userData: { type } }];
    index = payload.index ?? 0;
  }

  const key   = normalizeKey(type);
  const panel = getOrCreate(key);
  lastActiveKey = key;
  panel.open(group, index);

  const histType = type || 'detail';
  history.pushState({ detailPanel: true, type: histType }, '', `#${String(histType).toLowerCase()}`);
}

export function closeDetail() {
  if (lastActiveKey) {
    const p = panelMap.get(lastActiveKey);
    if (p?.isOpen) { p.close(); return; }
  }
  for (const p of panelMap.values()) {
    if (p.isOpen) { p.close(); return; }
  }
}

export function closeAllDetails() {
  panelMap.forEach(p => { if (p.isOpen) p.close(); });
  history.replaceState(null, '', window.location.pathname);
}

export function isDetailOpen()  { return openCount > 0; }

export function getDetailType() {
  if (!lastActiveKey) return null;
  const p = panelMap.get(lastActiveKey);
  if (!p?.isOpen) return null;
  return p.currentGroup[p.currentIndex]?.userData?.type ?? null;
}

export function justClosed(ms = 300) {
  return (performance.now() - lastClosedAt) < ms;
}

window.closeDetail = closeDetail;

window.addEventListener('popstate', (e) => {
  if (openCount > 0 && !e.state?.detailPanel) {
    panelMap.forEach(p => { if (p.isOpen) p.close(); });
  } else if (openCount === 0 && e.state?.detailPanel) {
    openDetail(e.state.type);
  }
});
