import * as THREE from 'three';

const BASE_PATH = './assets/images/';

const GAP        = 510;
const CORNER_GAP = 300;
const FADE_MS    = 680;

// ── IMAGE CATALOGUE ──────────────────────────────────────────────────────────
// nudgeX/Y/Z: world-unit offset from the model face baseline. null = auto-default.
// scaleW/scaleH: slot dimension multipliers. rotateY: Y-axis rotation in radians.
//
// For indices 0–3, the plane is anchored at the corresponding model face (N/E/S/W).
// For index 4+, provide x, z, pw, ph for a fully manual layout.
const COLLAGE_IMAGES = [

  // INDEX 0 · NORTH
  {
    id:  'drawing1',
    src: 'collage-drawing1.png',
    nudgeX:  null,
    nudgeY:  null,
    nudgeZ:  null,
    scaleW:  1,
    scaleH:  1,
    rotateY: 0,
  },

  // INDEX 1 · EAST
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

  // INDEX 2 · SOUTH
  {
    id:  'drawing3',
    src: 'collage-drawing3.png',
    nudgeX:  null,
    nudgeY:  0,
    nudgeZ:  null,
    scaleW:  1,
    scaleH:  1,
    rotateY: 0,
  },

  // INDEX 3 · WEST
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

  // INDEX 4+ · FULLY MANUAL (provide x/z/pw/ph):
  // {
  //   id:  'drawing5',
  //   src: 'collage-drawing5.jpg',
  //   x:  0, z:  0, pw: 3000, ph: 2000,
  //   nudgeX: 0, nudgeY: 0, nudgeZ: 0, rotateY: 0,
  // },

];

function computeLayouts(modelBox) {
  const center = modelBox.getCenter(new THREE.Vector3());
  const size   = modelBox.getSize(new THREE.Vector3());
  const hx     = size.x / 2;
  const hz     = size.z / 2;
  const groundY = modelBox.min.y;
  const D = Math.max(size.x, size.z);
  const ns_w = Math.max(0, 2 * (hx + GAP) - 2 * CORNER_GAP);
  const ew_w = Math.max(0, 2 * (hz + GAP) - 2 * CORNER_GAP);
  const def = GAP + D / 2;

  return [
    { x: center.x,      y: groundY, z: center.z - hz, pw: ns_w, ph: D,    defX:    0, defZ: -def },
    { x: center.x + hx, y: groundY, z: center.z,      pw: D,    ph: ew_w, defX:  def, defZ:    0 },
    { x: center.x,      y: groundY, z: center.z + hz, pw: ns_w, ph: D,    defX:    0, defZ:  def },
    { x: center.x - hx, y: groundY, z: center.z,      pw: D,    ph: ew_w, defX: -def, defZ:    0 },
  ];
}

function fitToSlot(mesh, slotW, slotH, imgW, imgH) {
  if (!imgW || !imgH) return;
  const imgAspect  = imgW / imgH;
  const slotAspect = slotW / slotH;

  if (imgAspect > slotAspect) {
    mesh.scale.set(1, slotAspect / imgAspect, 1);
  } else {
    mesh.scale.set(imgAspect / slotAspect, 1, 1);
  }
}

export function createCollagePlanes(scene, modelBox) {
  const loader  = new THREE.TextureLoader();
  const layouts = computeLayouts(modelBox);
  const planes  = [];

  console.log(
    '[collage] Auto-default nudge values (world units from each model face):\n' +
    `  North (index 0): nudgeZ = ${layouts[0].defZ.toFixed(0)}\n` +
    `  East  (index 1): nudgeX = ${layouts[1].defX.toFixed(0)}\n` +
    `  South (index 2): nudgeZ = ${layouts[2].defZ.toFixed(0)}\n` +
    `  West  (index 3): nudgeX = ${layouts[3].defX.toFixed(0)}`
  );

  let currentOpacity = 0;
  let cancelToken    = 0;
  let rafId          = null;

  COLLAGE_IMAGES.forEach((cfg, i) => {

    let baseX, baseY, baseZ, baseW, baseH;
    let lay = null;

    if (cfg.pw !== undefined && cfg.ph !== undefined) {
      const center = modelBox.getCenter(new THREE.Vector3());
      baseX = cfg.x  ?? center.x;
      baseY = cfg.y  ?? modelBox.min.y;
      baseZ = cfg.z  ?? center.z;
      baseW = cfg.pw;
      baseH = cfg.ph;
    } else {
      lay = layouts[i];
      if (!lay) {
        console.warn(`[collage] No auto-layout for image index ${i} ("${cfg.id}"). Add x, z, pw, ph to position it manually.`);
        return;
      }
      baseX = lay.x;
      baseY = lay.y;
      baseZ = lay.z;
      baseW = lay.pw;
      baseH = lay.ph;
    }

    const finalX = baseX + (cfg.nudgeX ?? (lay?.defX ?? 0));
    const finalY = baseY + (cfg.nudgeY ?? 0);
    const finalZ = baseZ + (cfg.nudgeZ ?? (lay?.defZ ?? 0));

    const slotW = baseW * (cfg.scaleW ?? 1);
    const slotH = baseH * (cfg.scaleH ?? 1);

    const geo = new THREE.PlaneGeometry(slotW, slotH);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(-Math.PI / 2, cfg.rotateY ?? 0, 0, 'YXZ');
    mesh.position.set(finalX, finalY, finalZ);
    mesh.visible = false;
    mesh.name    = `collage:${cfg.id}`;
    mesh.raycast = () => {};

    scene.add(mesh);

    loader.load(
      BASE_PATH + cfg.src,
      (tex) => {
        tex.colorSpace  = THREE.SRGBColorSpace;
        mat.map         = tex;
        mat.needsUpdate = true;
        fitToSlot(mesh, slotW, slotH, tex.image.width, tex.image.height);
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
