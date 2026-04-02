import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ── Text labels (CSS2DObject) ────────────────────────────────────────────────

export function addLabel(scene, text, x, y, z, opts = {}) {
  const div = document.createElement('div');
  div.className = 'scene-label' + (opts.className ? ` ${opts.className}` : '');
  div.innerHTML = text.replace(/\n/g, '<br>');

  const label = new CSS2DObject(div);
  label.position.set(x, y, z);
  label.name = `label:${text}`;
  scene.add(label);
  return label;
}

export function addAllLabels(scene) {
  return [
    addLabel(scene, 'East River', -2000, 150, -200),
    addLabel(scene, 'GREENPOINT', -800, 150, -1000),
    addLabel(scene, 'LONG ISLAND CITY', -750, 150, -2200),
    addLabel(scene, 'EAST WILLIAMSBURG', 1100, 150, 1800),
  ];
}

