/**
 * labels.js – CSS2D labels that always face the camera.
 *
 * Uses Three.js CSS2DObject so each label tracks a 3D world position
 * but is rendered as a DOM element (resolution-independent, always readable).
 */
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { openDetail } from './detailPanel.js';

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

/**
 * Create a camera-facing image anchored in world space using CSS2DObject.
 * @param {THREE.Scene} scene
 * @param {string} id    Identifier (e.g. 'IMG_1')
 * @param {string} src   Image URL
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 */
export function addImage(scene, id, src, x, y, z, opts = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-image' + (opts.className ? ` ${opts.className}` : '');

  const img = document.createElement('img');
  img.src = src;
  img.alt = id;
  img.draggable = false;
  wrapper.appendChild(img);

  // Open the detail overlay on click/tap — show a frosted overlay with the image
  img.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Use a simple title and pass the image src to the detail panel
    openDetail({ title: 'Lorem Ipsum', body: '', image: src });
  });

  // Optional caption
  if (opts.caption) {
    const cap = document.createElement('div');
    cap.className = 'scene-image-caption';
    cap.textContent = opts.caption;
    wrapper.appendChild(cap);
  }

  const obj = new CSS2DObject(wrapper);
  obj.position.set(x, y, z);
  obj.name = `image:${id}`;
  scene.add(obj);
  return obj;
}

/**
 * Add the four IMG anchors near the model origin so you can see and fine-tune them.
 * Positions are scene-space; edit coordinates here or move in devtools.
 */
export function addAllImages(scene) {
  // Near the Rhino origin — small offsets so they're visible above terrain
  addImage(scene, 'IMG_1', './assets/images/IMG_1.jpg', 450, 100, -725);
  addImage(scene, 'IMG_2', './assets/images/IMG_2.jpg', 700, 100, -100);
  addImage(scene, 'IMG_3', './assets/images/IMG_3.jpg', -325, 100, -1550);
  addImage(scene, 'IMG_4', './assets/images/IMG_4.jpg', -75, 100, -1525);
}
