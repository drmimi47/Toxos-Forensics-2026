// ── Narrative Timeline ────────────────────────────────────────────────────
// Builds the fixed left-side progress bar for the scroll narrative.
//
// Usage:
//   const { dotWraps, setProgress } = mountNarrativeTimeline(page, SECTIONS);
//   // In scroll handler:
//   dotWraps.forEach((w, i) => w.classList.toggle('active', i === activeIdx));
//   setProgress(activeIdx);

/**
 * @param {HTMLElement} page     - The narrative scroll page element
 * @param {Array}       sections - The SECTIONS array from _startScrollNarrative
 * @returns {{ dotWraps: HTMLElement[], setProgress: (idx: number) => void }}
 */
export function mountNarrativeTimeline(page, sections) {
  const timeline = document.createElement('nav');
  timeline.className = 'narrative-timeline';
  timeline.setAttribute('aria-label', 'Section navigation');

  const track = document.createElement('div');
  track.className = 'timeline-track';

  const fill = document.createElement('div');
  fill.className = 'timeline-fill';
  track.appendChild(fill);

  const sectionEls = Array.from(page.querySelectorAll('.narrative-scroll-section'));

  const dotWraps = sections.map((sec, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'timeline-dot-wrap';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', sec.key);

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

    track.appendChild(wrap);
    return wrap;
  });

  timeline.appendChild(track);
  document.body.appendChild(timeline);

  function setProgress(activeIdx) {
    const pct = sections.length > 1 ? activeIdx / (sections.length - 1) : 0;
    fill.style.height = `${pct * 100}%`;
  }

  return { dotWraps, setProgress };
}
