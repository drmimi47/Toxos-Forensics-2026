# Toxos Forensics 2026 — Codebase Overview

---

## Entry Point

**`index.html`**
Static shell: preloader, header (brand mark + `>>-->` nav arrow button), legend, tooltip placeholder, nav-menu overlay, about/credits overlays, footer, and Start/Back buttons. All dynamic content is injected at runtime. Links the three CSS files and loads `js/main.js` as an ES module.

---

## JavaScript (`js/`)

**`main.js`**
Orchestrator. Runs on page load, calls all other modules, and wires everything together. Owns the preloader, mode-switching state machine (`recorded / dissected / fatberg / remediated / collage`), nav-arrow menu handlers, and the **scroll-driven narrative system** (see below). Start/Back/brand-mark click logic lives here. If you want to change what happens when a nav item is clicked or how the narrative scrolls work, this is the file.

**`viewer.js`**
Three.js scene: orthographic camera, WebGL renderer, OrbitControls, lighting, and render loop. Exports camera animation helpers (`goHome`, `goDissectedView`, `goFatbergView`, `goTopDown`), the `setPanelShift` / `snapPanelShift` frustum-shift system, and the wheel-event pipeline (collage pan → narrative scroll → dissected tilt, in priority order). Touch this file for camera behavior, lighting, renderer settings, or scroll/tilt math.

**`narrativeText.js`**
Narrative content and right-side panel. Defines `NARRATIVE_CONTENT` (keys: `phase-0`, `phase-1-cso`, `phase-1-npdes`, `phase-1-rcra`, `phase-2`, `phase-3`). `setNarrativeContent(key)` fades out the current text and fades in the new content. The panel is hidden outside narrative mode via CSS.

**`gltfLoader.js`**
Loads the NYC topographic GLB with Draco decompression. Owns the dark/light mode texture crossfade — a GLSL shader lerps between two terrain texture variants as mode changes. Touch this file to change how the 3D model loads or how the terrain responds to dark mode.

**`csvLoader.js`**
Parses the three dataset CSVs and places sprite markers in the scene. Converts EPSG:2263 (US survey feet) to Three.js world units. Marker sizes stay constant on screen via per-frame rescaling. Touch this file to change marker appearance, coordinate handling, or CSV column mapping.

**`terrainSnap.js`**
Post-processes every CSV dataset by raycasting each sprite downward onto the terrain surface. Uses a quantized XZ grid cache for performance on dense datasets (e.g. ~1,600 RCRA points). A MAD outlier pass clamps border sprites that hit side geometry back to the dataset median. Touch this file to change snapping resolution (`GRID_CELL`), outlier sensitivity (`MAD_THRESHOLD`), or height offset logic.

**`detailPanel.js`**
Right-side detail card (desktop) / bottom sheet (mobile) shown when a marker is clicked. Supports a draggable stack of multiple open panels with prev/next navigation. `closeAllDetails()` is exported for use by Start/Back/ESC.

**`utils.js`**
Raycasting (mouse → 3D marker hits), marker selection/deselection, the snap cursor (crosshair snapping to nearest marker), double-tap detection, and the `frameBoundingBox` camera-framing helper. Touch this file to change hover/click behavior.

**`labels.js`**
CSS2D borough/river name labels and anchored scene images floating over the map. Labels are hidden during narrative scroll phases and restored at interactive states. Touch this file to add, remove, or reposition map labels and floating images.

**`collage.js`**
Collage view mode. Loads flat image planes and positions them around the four sides of the model bounding box. `COLLAGE_IMAGES` at the top of this file is where images are configured.

**`apiWeather.js`**
Placeholder for a future weather API integration. Currently non-functional. API URL slot in `config/config.js → weatherApiUrl`.

---

## Scroll-Driven Narrative System

Split across `viewer.js` (wheel routing, tilt math) and `main.js` (phase logic, dataset reveals, camera calls).

### Entry / Exit

| UI Element | Behavior |
|---|---|
| **Start** button | Enters narrative; locks controls; applies phase 0 |
| **Back** button | Visible at narrative end or on backward exit; calls `_exitNarrative()` |
| **Brand mark** / **Map** nav (if in narrative) | Also calls `_exitNarrative()` |

