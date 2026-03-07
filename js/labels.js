import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { openDetail, isDetailOpen } from './detailPanel.js';

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

export function addImage(scene, id, src, x, y, z, opts = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-image' + (opts.className ? ` ${opts.className}` : '');

  const img = document.createElement('img');
  img.alt = id;
  img.draggable = false;
  img.classList.add('img-loading');
  img.onload  = () => img.classList.remove('img-loading');
  img.onerror = () => img.classList.remove('img-loading');
  img.src = src;
  wrapper.appendChild(img);

  img.addEventListener('pointerdown', (e) => {
    if (isDetailOpen()) return;
    e.stopPropagation();
    e.preventDefault();
    openDetail({ title: 'Lorem Ipsum', body: '', image: src });
  });

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

export function addAllImages(scene) {
  return [
    addImage(scene, 'IMG_1', './assets/images/IMG_1.jpg', 450, 100, -725),
    addImage(scene, 'IMG_2', './assets/images/IMG_2.jpg', 700, 100, -100),
    addImage(scene, 'IMG_3', './assets/images/IMG_3.jpg', -325, 100, -1550),
    addImage(scene, 'IMG_4', './assets/images/IMG_4.jpg', -75, 100, -1525),
  ];
}
