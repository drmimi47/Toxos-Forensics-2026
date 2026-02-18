/**
 * labels.js – CSS2D labels that always face the camera.
 *
 * Uses Three.js CSS2DObject so each label tracks a 3D world position
 * but is rendered as a DOM element (resolution-independent, always readable).
 */
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Create a CSS2D label and add it to the scene.
 * @param {THREE.Scene} scene
 * @param {string}  text      – visible label text
 * @param {number}  x         – world X (scene-space, after origin offset)
 * @param {number}  y         – world Y (height / elevation)
 * @param {number}  z         – world Z (scene-space, after origin offset)
 * @param {object}  [opts]    – optional overrides
 * @param {string}  [opts.className]  – extra CSS class
 * @returns {CSS2DObject}
 */
export function addLabel(scene, text, x, y, z, opts = {}) {
  const div = document.createElement('div');
  div.className = 'scene-label' + (opts.className ? ` ${opts.className}` : '');
  // Support line breaks via \n
  div.innerHTML = text.replace(/\n/g, '<br>');

  const label = new CSS2DObject(div);
  label.position.set(x, y, z);
  label.name = `label:${text}`;
  scene.add(label);
  return label;
}

/**
 * Convenience: add all predetermined points-of-interest labels.
 * Positions are in scene-space (world coords minus originOffset).
 * Edit the entries below to reposition or add new labels.
 */
export function addAllLabels(scene) {
  // "East River" – placed near the model centre, elevated above terrain
  // Adjust x, y, z to move it to the desired anchor point.
  addLabel(scene, 'East River', -2000, 150, -200);

  // "GREENPOINT" – central placeholder, adjust x, y, z to reposition
  addLabel(scene, 'GREENPOINT', -800, 150, -1000);

  // "LONG ISLAND CITY" – central placeholder, adjust x, y, z to reposition
  addLabel(scene, 'LONG ISLAND CITY', -750, 150, -2200);

  // "EAST WILLIAMSBURG" – two-line, centre-aligned; adjust x, y, z to reposition
  addLabel(scene, 'EAST WILLIAMSBURG', 1100, 150, 1800);
}
