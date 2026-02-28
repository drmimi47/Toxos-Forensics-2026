/**
 * collage.js – Flat image planes for COLLAGE submenu mode.
 *
 * ── HOW LAYOUTS WORK ────────────────────────────────────────────────────────
 * computeLayouts() anchors each of the four cardinal slots (N / E / S / W)
 * AT the corresponding face of the model's bounding box.  nudgeX/Y/Z are then
 * applied on top as direct world-unit offsets from that face — small numbers
 * work as expected with no hidden GAP constraint.
 *
 * ── NUDGE SEMANTICS ─────────────────────────────────────────────────────────
 *   nudge = null  →  auto: places image at GAP + half-slot-depth from model face
 *                    (the old default position — same visual as before)
 *   nudge = 0     →  image centred RIGHT AT the model face
 *   nudge = 500   →  image 500 world units outward from the model face
 *   nudge = -200  →  image 200 world units INTO the model (overlapping it)
 *
 * OUTWARD direction per slot:
 *   North  → nudgeZ negative moves further away  (e.g. nudgeZ: -1000)
 *   South  → nudgeZ positive moves further away  (e.g. nudgeZ:  1000)
 *   East   → nudgeX positive moves further away  (e.g. nudgeX:  1000)
 *   West   → nudgeX negative moves further away  (e.g. nudgeX: -1000)
 *
 * ── ADDING A 5TH+ IMAGE ─────────────────────────────────────────────────────
 * Images beyond index 3 have no auto-layout slot.  Provide an explicit world
 * position and slot size directly on the entry (see template at end of array).
 *
 * ── COORDINATE SYSTEM ───────────────────────────────────────────────────────
 *   World X  →  East  (+) / West  (−)
 *   World Y  →  Up    (+) / Down  (−)   (images lie flat, so Y = elevation)
 *   World Z  →  South (+) / North (−)
 *
 * ── PLANE ORIENTATION ───────────────────────────────────────────────────────
 * Every plane lies flat in the XZ ground plane (rotation.x = −PI/2).
 * After that rotation, in Three.js:
 *   mesh.scale.x  →  world-X extent   (width  left/right)
 *   mesh.scale.y  →  world-Z extent   (height front/back)
 * rotateY pivots the plane around the world Y axis BEFORE it is laid flat,
 * so positive values swing the panel counter-clockwise from above.
 *
 * ── SIZING CONSTANTS ────────────────────────────────────────────────────────
 *   GAP        – default outward offset from model face (used only when nudge = null)
 *   CORNER_GAP – clearance subtracted from slot WIDTH to avoid corner overlaps
 */
import * as THREE from 'three';

const BASE_PATH = './assets/images/';

const GAP        = 510;   // world units: default outward gap from model face (null-nudge only)
const CORNER_GAP = 300;   // world units: inset from each end of a slot's width edge
const FADE_MS    = 680;   // fade-in / fade-out duration in milliseconds

