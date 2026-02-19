/**
 * config.js – Central configuration for the viewer.
 *
 * The GLB was exported from Rhino in EPSG:2263 (NY State Plane, US survey feet)
 * but glTF uses METRES with Y-up.  Rhino's exporter already applied the
 * Z-up → Y-up rotation and the feet → metres conversion, so GLB coordinates are:
 *
 *   glTF X  =  EPSG_X  × 0.3048   (feet → metres)
 *   glTF Y  =  EPSG_Z  × 0.3048   (elevation)
 *   glTF Z  = −EPSG_Y  × 0.3048   (sign flip from Z-up → Y-up)
 *
 * Coordinates are still large (~300 000 m) so we subtract an origin offset
 * (model centroid) to bring everything near (0, 0, 0).
 */

const CONFIG = {
  /* ---- Model ---- */
  modelPath: './models/nyc_topo.glb',

  /**
   * Scene-origin offset in the GLB's metre coordinate space.
   * This is roughly the centroid of the model's bounding box.
   */
  originOffset: {
    x: 304789,     // model centre X  (metres)
    y: -158,       // model centre Y  (elevation, metres)
    z: -61801      // model centre Z  (metres)
  },

  /**
   * Rhino's glTF exporter already converts Z-up → Y-up.
   * Set to false so we do NOT apply an extra rotation.
   */
  rotateZUp: false,

  /**
   * EPSG:2263 uses US survey feet.
   * 1 US survey foot = 1200/3937 m ≈ 0.30480061 m
   */
  feetToMeters: 0.30480061,

  /* ---- CSV Data ---- */
  csvFiles: {
    cso:              { path: './data/cso_2263_clipped.csv',   color: 0x00FFFF, darkColor: 0x0000FF, label: 'CSO' },
    npdes:            { path: './data/npdes_2263_clipped.csv',  color: 0xFF3800, darkColor: 0xFF006F, label: 'NPDES' },
    rcra_2263_clipped:{ path: './data/rcra_2263_clipped.csv',  color: 0x515B28, darkColor: 0xB1C074, label: 'RCRA' }
  },

  /* ---- Point marker settings ---- */
  marker: {
    screenSize: 0.008,   // sprite scale when sizeAttenuation=false (perspective)
    worldSize: 80,       // sprite scale in world units for ortho camera
    heightOffset: 3     // lift markers slightly above terrain (metres)
  },

  /* ---- Camera defaults (metres) ---- */
  camera: {
    fov: 50,
    near: 1,
    far: 50000,
    orthoSize: 3000,
    initialZoom: 0.45,  // frustum padding after framing model – lower = more zoomed in
    position: { x: 0, y: 2500, z: 4000 }
  },

  /* ---- Lighting ---- */
  ambientIntensity: 0.2,
  directionalIntensity: 0.9,

  /* ---- Weather API (future) ---- */
  weatherApiUrl: ''
};

export default CONFIG;
