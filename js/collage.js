/**
 * collage.js – Flat image planes for COLLAGE submenu mode.
 *
 * Four horizontal planes are placed around the 3D model (N / E / S / W).
 * Positions and slot dimensions are derived from the model's bounding box.
 *
 * Spacing guarantees (verified in computeLayouts):
 *   • each plane inner edge is GAP units from the model's outer edge
 *   • adjacent plane corners are separated by CORNER_GAP units (no touching)
 *
 * Aspect ratio: each plane's geometry is created at its slot size, then scaled
 * to fit the image's native pixel ratio as soon as the texture loads.
 * mesh.scale.x controls world-X, mesh.scale.y controls world-Z (because
 * the mesh is rotated -PI/2 around X, mapping local Y → world -Z).
 *
 * To add more images: append to COLLAGE_IMAGES and add a matching layout
 * entry in computeLayouts().
 */
import * as THREE from 'three';

const BASE_PATH = './assets/images/';

const GAP         = 600;   // world units: model edge → plane inner edge
const CORNER_GAP  = 800;   // world units: clear space at each plane corner
const FADE_MS     = 320;   // fade duration in ms

/**
 * Image sources in [N, E, S, W] layout order.
 */
const COLLAGE_IMAGES = [
  { id: 'drawing1', src: 'collage-drawing1.jpg' }, // north
  { id: 'drawing2', src: 'collage-drawing2.jpg' }, // east
  { id: 'drawing3', src: 'collage-drawing3.jpg' }, // south
  { id: 'drawing4', src: 'collage-drawing4.jpg' }, // west
];

/**
 * Compute plane slot dimensions and centre positions from the model bounding box.
 *
 * Variables:
 *   hx  = model half-width  in X
 *   hz  = model half-depth  in Z
 *   D   = BASE_SIZE = max(size.x, size.z)  — consistent depth for all planes
 *
 * N/S planes (running East-West):
 *   slot world-X  = 2*(hx + GAP) − 2*CORNER_GAP
 *   slot world-Z  = D
 *   centre-Z      = Cz ∓ (hz + GAP + D/2)
 *
 * E/W planes (running North-South):
 *   slot world-X  = D
 *   slot world-Z  = 2*(hz + GAP) − 2*CORNER_GAP
 *   centre-X      = Cx ± (hx + GAP + D/2)
 *
 * Corner clearance proof (NE corner):
 *   N right edge  = Cx + (hx+GAP) − CORNER_GAP
 *   E left  edge  = Cx +  hx+GAP
 *   gap in X      = CORNER_GAP  ✓
 *
 *   E top   edge  = Cz − (hz+GAP) + CORNER_GAP   (less-negative z = more south)
 *   N inner edge  = Cz −  hz−GAP                  (more north)
 *   gap in Z      = CORNER_GAP  ✓
 *
 * @param {THREE.Box3} modelBox
 * @returns {Array<{x,y,z,pw,ph}>}  pw = slot world-X,  ph = slot world-Z
 */
function computeLayouts(modelBox) {
  const center  = modelBox.getCenter(new THREE.Vector3());
  const size    = modelBox.getSize(new THREE.Vector3());
  const hx      = size.x / 2;
  const hz      = size.z / 2;
  const groundY = modelBox.min.y;

  // Common depth for all four planes — keeps visual scale consistent.
  const D = Math.max(size.x, size.z);

  // Perpendicular (non-depth) slot widths, shrunk so corners have CORNER_GAP clearance.
  const ns_w = Math.max(0, 2 * (hx + GAP) - 2 * CORNER_GAP); // N/S planes: X extent
  const ew_w = Math.max(0, 2 * (hz + GAP) - 2 * CORNER_GAP); // E/W planes: Z extent

  return [
    // North  — pw = world-X slot,  ph = world-Z slot
    { x: center.x,                    y: groundY, z: center.z - hz - GAP - D / 2, pw: ns_w, ph: D },
    // East
    { x: center.x + hx + GAP + D / 2, y: groundY, z: center.z,                    pw: D,    ph: ew_w },
    // South
    { x: center.x,                    y: groundY, z: center.z + hz + GAP + D / 2, pw: ns_w, ph: D },
    // West
    { x: center.x - hx - GAP - D / 2, y: groundY, z: center.z,                    pw: D,    ph: ew_w },
  ];
}

