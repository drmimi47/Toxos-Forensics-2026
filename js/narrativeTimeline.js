// ── Narrative Timeline ────────────────────────────────────────────────────
// Builds the fixed left-side dot navigation for the scroll narrative.
//
// Usage:
//   const { dotWraps } = mountNarrativeTimeline(page, SECTIONS);
//   // In scroll handler:
//   dotWraps.forEach((w, i) => w.classList.toggle('active', i === activeIdx));

const PHASE_LABELS = [
  'TOXICITY',      // phase-0: title
  'CONTEXT',       // phase-1: context
  'CSO',           // phase-2-a: combined sewer overflow
  'NPDES',         // phase-2-b: water discharge permits
  'RCRA',          // phase-2-c: hazardous waste facilities
  'SLR',           // phase-3: sea level rise 100-year floodplain
  'HEALTH',        // phase-3-5: neighborhood health indoor complaints
  'FATBERG',       // phase-4: fatberg
  'EXPLORE',       // phase-5: explore model
  'REMEDIATION',   // phase-6: remediation title
  'DETOXIFICATION',// phase-7: remediation body
  'BOA',           // phase-7-5: brownfield opportunity areas
  'GREENSTREETS',  // phase-7-75: NYC's Greenstreets program
  'EXPLORE',       // phase-8: explore model
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
