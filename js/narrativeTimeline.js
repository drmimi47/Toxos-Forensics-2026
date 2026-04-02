// ── Narrative Timeline ────────────────────────────────────────────────────
// Builds the fixed left-side dot navigation for the scroll narrative.
//
// Usage:
//   const { dotWraps } = mountNarrativeTimeline(page, SECTIONS);
//   // In scroll handler:
//   dotWraps.forEach((w, i) => w.classList.toggle('active', i === activeIdx));

const PHASE_LABELS = [
  'TOXICITY', 'CONTEXT', 'CSO', 'NPDES', 'RCRA',
  'OVERVIEW', 'FATBERG', 'EXPLORE', 'REMEDIATION', 'RESPONSE', 'EXPLORE',
];

/**
 * @param {HTMLElement} page     - The narrative scroll page element
 * @param {Array}       sections - The SECTIONS array from _startScrollNarrative
 * @returns {{ dotWraps: HTMLElement[] }}
 */
export function mountNarrativeTimeline(page, sections) {
  const timeline = document.createElement('nav');
  timeline.className = 'narrative-timeline';
  timeline.setAttribute('aria-label', 'Section navigation');

  const sectionEls = Array.from(page.querySelectorAll('.narrative-scroll-section'));

  const dotWraps = sections.map((sec, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'timeline-dot-wrap';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', PHASE_LABELS[i] ?? sec.key);

    const dot = document.createElement('div');
    dot.className = 'timeline-dot';

    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = PHASE_LABELS[i] ?? sec.key.toUpperCase();

    wrap.appendChild(dot);
    wrap.appendChild(label);

    const target = sectionEls[i];
    wrap.addEventListener('click', () => {
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
    wrap.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });

    timeline.appendChild(wrap);
    return wrap;
  });

  document.body.appendChild(timeline);

  return { dotWraps };
}