/**
 * Fit an image into a rectangular slot while preserving its aspect ratio.
 * Sets mesh.scale so the visible quad never exceeds (slotW × slotH) in world space
 * and always shows the full image without cropping or distortion.
 *
 * After rotation.x = -PI/2:
 *   mesh.scale.x  →  world X
 *   mesh.scale.y  →  world Z
 *
 * @param {THREE.Mesh}  mesh
 * @param {number}      slotW   – slot world-X extent  (= lay.pw)
 * @param {number}      slotH   – slot world-Z extent  (= lay.ph)
 * @param {number}      imgW    – texture pixel width
 * @param {number}      imgH    – texture pixel height
 */
function fitToSlot(mesh, slotW, slotH, imgW, imgH) {
  if (!imgW || !imgH) return;
  const imgAspect  = imgW / imgH;
  const slotAspect = slotW / slotH;

  if (imgAspect > slotAspect) {
    // Image wider than slot → fill the X width, shrink the Z scale
    mesh.scale.set(1, slotAspect / imgAspect, 1);
  } else {
    // Image taller than (or equal to) slot → fill the Z height, shrink the X scale
    mesh.scale.set(imgAspect / slotAspect, 1, 1);
  }
}

/**
 * Create the collage plane meshes, add them to the scene (hidden), and return
 * show() / hide() functions that fade their opacity.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Box3}  modelBox
 * @returns {{ show: Function, hide: Function }}
 */
export function createCollagePlanes(scene, modelBox) {
  const loader  = new THREE.TextureLoader();
  const layouts = computeLayouts(modelBox);
  const planes  = [];

  let currentOpacity = 0;
  let cancelToken    = 0;
  let rafId          = null;

  COLLAGE_IMAGES.forEach((cfg, i) => {
    const lay = layouts[i];
    if (!lay) return;

    // Geometry sized to the full slot; scale is corrected per-image when texture loads.
    const geo = new THREE.PlaneGeometry(lay.pw, lay.ph);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;       // lie flat in XZ ground plane
    mesh.position.set(lay.x, lay.y, lay.z);
    mesh.visible = false;
    mesh.name    = `collage:${cfg.id}`;
    mesh.raycast = () => {};               // exclude from sprite raycasting

    scene.add(mesh);

    loader.load(
      BASE_PATH + cfg.src,
      (tex) => {
        tex.colorSpace  = THREE.SRGBColorSpace;
        mat.map         = tex;
        mat.needsUpdate = true;

        // Correct the plane scale to the image's real pixel ratio.
        // This runs once when the texture first loads (plane is still hidden).
        fitToSlot(mesh, lay.pw, lay.ph, tex.image.width, tex.image.height);
      },
      undefined,
      (err) => { console.warn(`[collage] Failed to load ${cfg.src}:`, err); }
    );

    planes.push({ mesh, mat });
  });

  function fade(toVisible) {
    const token = ++cancelToken;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    if (toVisible) {
      for (const { mesh } of planes) mesh.visible = true;
    }

    const startOp = currentOpacity;
    const endOp   = toVisible ? 1 : 0;
    const t0      = performance.now();

    function tick() {
      if (cancelToken !== token) return;
      const p  = Math.min((performance.now() - t0) / FADE_MS, 1);
      const op = startOp + (endOp - startOp) * p;
      currentOpacity = op;
      for (const { mat } of planes) { mat.opacity = op; mat.needsUpdate = true; }
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        if (!toVisible) for (const { mesh } of planes) mesh.visible = false;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  return {
    show: () => fade(true),
    hide: () => fade(false),
  };
}
