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

  // Always-on datasets — loaded at startup, toggled by fadeOverlays per phase.
  csvFiles: {
    cso:              { path: './data/cso_2263_clipped.csv',    color: 0x00FFFF, darkColor: 0xFF0000, label: 'CSO'   },
    npdes:            { path: './data/npdes_2263_clipped.csv',  color: 0xFF3800, darkColor: 0x00FF00, label: 'NPDES' },
    rcra_2263_clipped:{ path: './data/rcra_2263_clipped.csv',   color: 0xFFFF00, darkColor: 0xFFFF00, label: 'RCRA'  },
  },

  // Phase-specific datasets — each only shown on the listed phase numbers.
  // To add a new dataset: add an entry here with its path, color, label, and phases array.
  phaseDatasets: [
    { path: './data/boa_planningareas.csv',  color: 0xA020F0, darkColor: 0xA020F0, label: 'BOA',          phases: [9],  showPoints: false },
    { path: './data/slr_100years.csv',       color: 0xFF6600, darkColor: 0xFF6600, label: 'SLR',          phases: [3],  showPoints: false },
    { path: './data/greenstreets_data.csv',  color: 0x00FF44, darkColor: 0x00FF44, label: 'Greenstreets', phases: [10], showPoints: false },
    { path: './data/dohmh_data.csv',          color: 0xFF69B4, darkColor: 0xFF69B4, label: 'DOHMH',        phases: [11], showPoints: true  },
    { path: './data/e-designations_data.csv', color: 0x8B4513, darkColor: 0x8B4513, label: 'E-Designations', phases: [7],  showPoints: true  },
  ],

  // Phase-specific polygon layers — reconstructed from vertex CSV files.
  // To add a new polygon layer: append an entry with path, color, opacity, outline, and phases.
  phasePolygons: [
    { path: './data/boa_planningareas.csv',  color: 0xA020F0, opacity: 0.3, outline: true, phases: [9]  },
    { path: './data/slr_100years.csv',       color: 0xFF6600, opacity: 0.3, outline: true, phases: [3]  },
    { path: './data/greenstreets_data.csv',  color: 0x00FF44, opacity: 0.3, outline: true, phases: [10] },
  ],

  marker: {
    screenSize: 0.003, // size of point sprites in screen space (independent of zoom)
    worldSize: 80,
    heightOffset: 25 //125 z-height of the data sets
  },

  camera: {
    fov: 50,
    near: 1,
    far: 50000,
    orthoSize: 3000,
    initialZoom: 0.99,   // ← fraction of viewport the model fills in the interactive state; higher = more zoomed in
    narrativeZoom: 0.92, // ← zoom multiplier during narrative scroll (relative to initialZoom); lower = smaller model
    exploreZoom:   1.25, // ← zoom multiplier for phase-5 / phase-8 "Explore Model" interstitials
    position: { x: 0, y: 2500, z: 4000 }
  },

  ambientIntensity: 0.2,
  directionalIntensity: 0.9,

  weatherApiUrl: ''
};

export default CONFIG;
