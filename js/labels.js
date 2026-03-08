import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { openDetail, isDetailOpen } from './detailPanel.js';

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

const PLANE_HEIGHT = 300; // scene units (metres)

// images anchored to the 3d model with position and rotation manually tweaked to match the model's geometry
const IMAGE_DEFS = [
  { id: 'IMG_1', src: './assets/images/IMG_1.jpg', x:  170, y: 120, z: -1240, rotX: 0, rotY:  1.85, rotZ: 0, scale: .75 }, // factory
  { id: 'IMG_3', src: './assets/images/IMG_3.jpg', x: -335, y: 100, z: -1300, rotX: 0, rotY: -1.45, rotZ: 0, scale: .26 }, // sign
  { id: 'IMG_4', src: './assets/images/IMG_4.jpg', x: -225, y: 100, z: -1575, rotX: 0, rotY: -0.45, rotZ: 0, scale: .55 }, //building with trash
];

function addImageMesh(scene, def) {
  const geometry = new THREE.PlaneGeometry(PLANE_HEIGHT, PLANE_HEIGHT);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(def.x, def.y, def.z);
  mesh.rotation.set(def.rotX, def.rotY, def.rotZ);
  mesh.name = `image:${def.id}`;
  mesh.visible = false; // hidden until texture loads
  // Render after sprites (renderOrder 999, depthTest:false) so images
  // correctly overdraw any data-point dots that sit behind them.
  mesh.renderOrder = 1000;
  mesh.userData = { sceneImage: true, id: def.id, src: def.src };
  scene.add(mesh);

  new THREE.TextureLoader().load(def.src, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    const aspect = texture.image.width / texture.image.height;
    mesh.scale.set(aspect * def.scale, def.scale, def.scale);
    mesh.visible = true;
  });

  return mesh;
}

// ── Temporary placement panel (Shift+I) ──────────────────────────────────────

function setupImagePositionControls(objects) {
  const panel = document.createElement('div');
  panel.id = 'img-pos-controls';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ipc-header">
      <span class="ipc-title">Image Placement</span>
      <span class="ipc-hint">Shift+I</span>
      <button class="ipc-close">✕</button>
    </div>
    <div class="ipc-body">
      ${IMAGE_DEFS.map((def, i) => `
        <div class="ipc-row">
          <div class="ipc-row-name">${def.id}</div>
          <div class="ipc-group-label">Position</div>
          <div class="ipc-axes">
            <label class="ipc-axis"><span class="ipc-axis-label">X</span><input type="number" data-i="${i}" data-prop="px" value="${def.x}" step="25"></label>
            <label class="ipc-axis"><span class="ipc-axis-label">Y</span><input type="number" data-i="${i}" data-prop="py" value="${def.y}" step="25"></label>
            <label class="ipc-axis"><span class="ipc-axis-label">Z</span><input type="number" data-i="${i}" data-prop="pz" value="${def.z}" step="25"></label>
          </div>
          <div class="ipc-group-label">Rotation (rad)</div>
          <div class="ipc-axes">
            <label class="ipc-axis"><span class="ipc-axis-label">rX</span><input type="number" data-i="${i}" data-prop="rx" value="${def.rotX}" step="0.05"></label>
            <label class="ipc-axis"><span class="ipc-axis-label">rY</span><input type="number" data-i="${i}" data-prop="ry" value="${def.rotY}" step="0.05"></label>
            <label class="ipc-axis"><span class="ipc-axis-label">rZ</span><input type="number" data-i="${i}" data-prop="rz" value="${def.rotZ}" step="0.05"></label>
          </div>
          <div class="ipc-group-label">Scale</div>
          <div class="ipc-axes">
            <label class="ipc-axis"><span class="ipc-axis-label">S</span><input type="number" data-i="${i}" data-prop="sc" value="${def.scale}" step="0.05" min="0.01"></label>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="ipc-copy">Copy to console</button>
  `;
  document.body.appendChild(panel);

  const toggle = () => { panel.hidden = !panel.hidden; };
  document.addEventListener('keydown', (e) => { if (e.shiftKey && e.key === 'I') toggle(); });
  panel.querySelector('.ipc-close').addEventListener('click', toggle);

  panel.querySelectorAll('input[type=number]').forEach(input => {
    input.addEventListener('input', () => {
      const obj = objects[+input.dataset.i];
      const val = parseFloat(input.value) || 0;
      switch (input.dataset.prop) {
        case 'px': obj.position.x = val; break;
        case 'py': obj.position.y = val; break;
        case 'pz': obj.position.z = val; break;
        case 'rx': obj.rotation.x = val; break;
        case 'ry': obj.rotation.y = val; break;
        case 'rz': obj.rotation.z = val; break;
        case 'sc': {
          // re-apply aspect * scale
          const aspect = obj.scale.x / obj.scale.y;
          obj.scale.set(aspect * val, val, val);
          break;
        }
      }
    });
  });

  panel.querySelector('.ipc-copy').addEventListener('click', () => {
    const lines = objects.map((obj, i) => {
      const p = obj.position, r = obj.rotation, s = obj.scale.y;
      return `  { id: '${IMAGE_DEFS[i].id}', src: '${IMAGE_DEFS[i].src}', x: ${Math.round(p.x)}, y: ${Math.round(p.y)}, z: ${Math.round(p.z)}, rotX: ${r.x.toFixed(3)}, rotY: ${r.y.toFixed(3)}, rotZ: ${r.z.toFixed(3)}, scale: ${s.toFixed(2)} },`;
    });
    console.log('IMAGE_DEFS:\n[\n' + lines.join('\n') + '\n]');
  });
}

// ── Raycasting: hover cursor + click to open detail ──────────────────────────

function setupImageInteraction(objects, getCamera) {
  const raycaster = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downPos = { x: 0, y: 0 };

  function canvas() { return document.querySelector('#viewer-container canvas'); }

  function toNDC(clientX, clientY) {
    const el = canvas();
    const r = el ? el.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    return new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
  }

  window.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });

  window.addEventListener('pointermove', (e) => {
    ptr.copy(toNDC(e.clientX, e.clientY));
    const cam = typeof getCamera === 'function' ? getCamera() : getCamera;
    raycaster.setFromCamera(ptr, cam);
    if (raycaster.intersectObjects(objects, false).length > 0) {
      const el = canvas();
      if (el) el.style.cursor = 'pointer';
    }
  });

  window.addEventListener('pointerup', (e) => {
    const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    if (dx * dx + dy * dy > 25) return;
    if (isDetailOpen()) return;

    ptr.copy(toNDC(e.clientX, e.clientY));
    const cam = typeof getCamera === 'function' ? getCamera() : getCamera;
    raycaster.setFromCamera(ptr, cam);
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length > 0) {
      const { id, src } = hits[0].object.userData;
      openDetail({ title: id, body: '', image: src });
    }
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export function addAllImages(scene, getCamera) {
  const objects = IMAGE_DEFS.map(def => addImageMesh(scene, def));
  setupImagePositionControls(objects);
  setupImageInteraction(objects, getCamera);
  return objects;
}
