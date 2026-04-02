

export const NARRATIVE_CONTENT = {

  'phase-0': {
    heading: 'Uncovering toxicity in New Town Creek',
    body: [],
  },

  'phase-1': {
    heading: 'We are TOXOS',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vehicula
       libero at urna pretium, nec ullamcorper justo viverra. Fusce tincidunt
       eros id sapien laoreet, eget mollis nulla facilisis.`,
      `Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere
       cubilia curae. Donec euismod quam vel leo cursus, at efficitur risus
       bibendum. Pellentesque habitant morbi tristique senectus.`,
    ],
  },

  'phase-3': {
    heading: "Title Placeholder",
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vehicula
       libero at urna pretium, nec ullamcorper justo viverra. Fusce tincidunt
       eros id sapien laoreet, eget mollis nulla facilisis.`,
      `Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere
       cubilia curae. Donec euismod quam vel leo cursus, at efficitur risus
       bibendum. Pellentesque habitant morbi tristique senectus.`,
    ],
  },

  'phase-2-a': {
    heading: 'CSO: Combined Sewer Overflows',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi scelerisque
       lectus nec magna tempor, a sodales eros dictum. Praesent ullamcorper augue
       in ante vestibulum, quis tincidunt nisl pharetra.`,
      `Aenean dapibus felis at dui fermentum, vel elementum magna venenatis.
       Nullam vehicula dui eu libero euismod, vel commodo nisi bibendum.
       Aliquam erat volutpat. Suspendisse potenti.`,
    ],
  },

  'phase-2-b': {
    heading: 'NPDES: National Pollutant Discharge Elimination System',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam facilisis
       urna at cursus dictum. Nisi erat dictum erat, nec dictum urna erat nec
       erat. Curabitur at feugiat tortor.`,
      `Integer condimentum nulla at fermentum volutpat. Sapien lacus interdum
       dolor, vel ultricies erat enim nec sem. Nam malesuada risus nec facilisis
       hendrerit. Vivamus in urna a turpis vestibulum iaculis.`,
    ],
  },

  'phase-2-c': {
    heading: 'RCRA: Regulated Hazardous Waste Facilities',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ut perspiciatis
       unde omnis iste natus error sit voluptatem accusantium doloremque laudantium,
       totam rem aperiam eaque ipsa quae ab illo inventore veritatis.`,
      `Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit,
       sed quia consequuntur magni dolores eos qui ratione sequi nesciunt.`,
    ],
  },

  'phase-4': {
    heading: 'Visualizing Fatbergs',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. At vero eos et
       accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
       voluptatum deleniti atque corrupti quos dolores.`,
      `Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil
       impedit quo minus id quod maxime placeat facere possimus, omnis voluptas
       assumenda est, omnis dolor repellendus.`,
    ],
  },

  'phase-5': {
    heading: '<span class="explore-model-trigger" role="button" tabindex="0">Explore Model</span>',
    body: [],
  },

  'phase-6': {
    heading: 'What does the future hold?',
    body: [],
  },

  'phase-7': {
    heading: 'Placeholder Title',
    body: [
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus in urna
       a turpis vestibulum iaculis. Temporibus autem quibusdam et aut officiis
       debitis aut rerum necessitatibus saepe eveniet.`,
      `Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam
       nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas
       nulla pariatur.`,
    ],
  },

  'phase-8': {
    heading: '<span class="explore-model-trigger" role="button" tabindex="0">Explore Model</span>',
    body: [],
  },

};

let _panel       = null;
let _heading     = null;
let _body        = null;
let _currentKey  = null;

export function initNarrativePanel() {
  _panel = document.createElement('div');
  _panel.id        = 'narrative-panel';
  _panel.className = 'narrative-panel';
  _panel.setAttribute('aria-live', 'polite');

  _heading = document.createElement('h2');
  _heading.className = 'narrative-heading';

  _body = document.createElement('div');
  _body.className = 'narrative-body';

  _panel.appendChild(_heading);
  _panel.appendChild(_body);
  document.body.appendChild(_panel);
}

export function setNarrativeContent(key) {
  if (!_panel || key === _currentKey) return;
  _currentKey = key;

  const page = key ? NARRATIVE_CONTENT[key] : null;
  if (!page) return;

  // Fade out → swap content → fade in
  _panel.classList.add('narrative-panel--transitioning');
  setTimeout(() => {
    _heading.innerHTML = page.heading;
    _body.innerHTML = page.body.map(p => `<p>${p}</p>`).join('');
    _panel.classList.remove('narrative-panel--transitioning');
  }, 200);
}