// ── IMAGE CATALOGUE ──────────────────────────────────────────────────────────
// Each entry represents one flat image plane in the scene.
//
// SUPPORTED FORMATS: any image format the browser natively decodes —
//   .jpg / .jpeg   — best for photographs (smaller files, lossy)
//   .png           — best for graphics/transparency (lossless)
//   .webp          — smaller than both at similar quality (modern browsers)
//
// AUTO-LAYOUT PROPERTIES (indices 0-3, anchored at the model face):
//
//   nudgeX  {number|null}
//     Offset in world X from the model face baseline.
//     null = auto (same as old GAP-based default position).
//     0    = right at the model face edge.
//     N/S slots: lateral east/west shift. 0 = centred on model.
//     E/W slots: outward/inward shift.   + = further east,  − = into model.
//
//   nudgeY  {number|null}
//     Offset in world Y (elevation) from model ground level.
//     null or 0 = sits on the ground.  + = raised up, − = sunk below ground.
//
//   nudgeZ  {number|null}
//     Offset in world Z from the model face baseline.
//     null = auto (same as old GAP-based default position).
//     0    = right at the model face edge.
//     N/S slots: outward/inward shift.   + = further south, − = into model (for South slot).
//     E/W slots: lateral north/south shift. 0 = centred on model.
//
//   scaleW  {number}  Slot-width  multiplier (>1 = wider,  <1 = narrower). Default: 1
//   scaleH  {number}  Slot-height multiplier (>1 = taller, <1 = shorter).  Default: 1
//   rotateY {number}  Extra Y-axis rotation in radians before the plane is
//                     laid flat.  Positive = CCW from above.              Default: 0
//
// TIP: A console.log at startup prints the computed auto-default nudge values
// for each slot so you know what numbers to use as a starting point.
//
// FULLY-MANUAL PROPERTIES (required for index ≥ 4, optional override for 0-3):
//   x, z     {number}  Absolute world centre of the plane (required).
//   y        {number}  Absolute world elevation.  Defaults to model groundY.
//   pw       {number}  Slot width  in world units (required for manual layout).
//   ph       {number}  Slot height in world units (required for manual layout).
//   When pw + ph are present the auto-layout is skipped entirely for that entry.
//   nudgeX/Y/Z are then applied on top of x/y/z as fine-tune offsets.
// ─────────────────────────────────────────────────────────────────────────────
const COLLAGE_IMAGES = [

  // ── INDEX 0 · NORTH (slot runs East-West, north of model) ────────────────
  // Baseline: north face of model bounding box.
  // nudgeZ negative = further north (away from model); positive = into model.
  // nudgeX positive = shift east; negative = shift west.
  {
    id:  'drawing1',
    src: 'collage-drawing1.png',
    nudgeX:  null,  // null = auto-default (GAP + half-slot from north face)
    nudgeY:  null,  // null = ground level
    nudgeZ:  null,  // null = auto-default (GAP + half-slot from north face)
    scaleW:  1,     // 1 = full auto width;  try 0.8 to narrow, 1.2 to widen
    scaleH:  1,     // 1 = full auto height; try 0.8 to shorten, 1.2 to lengthen
    rotateY: 0,     // radians; 0 = default orientation, Math.PI/4 = 45° swing
  },

  // ── INDEX 1 · EAST (slot runs North-South, east of model) ─────────────────
  // Baseline: east face of model bounding box.
  // nudgeX positive = further east (away from model); negative = into model.
  // nudgeZ positive = shift south; negative = shift north.
  {
    id:  'drawing2',
    src: 'collage-drawing2.png',
    nudgeX:  null,
    nudgeY:  null,
    nudgeZ:  null,
    scaleW:  1,
    scaleH:  1,
    rotateY: 0,
  },

  // ── INDEX 2 · SOUTH (slot runs East-West, south of model) ────────────────
  // Baseline: south face of model bounding box.
  // nudgeZ positive = further south (away from model); negative = closer / into model.
  // nudgeX positive = shift east; negative = shift west.
  {
    id:  'drawing3',
    src: 'collage-drawing3.png',
    nudgeX:  null,
    nudgeY:  0,
    nudgeZ:  null,  // e.g. nudgeZ: 500 → 500 units south of south model face
    scaleW:  1,
    scaleH:  1,
    rotateY: 0,
  },

  // ── INDEX 3 · WEST (slot runs North-South, west of model) ─────────────────
  // Baseline: west face of model bounding box.
  // nudgeX negative = further west (away from model); positive = into model.
  // nudgeZ positive = shift south; negative = shift north.
  {
    id:  'drawing4',
    src: 'collage-drawing4.png',
    nudgeX:  null,
    nudgeY:  null,
    nudgeZ:  null,
    scaleW:  1,
    scaleH:  1,
    rotateY: 0,
  },

  // ── INDEX 4+ · FULLY MANUAL (no auto-layout slot; provide x/z/pw/ph) ──────
  // Uncomment and fill in to add a fifth or additional image:
  // {
  //   id:  'drawing5',
  //   src: 'collage-drawing5.jpg',
  //   x:  0,        // world X centre of the plane
  //   z:  0,        // world Z centre of the plane
  //   y:  undefined,// world Y elevation — omit to use model groundY automatically
  //   pw: 3000,     // slot width  in world units (world X)
  //   ph: 2000,     // slot height in world units (world Z)
  //   nudgeX:  0,   // fine-tune offset applied ON TOP of x/z above
  //   nudgeY:  0,
  //   nudgeZ:  0,
  //   rotateY: 0,
  // },

];

// ── AUTO-LAYOUT COMPUTATION ──────────────────────────────────────────────────
/**
 * Derive slot dimensions and face-anchored baseline positions for the four
 * cardinal planes from the model's bounding box.
 *
 * The baseline x/z is anchored AT the model's bounding-box face (zero gap).
 * nudgeX/Z are then applied on top as direct world-unit offsets from that face.
 *
 * defX / defZ — the nudge values that reproduce the OLD GAP-based positions,
 * used automatically when nudgeX / nudgeZ is null.  Logged to the console on
 * startup so you can use them as a reference starting point.
 *
 * Slot width geometry (unchanged):
 *   D     = max(size.x, size.z)  — common depth for all four planes
 *   N/S width = 2*(hx + GAP) − 2*CORNER_GAP   (East-West span)
 *   E/W width = 2*(hz + GAP) − 2*CORNER_GAP   (North-South span)
 *
 * @param {THREE.Box3} modelBox
 * @returns {Array<{x,y,z,pw,ph,defX,defZ}>}
 */
