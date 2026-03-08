const CONFIG = {
  modelPath: './models/nyc_topo_compressed.glb',

  // Model centroid in GLB metre space — subtracted to bring everything near origin
  originOffset: {
    x: 304789,
    y: -158,
    z: -61801
  },

  // Rhino's glTF exporter already converts Z-up → Y-up; no extra rotation needed
  rotateZUp: false,

  // 1 US survey foot = 1200/3937 m ≈ 0.30480061 m
  feetToMeters: 0.30480061,

  csvFiles: {
    cso: { path: './data/cso_2263_clipped.csv', color: 0x00FFFF, darkColor: 0xFF0000, label: 'CSO' },
    npdes: { path: './data/npdes_2263_clipped.csv', color: 0xFF3800, darkColor: 0x00FF00, label: 'NPDES' },
    rcra_2263_clipped: { path: './data/rcra_2263_clipped.csv', color: 0x515B28, darkColor: 0xB1C074, label: 'RCRA' }
  },

  marker: {
    screenSize: 0.008,
    worldSize: 80,
    heightOffset: 125
  },

  camera: {
    fov: 50,
    near: 1,
    far: 50000,
    orthoSize: 3000,
    initialZoom: 0.45,
    position: { x: 0, y: 2500, z: 4000 }
  },

  ambientIntensity: 0.2,
  directionalIntensity: 0.9,

  weatherApiUrl: ''
};

export default CONFIG;
