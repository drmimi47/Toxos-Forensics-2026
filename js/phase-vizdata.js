/**
 * phase-vizdata.js
 *
 * D3 visualization registry for narrative scroll phases.
 *
 * HOW TO ADD A VISUALIZATION
 * ---------------------------
 * 1. Import D3 at the top of this file (or load it globally via index.html):
 *      import * as d3 from 'd3';   // once added to package.json
 *
 * 2. Write a render function with this signature:
 *      function renderMyChart(containerEl) { ... }
 *    The function receives a pre-sized <div> and should render into it.
 *    For async data loading, return a Promise — mountPhaseViz handles it.
 *
 * 3. Register it against any phase key in VIZ_REGISTRY below.
 *    A phase can have multiple charts — add them to its array in order.
 *
 * PHASE KEYS (must match NARRATIVE_CONTENT keys in narrativeText.js)
 * ------------------------------------------------------------------
 *   'phase-0'    title card (text-only, no model)
 *   'phase-1'    blank model (no data points)
 *   'phase-2-a'  CSO sequential reveal
 *   'phase-2-b'  NPDES sequential reveal
 *   'phase-2-c'  RCRA sequential reveal
 *   'phase-3'    all datasets visible, collapsed to ground
 *   'phase-4'    fatberg
 *   'phase-5'    explore model (interstitial)
 *   'phase-6'    what is remediation (text-only)
 *   'phase-7'    toward remediation
 *   'phase-8'    explore model (interstitial)
 *   'phase-9'    towards detoxification (contact)
 *   'phase-10'   credits
 */


// ---------------------------------------------------------------------------
// Registry
// Each key maps to an array of render functions.
// An empty array (or omitted key) means no viz for that phase.
// ---------------------------------------------------------------------------

export const VIZ_REGISTRY = {
  'phase-0':   [],
  'phase-1':   [],
  'phase-2-a': [],
  'phase-2-b': [],
  'phase-2-c': [],
  'phase-3':   [],
  'phase-3-5': [],
  'phase-3-75': [],
  'phase-4':   [],
  'phase-6':   [],
  'phase-7':   [],
};


// ---------------------------------------------------------------------------
// Mount
// Called by the section builder in main.js for each narrative section.
// Appends a .narrative-viz-container to cardEl and calls each registered
// render function in order.  Returns true if anything was mounted.
// ---------------------------------------------------------------------------

export async function mountPhaseViz(key, cardEl) {
  const renders = VIZ_REGISTRY[key];
  if (!renders || renders.length === 0) return false;

  for (const render of renders) {
    const wrapper = document.createElement('div');
    wrapper.className = 'narrative-viz-container';
    cardEl.appendChild(wrapper);

    try {
      const result = render(wrapper);
      // Support both sync and async render functions.
      if (result instanceof Promise) await result;
    } catch (err) {
      console.error(`[phase-vizdata] Error rendering viz for "${key}":`, err);
      wrapper.remove();
    }
  }

  return true;
}


// ---------------------------------------------------------------------------
// Example render function (remove or replace when adding real charts)
// ---------------------------------------------------------------------------

// function renderExampleBar(containerEl) {
//   const data = [42, 78, 31, 95, 60];
//   // const svg = d3.select(containerEl).append('svg') ...
// }

// To register it:
// VIZ_REGISTRY['phase-0'] = [renderExampleBar];
