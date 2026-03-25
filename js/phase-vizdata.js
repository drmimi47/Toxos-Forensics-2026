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
 *   'phase--1'     intro title card (text-only, no model)
 *   'phase-0'      all datasets visible, exploded
 *   'phase-1-cso'  CSO sequential reveal
 *   'phase-1-npdes' NPDES sequential reveal
 *   'phase-1-rcra'  RCRA sequential reveal
 *   'phase-2'      infrastructure under pressure
 *   'phase-2a'     interstitial (text-only, no model)
 *   'phase-3'      toward remediation
 */


// ---------------------------------------------------------------------------
// Registry
// Each key maps to an array of render functions.
// An empty array (or omitted key) means no viz for that phase.
// ---------------------------------------------------------------------------

export const VIZ_REGISTRY = {
  'phase--1':     [],
  'phase-0':      [],
  'phase-1-cso':  [],
  'phase-1-npdes': [],
  'phase-1-rcra': [],
  'phase-2':      [],
  'phase-2a':     [],
  'phase-3':      [],
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
