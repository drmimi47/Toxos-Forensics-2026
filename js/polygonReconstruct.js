import * as THREE from 'three';
import CONFIG from '../config/config.js';

// ── CSV parser that correctly handles quoted fields containing commas ──────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  function splitLine(line) {
    const values = [];
    let inQuote = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    values.push(cur.trim());
    return values;
  }

  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ── Coordinate conversion: EPSG:2263 feet → Three.js scene XZ ────────────
function toSceneXZ(xFt, yFt) {
  const ft2m = CONFIG.feetToMeters;
  const off  = CONFIG.originOffset;
  return {
    x:  xFt * ft2m - off.x,
    z: -(yFt * ft2m) - off.z,
  };
}

// ── Build polygon meshes from a CSV ────────────────────────────────────────
//
// Grouping hierarchy: fid → vertex_part → vertex_part_ring → vertex_part_index
//   Ring 0  = outer boundary  → THREE.Shape
//   Ring 1+ = holes           → shape.holes
//
// Returns a THREE.Group containing one Mesh per (fid, part) combination.
// The group starts hidden; caller controls visibility.
//
// To add a new polygon dataset in future: add an entry to CONFIG.phasePolygons
// and this function handles the rest — no code changes needed here.
//
export async function loadPolygons(scene, csvPath, color, opacity = 0.35, height, outline = false) {
  const response = await fetch(csvPath);
  const text = await response.text();
  const rows = parseCSV(text);

  const y = height ?? CONFIG.marker.heightOffset;

  // Build: features(fid) → parts(vertex_part) → rings(vertex_part_ring) → vertex[]
  const features = new Map();

  for (const row of rows) {
    const fid  = row.fid || row.objectid_1 || '0';
    const part = parseInt(row.vertex_part,       10) || 0;
    const ring = parseInt(row.vertex_part_ring,  10) || 0;
    const vi   = parseInt(row.vertex_part_index, 10) || 0;
    const xFt  = parseFloat(row.X);
    const yFt  = parseFloat(row.Y);
    if (Number.isNaN(xFt) || Number.isNaN(yFt)) continue;

    if (!features.has(fid))        features.set(fid,  new Map());
    const parts = features.get(fid);
    if (!parts.has(part))          parts.set(part, new Map());
    const rings = parts.get(part);
    if (!rings.has(ring))          rings.set(ring, []);
    rings.get(ring).push({ vi, xFt, yFt });
  }

  const fillMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });

  const lineMaterial = outline ? new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(opacity + 0.4, 1.0),
    depthTest: false,
    depthWrite: false,
  }) : null;

  // Start at opacity 0 so fade-in works correctly from the first frame.
  fillMaterial.opacity = 0;
  if (lineMaterial) lineMaterial.opacity = 0;

  const group = new THREE.Group();
  group.name = 'polygon-layer';
  group.visible = false;
  // Expose materials so the caller can animate opacity for fade in/out.
  group._fillMaterial = fillMaterial;
  group._lineMaterial = lineMaterial;
  group._fillOpacity = opacity;
  group._lineOpacity = lineMaterial ? Math.min(opacity + 0.4, 1.0) : 0;

  // Yield one microtask between features so the browser can breathe on large datasets.
  const _yield = () => new Promise(r => setTimeout(r, 0));

  for (const [, parts] of features) {
    await _yield();
    for (const [, rings] of parts) {
      // Sort ring keys so outer ring (0) is always first
      const sortedRings = [...rings.entries()].sort(([a], [b]) => a - b);
      if (sortedRings.length === 0) continue;

      // Outer boundary
      const [, outerVerts] = sortedRings[0];
      outerVerts.sort((a, b) => a.vi - b.vi);
      if (outerVerts.length < 3) continue;

      const outerPts = outerVerts.map(v => {
        const sc = toSceneXZ(v.xFt, v.yFt);
        return new THREE.Vector2(sc.x, -sc.z);
      });

      const shape = new THREE.Shape(outerPts);

      // Holes (rings 1+)
      for (let r = 1; r < sortedRings.length; r++) {
        const [, holeVerts] = sortedRings[r];
        holeVerts.sort((a, b) => a.vi - b.vi);
        if (holeVerts.length < 3) continue;
        const holePts = holeVerts.map(v => {
          const sc = toSceneXZ(v.xFt, v.yFt);
          return new THREE.Vector2(sc.x, -sc.z);
        });
        shape.holes.push(new THREE.Path(holePts));
      }

      const geometry = new THREE.ShapeGeometry(shape);

      // ShapeGeometry lives in XY; rotate -90° around X to lie flat in XZ (Y-up scene).
      const mesh = new THREE.Mesh(geometry, fillMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = 1;
      group.add(mesh);

      // Outline — one LineLoop per ring (outer boundary + each hole).
      if (outline && lineMaterial) {
        const allRings = [outerPts, ...shape.holes.map(h => h.getPoints())];
        for (const ringPts of allRings) {
          if (ringPts.length < 2) continue;
          // Close the loop by repeating the first point at the end.
          const positions = [];
          for (const pt of ringPts) {
            positions.push(pt.x, 0, -pt.y);
          }
          positions.push(ringPts[0].x, 0, -ringPts[0].y);
          const lineGeo = new THREE.BufferGeometry();
          lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const line = new THREE.Line(lineGeo, lineMaterial);
          line.position.y = y;
          line.renderOrder = 2;
          group.add(line);
        }
      }
    }
  }

  scene.add(group);
  console.log(`[polygonReconstruct] ${group.children.length} polygon mesh(es) from ${csvPath}`);
  return group;
}
