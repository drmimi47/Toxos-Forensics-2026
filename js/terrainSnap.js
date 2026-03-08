import * as THREE from 'three';

/**
 * buildTerrainSnapper — call once after the model loads, passing the terrain-only
 * mesh array from gltfLoader. Returns a snap() function you can call on any sprite
 * group to position its children on the terrain surface.
 *
 * Results are cached by quantized XZ cell (GRID_CELL units wide) so that densely
 * clustered points (e.g. RCRA ~1 600 pts) share cached ray hits — the raycast is
 * effectively computed once per unique terrain cell across all datasets.
 *
 * Edge correction: after raycasting, sprites near the model border can hit side/skirt
 * geometry instead of the top surface, producing outlier Y values. A median + MAD
 * (Median Absolute Deviation) pass detects and replaces these with the dataset median
 * so border points blend naturally with interior neighbours.
 *
 * Usage:
 *   const snapToTerrain = buildTerrainSnapper(topoMeshes);
 *   snapToTerrain(csvResults.cso.group.children, heightOffset);
 *   // future datasets:
 *   snapToTerrain(newResult.group.children, heightOffset);
 */

const GRID_CELL = 25;     // scene metres — finer than a data-point footprint
const MAD_THRESHOLD = 3;  // multiples of MAD before a point is considered an outlier

export function buildTerrainSnapper(topoMeshes) {
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);

  // terrainY cache: quantized "x,z" string → world-space Y of terrain surface (or null = no hit)
  const cache = new Map();

  function cellKey(x, z) {
    return `${Math.round(x / GRID_CELL)},${Math.round(z / GRID_CELL)}`;
  }

  function getTerrainY(x, z) {
    const key = cellKey(x, z);
    if (cache.has(key)) return cache.get(key);

    ray.ray.origin.set(x, 10000, z);
    const hits = ray.intersectObjects(topoMeshes, false);
    const y = hits.length > 0 ? hits[0].point.y : null;
    cache.set(key, y);
    return y;
  }

  // Compute the median of a sorted numeric array.
  function median(sorted) {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Snap an array of sprites to the terrain surface, then clamp border outliers.
   * @param {THREE.Sprite[]} sprites  - sprite children from a CSV group
   * @param {number} heightOffset     - metres above terrain surface (CONFIG.marker.heightOffset)
   */
  function snapToTerrain(sprites, heightOffset) {
    // Pass 1 — raycast every sprite; store raw terrainY in userData
    let hitCount = 0;
    for (const sprite of sprites) {
      const terrainY = getTerrainY(sprite.position.x, sprite.position.z);
      if (terrainY !== null) {
        sprite.position.y = terrainY + heightOffset;
        sprite.userData.terrainY = terrainY;
        hitCount++;
      }
    }

    // Pass 2 — compute dataset median + MAD and replace border outliers
    const validYs = sprites
      .filter(s => s.userData.terrainY !== undefined)
      .map(s => s.userData.terrainY)
      .sort((a, b) => a - b);

    if (validYs.length >= 4) {
      const med = median(validYs);
      const deviations = validYs.map(y => Math.abs(y - med)).sort((a, b) => a - b);
      const mad = median(deviations);

      // When MAD is near zero (flat terrain), fall back to a minimum tolerance
      // so isolated spikes are still caught even on very flat datasets.
      const tolerance = Math.max(mad * MAD_THRESHOLD, 5);

      let clamped = 0;
      for (const sprite of sprites) {
        if (sprite.userData.terrainY === undefined) continue;
        if (Math.abs(sprite.userData.terrainY - med) > tolerance) {
          sprite.position.y = med + heightOffset;
          sprite.userData.terrainY = med; // update so cache re-uses corrected value
          clamped++;
        }
      }

      console.log(
        `[terrainSnap] Snapped ${hitCount}/${sprites.length} sprites.` +
        (clamped ? ` Clamped ${clamped} border outliers to median Y=${med.toFixed(1)}.` : '')
      );
    } else {
      console.log(`[terrainSnap] Snapped ${hitCount}/${sprites.length} sprites.`);
    }
  }

  /** Expose cache size for diagnostics */
  snapToTerrain.cacheSize = () => cache.size;

  return snapToTerrain;
}
