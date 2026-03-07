import * as THREE from 'three';
import CONFIG from '../config/config.js';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function createDotTextureSelected(color, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const hex = '#' + new THREE.Color(color).getHexString();
  const half = size / 2;
  const radius = half * 0.72;
  const ringW = radius * 0.30;

  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(half, half, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.beginPath();
  ctx.arc(half, half, radius - ringW, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createDotTexture(color, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const hex = '#' + new THREE.Color(color).getHexString();
  const half = size / 2;
  const radius = half * 0.72;

  // Fill canvas then punch circle as alpha mask — prevents dark fringe on anti-aliased edges.
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(half, half, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function toSceneCoords(xEpsg, yEpsg) {
  const ft2m = CONFIG.feetToMeters;
  const off  = CONFIG.originOffset;

  return new THREE.Vector3(
    xEpsg * ft2m - off.x,
    CONFIG.marker.heightOffset,
    -(yEpsg * ft2m) - off.z
  );
}

export async function loadCSVPoints(scene, csvPath, color, darkColor, label) {
  const response = await fetch(csvPath);
  const text = await response.text();
  const rows = parseCSV(text);

  const lightTex    = createDotTexture(color);
  const darkTex     = createDotTexture(darkColor ?? color);
  const selectedTex = createDotTextureSelected(color);

  const material = new THREE.SpriteMaterial({
    map: lightTex,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  material.userData.selectedTex = selectedTex;

  const group = new THREE.Group();
  group.name = label;
  group.renderOrder = 999;

  const markerSize = CONFIG.marker.worldSize;

  rows.forEach((row) => {
    const x = parseFloat(row.X);
    const y = parseFloat(row.Y);
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    const pos = toSceneCoords(x, y);
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.scale.set(markerSize, markerSize, 1);

    sprite.userData = {
      type: label,
      handle: row.EntityHandle || '',
      text: row.Text || '',
      coordX: x,
      coordY: y
    };

    group.add(sprite);
  });

  let edgeSpriteLeft = null, edgeSpriteRight = null;
  let minX = Infinity, maxX = -Infinity;
  for (const child of group.children) {
    if (child.position.x < minX) { minX = child.position.x; edgeSpriteLeft  = child; }
    if (child.position.x > maxX) { maxX = child.position.x; edgeSpriteRight = child; }
  }

  scene.add(group);
  console.log(`[csvLoader] ${label}: ${group.children.length} points loaded from ${csvPath}`);
  return { group, rows, material, lightTex, darkTex, edgeSpriteLeft, edgeSpriteRight };
}

export async function loadAllCSV(scene) {
  const results = {};
  for (const [key, cfg] of Object.entries(CONFIG.csvFiles)) {
    results[key] = await loadCSVPoints(scene, cfg.path, cfg.color, cfg.darkColor, cfg.label);
  }
  return results;
}