function computeLayouts(modelBox) {
  const center = modelBox.getCenter(new THREE.Vector3());
  const size   = modelBox.getSize(new THREE.Vector3());
  const hx     = size.x / 2;
  const hz     = size.z / 2;

  // All planes sit at the model's ground elevation by default.
  const groundY = modelBox.min.y;

  // D is the "depth" dimension shared across all four planes for visual consistency.
  const D = Math.max(size.x, size.z);

  // Slot width: inset by CORNER_GAP on each end to leave clear space at corners.
  const ns_w = Math.max(0, 2 * (hx + GAP) - 2 * CORNER_GAP); // N/S world-X span
  const ew_w = Math.max(0, 2 * (hz + GAP) - 2 * CORNER_GAP); // E/W world-Z span

  // Default outward offset when nudge = null.
  // Centres the slot at GAP from the model face (same as the old baked-in position).
  const def = GAP + D / 2;

  return [
    // [0] North — baseline AT the north face of the model (min Z)
    //   defZ is negative because further-north = more-negative Z
    { x: center.x,      y: groundY, z: center.z - hz, pw: ns_w, ph: D,    defX:    0, defZ: -def },
    // [1] East  — baseline AT the east face of the model (max X)
    //   defX is positive because further-east = more-positive X
    { x: center.x + hx, y: groundY, z: center.z,      pw: D,    ph: ew_w, defX:  def, defZ:    0 },
    // [2] South — baseline AT the south face of the model (max Z)
    //   defZ is positive because further-south = more-positive Z
    { x: center.x,      y: groundY, z: center.z + hz, pw: ns_w, ph: D,    defX:    0, defZ:  def },
    // [3] West  — baseline AT the west face of the model (min X)
    //   defX is negative because further-west = more-negative X
    { x: center.x - hx, y: groundY, z: center.z,      pw: D,    ph: ew_w, defX: -def, defZ:    0 },
  ];
}

// ── ASPECT-RATIO FITTING ─────────────────────────────────────────────────────
/**
 * Scale a mesh so its texture fills the slot without cropping or distortion.
 * The scale components map to world axes after the plane is laid flat:
 *   mesh.scale.x  →  world X
 *   mesh.scale.y  →  world Z
 *
 * If the image is wider than the slot it fills the X axis and letterboxes in Z.
 * If the image is taller than the slot it fills the Z axis and pillarboxes in X.
 *
 * @param {THREE.Mesh} mesh
 * @param {number} slotW  Slot world-X extent (after scaleW applied)
 * @param {number} slotH  Slot world-Z extent (after scaleH applied)
 * @param {number} imgW   Texture pixel width
 * @param {number} imgH   Texture pixel height
 */