Scrolling backward past −400 units from start also exits via `_exitNarrative()`.

### Scroll Phases

Total scroll range: **6,000 units** (4 phases × 1,500 units).

| Scroll range | Phase | Mode | Camera |
|---|---|---|---|
| 0 – 1,500 | 0 — All data exploded | All 3 datasets visible, dark theme | Default angle → tilts toward top-down |
| 1,500 – 3,000 | 1 — Dissected reveal | CSO → NPDES → RCRA sequentially | Continues tilting |
| 3,000 – 4,500 | 2 — Fatberg | Flat view, dark theme | Continues tilting |
| 4,500 – 6,000 | 3 — Remediated | Home layers, light theme | Continues tilting |
| ≥ 6,000 | Free | Remediated stays active | Tilt locked; rotate/pan re-enabled |

Within phase 1, three sub-phases (500 units each) reveal CSO → NPDES → RCRA one at a time with annotation lines and side panels.

### Camera Tilt

Polar angle θ is driven linearly from `TILT_THETA_MIN` (≈ 0.05 rad, near top-down) toward `TILT_THETA_MAX` (1.40 rad, ≈ 80° oblique) across the full scroll range. The tilt lerps at 0.10/frame and holds azimuth constant throughout.

During Start, the model frustum shifts left (`PANEL_PX` in `viewer.js`) to make room for the narrative text panel on the right. The frustum snaps back on exit.

### Annotation Lines (Phase 0–1)

Three `_annData` entries (`_annData` in `main.js`): CSO (right), NPDES (left), RCRA (right). Each has an SVG `<line>` from the sprite's projected screen position to the text panel. Updated every frame by `_tickDissLines()`. Clicking a panel toggles that dataset's visibility.

---

## Configuration (`config/`)

**`config/config.js`**
Single source of truth for tunable parameters: model path, coordinate origin offset, unit conversion, CSV paths and colors, marker sizing, and camera defaults (`initialZoom`, `narrativeZoom`). Dataset colors here must stay in sync with `css/color.css`.

---

## Stylesheets (`css/`)

**`css/color.css`**
All color tokens. Light mode in `:root`, dark mode overrides on `body.dark`. `@property` declarations required for CSS transitions on custom properties. `--bg-dark` is also set per-frame from JS (`tickModeFrame`) so the body background stays in sync with the Three.js scene background.

**`css/style.css`**
All layout and component styles: preloader, header, legend, detail panels, overlays (credits, about, nav-menu), footer, dissected annotations, snap cursor, narrative panel, Start/Back buttons, and responsive mobile rules.

**`css/threejs.css`**
Minimal styles for the Three.js canvas container (`.viewer-container`). The canvas is always full-width; model position is shifted via frustum offset, not CSS.

---

## Data (`data/`)

| File | Dataset | Points |
|---|---|---|
| `cso_2263_clipped.csv` | Combined Sewer Overflows | ~70 |
| `npdes_2263_clipped.csv` | Water Discharge Permits (NPDES) | ~80 |
| `rcra_2263_clipped.csv` | Hazardous Waste Facilities (RCRA) | ~1,600 |

All coordinates in EPSG:2263 (New York State Plane, US survey feet), converted to metres for Three.js.

---

## Assets (`assets/`)

| Path | Purpose |
|---|---|
| `assets/textures/gltf_embedded_0.png` | Dark mode terrain texture |
| `assets/textures/gltf_embedded_0_light.png` | Light mode terrain texture |
| `assets/images/cso.jpg` / `npdes.jpg` / `rcra.jpg` | Thumbnails in detail panels |
| `assets/images/IMG_1–4.jpg` | Scene images anchored to map locations |
| `assets/images/collage-drawing1–4.png` | Flat drawing planes for Collage mode |

---

## 3D Model (`models/`)

**`models/nyc_topo_compressed.glb`** (67.5 MB)
Draco-compressed GLB of NYC topography. Exported from Rhino, Z-up → Y-up already converted. Coordinates in EPSG:2263; origin offset in `config/config.js` shifts the centroid to near-zero in world space.
