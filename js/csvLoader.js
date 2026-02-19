/**
 * csvLoader.js – Fetches a CSV file, parses it, and creates sprite-based
 * point markers that maintain a constant screen size regardless of zoom.
 *
 * Expects CSV columns: X, Y  (EPSG:2263 US survey feet)
 * Optional columns used for tooltips: EntityHandle, Text, Layer
 */
import * as THREE from 'three';
import CONFIG from '../config/config.js';

/**
 * Parse a simple CSV string into an array of objects.
 * Handles quoted fields.
 */
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

/**
 * Create a circular dot texture via a canvas.
 * @param {number} color  hex color (e.g. 0xff0000)
 * @param {number} [size=64]  canvas pixel size
 * @returns {THREE.CanvasTexture}
 */
function createDotTexture(color, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const hex = '#' + new THREE.Color(color).getHexString();
  const half = size / 2;
  const radius = half * 0.72;

  // Fill entire canvas with the dot color first, then punch the circle
  // shape as an alpha mask using destination-in. This ensures anti-aliased
  // edge pixels fade from full color → transparent (same hue) rather than
  // blending into transparent-black, which would create a dark fringe ring.
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(half, half, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black'; // color irrelevant with destination-in; only alpha matters
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;  // ensure colors display at full vibrancy
  texture.needsUpdate = true;
  return texture;
}

/**
 * Convert an EPSG:2263 (X, Y) pair (US survey feet) into the Three.js
 * scene coordinate system (metres, Y-up, origin-offset applied).
 */
function toSceneCoords(xEpsg, yEpsg) {
  const ft2m = CONFIG.feetToMeters;
  const off  = CONFIG.originOffset;

  return new THREE.Vector3(
    xEpsg * ft2m - off.x,
    CONFIG.marker.heightOffset - off.y,
    -(yEpsg * ft2m) - off.z
  );
}

/**
 * Load a CSV file and add sprite markers to the scene.
 * Sprites use sizeAttenuation=true with dynamic scale adjustment for constant screen size.
 */
export async function loadCSVPoints(scene, csvPath, color, darkColor, label) {
  const response = await fetch(csvPath);
  const text = await response.text();
  const rows = parseCSV(text);

  const lightTex = createDotTexture(color);
  const darkTex  = createDotTexture(darkColor ?? color);

  const material = new THREE.SpriteMaterial({
    map: lightTex,
    sizeAttenuation: true,    // world-unit sizing; we dynamically adjust scale for constant screen size
    transparent: true,
    depthWrite: false,
    depthTest: false,         // always render on top of geometry
    blending: THREE.NormalBlending,
    toneMapped: false,        // bypass ACES tone mapping so colors match the hex exactly
  });

  const group = new THREE.Group();
  group.name = label;
  group.renderOrder = 999;    // ensure dots draw after all other objects

  const markerSize = CONFIG.marker.worldSize;

  rows.forEach((row) => {
    const x = parseFloat(row.X);
    const y = parseFloat(row.Y);
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    const pos = toSceneCoords(x, y);
    // Share material across sprites — no clone needed; all dots in a group look identical
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);

    sprite.scale.set(markerSize, markerSize, 1);

    // Attach metadata for raycasting / tooltips
    sprite.userData = {
      type: label,
      handle: row.EntityHandle || '',
      text: row.Text || '',
      coordX: x,
      coordY: y
    };

    group.add(sprite);
  });

  scene.add(group);
  console.log(`[csvLoader] ${label}: ${group.children.length} points loaded from ${csvPath}`);
  return { group, rows, material, lightTex, darkTex };
}

/**
 * Convenience: load all CSV datasets defined in CONFIG.
 */
export async function loadAllCSV(scene) {
  const results = {};
  for (const [key, cfg] of Object.entries(CONFIG.csvFiles)) {
    results[key] = await loadCSVPoints(scene, cfg.path, cfg.color, cfg.darkColor, cfg.label);
  }
  return results;
}