function fitToSlot(mesh, slotW, slotH, imgW, imgH) {
  if (!imgW || !imgH) return;
  const imgAspect  = imgW / imgH;
  const slotAspect = slotW / slotH;

  if (imgAspect > slotAspect) {
    // Image wider than slot → clamp to X width, shrink Z proportionally
    mesh.scale.set(1, slotAspect / imgAspect, 1);
  } else {
    // Image taller (or equal) → clamp to Z height, shrink X proportionally
    mesh.scale.set(imgAspect / slotAspect, 1, 1);
  }
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
/**
 * Build all collage planes, add them to the scene (initially hidden), and
 * return show() / hide() controls that fade their opacity.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Box3}  modelBox
 * @returns {{ show: Function, hide: Function }}
 */
export function createCollagePlanes(scene, modelBox) {
  const loader  = new THREE.TextureLoader();
  const layouts = computeLayouts(modelBox);
  const planes  = [];

  // Log computed auto-default nudge values so you can use them as a reference
  // when deciding how far to offset from the model face for each slot.
  console.log(
    '[collage] Auto-default nudge values (world units from each model face):\n' +
    `  North (index 0): nudgeZ = ${layouts[0].defZ.toFixed(0)}  (negative = further north)\n` +
    `  East  (index 1): nudgeX = ${layouts[1].defX.toFixed(0)}  (positive = further east)\n` +
    `  South (index 2): nudgeZ = ${layouts[2].defZ.toFixed(0)}  (positive = further south)\n` +
    `  West  (index 3): nudgeX = ${layouts[3].defX.toFixed(0)}  (negative = further west)\n` +
    '  Set nudge to null to keep these defaults, or to a number to override.'
  );

  // Shared fade state — a cancel-token approach means rapid show/hide calls
  // always cancel the previous animation rather than stacking.
  let currentOpacity = 0;
  let cancelToken    = 0;
  let rafId          = null;

  COLLAGE_IMAGES.forEach((cfg, i) => {

    // ── Resolve base layout ──────────────────────────────────────────────────
    // A fully-manual entry (pw + ph present) bypasses the auto-layout table.
    // Auto-layout entries (indices 0-3) anchor at the model face; nudge then
    // positions the image relative to that face in plain world units.
    let baseX, baseY, baseZ, baseW, baseH;
    let lay = null;

    if (cfg.pw !== undefined && cfg.ph !== undefined) {
      // Fully manual: author specifies all world dimensions directly.
      const center = modelBox.getCenter(new THREE.Vector3());
      baseX = cfg.x  ?? center.x;
      baseY = cfg.y  ?? modelBox.min.y;  // default to ground level
      baseZ = cfg.z  ?? center.z;
      baseW = cfg.pw;
      baseH = cfg.ph;
    } else {
      // Auto-layout: baseline is the model's bounding-box face for this slot.
      lay = layouts[i];
      if (!lay) {
        console.warn(
          `[collage] No auto-layout for image index ${i} ("${cfg.id}"). ` +
          `Add x, z, pw, ph to the entry to position it manually.`
        );
        return;
      }
      baseX = lay.x;
      baseY = lay.y;
      baseZ = lay.z;
      baseW = lay.pw;
      baseH = lay.ph;
    }

    // ── Apply nudge ──────────────────────────────────────────────────────────
    // nudge = null  → use the auto-default offset (lay.defX / lay.defZ) which
    //                 reproduces the original GAP-based distance from the face.
    // nudge = number → direct world-unit offset from the model face baseline;
    //                  no GAP constraint — any value works, including negatives
    //                  that bring the image inside the model.
    const finalX = baseX + (cfg.nudgeX ?? (lay?.defX ?? 0));
    const finalY = baseY + (cfg.nudgeY ?? 0);
    const finalZ = baseZ + (cfg.nudgeZ ?? (lay?.defZ ?? 0));

    // scaleW / scaleH multiply the slot dimensions; fitToSlot uses these values
    // so the image is letter/pillarboxed correctly within the scaled slot.
    const slotW = baseW * (cfg.scaleW ?? 1);
    const slotH = baseH * (cfg.scaleH ?? 1);

    // ── Build mesh ───────────────────────────────────────────────────────────
    // Geometry is created at the full (scaled) slot size; fitToSlot will shrink
    // the scale on one axis to match the image's actual pixel aspect ratio.
    const geo = new THREE.PlaneGeometry(slotW, slotH);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Rotation order YXZ: rotateY is applied first (swings which direction the
    // panel faces in the XZ plane) then X = −PI/2 lays it flat on the ground.
    mesh.rotation.set(-Math.PI / 2, cfg.rotateY ?? 0, 0, 'YXZ');

    mesh.position.set(finalX, finalY, finalZ);
    mesh.visible = false;
    mesh.name    = `collage:${cfg.id}`;
    mesh.raycast = () => {};  // prevent this plane from intercepting sprite raycasts

    scene.add(mesh);

    // ── Load texture ─────────────────────────────────────────────────────────
    loader.load(
      BASE_PATH + cfg.src,
      (tex) => {
        tex.colorSpace  = THREE.SRGBColorSpace;
        mat.map         = tex;
        mat.needsUpdate = true;

        // Once the image loads, correct mesh.scale to the image's pixel aspect
        // ratio.  This runs once (while the plane is still hidden) and never
        // again — nudge / scale tweaks do not need to retrigger this.
        fitToSlot(mesh, slotW, slotH, tex.image.width, tex.image.height);
      },
      undefined,
      (err) => { console.warn(`[collage] Failed to load ${cfg.src}:`, err); }
    );

    planes.push({ mesh, mat });
  });

  // ── Fade controller ──────────────────────────────────────────────────────
  function fade(toVisible) {
    const token = ++cancelToken;               // invalidate any running animation
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    if (toVisible) {
      // Make visible before opacity rises so the first painted frame isn't blank.
      for (const { mesh } of planes) mesh.visible = true;
    }

    const startOp = currentOpacity;
    const endOp   = toVisible ? 1 : 0;
    const t0      = performance.now();

    function tick() {
      if (cancelToken !== token) return;       // a newer fade call took over
      const p  = Math.min((performance.now() - t0) / FADE_MS, 1);
      const op = startOp + (endOp - startOp) * p;
      currentOpacity = op;
      for (const { mat } of planes) { mat.opacity = op; mat.needsUpdate = true; }
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        // Hide meshes after fade-out to stop them consuming draw calls.
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
