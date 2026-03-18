# Toxos Forensics 2026 — Codebase Overview

---

## Entry Point

**`index.html`**
The only HTML page. Defines the static shell: preloader, header, navigation bar, legend, tooltip placeholder, about/credits overlays, footer, and the narrative **Start / Back** buttons. All dynamic content (detail panels, dissected annotations, snap cursor) is injected by JavaScript at runtime. Links the three CSS files and loads `js/main.js` as an ES module.

---

## JavaScript (`js/`)

**`main.js`**
Application entry point and orchestrator. Runs on page load, calls all other modules in sequence, and wires everything together. Owns the preloader progress, the subnav click routing (Map / About / Credits / Collage), dark mode toggle logic, and the mode-switching state machine that shows/hides layers and updates body classes.

Also owns the **scroll-driven narrative system** (see below). If you want to change what happens when a nav item is clicked, or how the narrative scrolls work, this is the file.

**`viewer.js`**
Sets up the Three.js scene: orthographic camera, WebGL renderer, OrbitControls, lighting, and the render loop. Exports helpers used by `main.js` to shift the camera when a detail panel opens, animate the intro fly-in, and switch between standard and dissected/top-down camera angles.

Also owns the **wheel-event pipeline** that routes scroll input between three exclusive handlers in priority order: collage pan → narrative scroll → dissected tilt (see below). Touch on this file if you need to change camera behavior, lighting, renderer settings, or scroll/tilt math.

**`gltfLoader.js`**
Loads the NYC topographic GLB model (`models/nyc_topo.glb`) using GLTFLoader with Draco decompression. Also owns the dark/light mode texture crossfade — a custom GLSL shader lerps between two terrain texture variants (`gltf_embedded_0.png` / `gltf_embedded_0_light.png`) as the mode changes. Touch this file to change how the 3D model loads or how the terrain responds to dark mode.

**`csvLoader.js`**
Parses the three dataset CSV files and places sprite markers in the 3D scene. Converts EPSG:2263 coordinates (US survey feet) to Three.js world units. Each marker is a canvas-drawn circle textured onto a sprite. Marker sizes are kept constant on screen by rescaling every frame in the render loop. Touch this file to change marker appearance, coordinate handling, or how CSV columns are read.

**`terrainSnap.js`**
Post-processes every CSV dataset after loading by raycasting each sprite downward against the topographic mesh and placing it on the terrain surface. Uses a quantized XZ grid cache so that densely clustered points (e.g. the ~1,600 RCRA points) share cached ray hits rather than re-casting for every point. A second pass runs a Median Absolute Deviation (MAD) outlier check to clamp border sprites that accidentally hit side/skirt geometry back to the dataset median. Touch this file to change snapping resolution (`GRID_CELL`), outlier sensitivity (`MAD_THRESHOLD`), or the `heightOffset` logic.

**`detailPanel.js`**
Creates and manages the right-side detail card (desktop) / bottom sheet (mobile) that appears when a marker is clicked. Supports a stack of multiple open panels with prev/next navigation. Panels are draggable on desktop. Touch this file to change the layout, content, or behavior of the info card.

**`utils.js`**
Raycasting (translating mouse position to 3D marker hits), hover tooltips, marker selection/deselection, the snap cursor (crosshair that snaps to the nearest marker), double-tap detection for mobile, and the camera-framing helper that zooms to a selected point. Touch this file to change hover/click behavior or tooltip content.

**`labels.js`**
Adds CSS2D borough/river name labels and anchored scene images (the small thumbnails floating over the map) to the 3D scene. CSS2D means these are HTML elements positioned over the canvas by Three.js, not geometry. Touch this file to add, remove, or reposition map labels and floating images.

**`collage.js`**
Handles the Collage view mode. Loads flat image planes (`assets/images/collage-drawing*.png`) and positions them around the four sides of the model bounding box (North / East / South / West). Images fade in/out when Collage mode is toggled. The `COLLAGE_IMAGES` array at the top of this file is where images are configured and positioned.

**`apiWeather.js`**
Placeholder module for a future weather data integration. Currently does nothing functional. The API URL is set in `config/config.js` under `weatherApiUrl`.

---

## Scroll-Driven Narrative System

The site has a continuous, scroll-triggered cinematic experience separate from the nav-click modes. It is split across `viewer.js` (wheel routing, tilt math) and `main.js` (phase logic, dataset reveals, camera calls).

### Entry / Exit

| UI Element | Behavior |
|---|---|
| **Start** button (fixed, bottom-center) | Enters narrative; hides itself |
| **Back** button (fixed, bottom-center) | Visible only at narrative end (free mode) or on backward exit; calls `_exitNarrative()` |

Clicking **Start** locks OrbitControls, switches to phase 0 (Dissected view, CSO only), animates the camera to near-top-down (`goDissectedTopDown`), then hands control to the scroll handler once that animation completes.

Scrolling backward past −400 scroll units from the start also calls `_exitNarrative()`, which restores the Recorded/home state and re-enables controls.

### Scroll Phases

Total scroll range: **4,500 units** (3 phases × 1,500 units each).

| Scroll range | Phase | Mode applied | Camera |
|---|---|---|---|
| 0 – 1,500 | 0 — Dissected | Exploded layers, dark theme | Tilts from near-top-down to oblique |
| 1,500 – 3,000 | 1 — Fatberg | Flat view, white theme | Continues tilting |
| 3,000 – 4,500 | 2 — Remediated | Home layers, light theme | Continues tilting |
| ≥ 4,500 | Free | Remediated stays active | Tilt locked; rotate/pan re-enabled |

Within phase 0, the three datasets are revealed one at a time as sub-phases (each covering 500 scroll units): CSO → NPDES → RCRA. Only the active sub-phase group is visible; annotation lines and side panels update to match.

### Camera Tilt

The camera tilt angle (polar angle θ, in spherical coordinates relative to the orbit target) is driven linearly from `TILT_THETA_MIN` (≈ 0.05 rad, nearly top-down) to `TILT_THETA_MAX` (1.40 rad, ≈ 80° oblique) as scroll position moves from 0 to 4,500. Lerp factor per frame: 0.10, so the camera eases into the target angle.

The tilt system maintains the camera's azimuth angle (φ) as a constant — it only changes elevation, not horizontal direction. This keeps the model orientation consistent throughout the narrative.

In manual dissected mode (entered via nav, not narrative), scroll directly adjusts `_tiltTargetTheta` at a rate of `TILT_SPEED = 0.0007` per scroll unit, clamped to the same min/max range.

### Wheel-Event Routing (`viewer.js`)

Three wheel listeners are registered on the canvas in priority order (first registered = highest priority via `stopImmediatePropagation`):

1. **Collage pan** (`_onCollagePanWheel`) — active only in Collage mode; intercepts all scroll and pinch events for 2D pan/zoom, blocks OrbitControls.
2. **Narrative scroll** (`_onNarrativeWheel`) — active when `inNarrative = true`; calls the handler set by `setNarrativeScrollHandler(fn)` from `main.js`. If the handler returns `true`, the event is consumed (prevents OrbitControls zoom).
3. **Dissected tilt** (`_onTiltWheel`) — active when `_tiltActive = true` (manual dissected mode); adjusts tilt target directly, always calls `preventDefault`.

### Annotation Lines (Dissected / Narrative Phase 0)

Three annotation entries are created at startup (`_annData` in `main.js`): CSO (right side), NPDES (left side), RCRA (right side). Each has:
- An SVG `<line>` from the sprite's projected screen position to the text label
- An SVG `<circle>` dot at the sprite anchor point
- A `.diss-panel` DOM element with dataset name and body text

Lines are updated every frame via `_tickDissLines()` (runs its own `requestAnimationFrame` loop while `isDissected` is true). Clicking a panel toggles its dataset's visibility and dims the line/dot.

---

## Configuration (`config/`)

**`config/config.js`**
Single source of truth for all tunable parameters: model file path, coordinate origin offset, unit conversion factor, CSV file paths and dataset colors, marker sizing, camera defaults, and lighting intensities. Change values here rather than hunting through JS files. Dataset colors defined here must stay in sync with the CSS custom properties in `css/color.css`.

**`config/env.example.js`**
Template showing how to provide secret keys (e.g. a weather API key) without committing them to the repository. Copy to `config/env.js` and fill in real values.

---

## Stylesheets (`css/`)

**`css/color.css`**
All color definitions for the site. Edit this file to retheme colors without touching layout code. Contains `@property` declarations (required for CSS transitions on custom properties), light mode tokens in `:root`, dark mode overrides on `body.dark`, and dataset dot colors. Loaded before `style.css`.

**`css/style.css`**
All layout, component, and state styles. Covers the preloader, header, subnav, legend, tooltip, detail panel, overlays, footer, scene labels, dissected annotations, snap cursor, collage-mode and dissected-mode state overrides, the narrative Start/Back buttons, and responsive mobile rules. Uses CSS custom properties from `color.css` for all colors.

Key narrative-related rules:
- `.start-btn` / `#back-btn` — fixed bottom-center buttons; `.hidden` fades them out with pointer-events disabled
- `.ctrl-scroll-tilt` — shown only in `.dissected-mode`; hidden otherwise
- `.diss-svg`, `.diss-panels--right`, `.diss-panels--left` — annotation SVG and text panels; opacity transitions on/off
- `:is(.collage-mode, .fatberg-mode, .dissected-mode) .legend` — hides legend in non-map modes

**`css/threejs.css`**
Minimal styles scoped specifically to the Three.js canvas container (`.viewer-container`). Kept separate because these rules are coupled to the renderer's DOM structure rather than the page's UI components.

---

## Data (`data/`)

| File | Dataset | Points |
|---|---|---|
| `cso_2263_clipped.csv` | Combined Sewer Overflows | ~70 |
| `npdes_2263_clipped.csv` | Water Discharge Permits (NPDES) | ~80 |
| `rcra_2263_clipped.csv` | Hazardous Waste Facilities (RCRA) | ~1,600 |

All coordinates are in EPSG:2263 (New York State Plane, US survey feet). The loader converts them to metres for Three.js. After conversion, `terrainSnap.js` raycasts each marker onto the terrain surface.

---

## Assets (`assets/`)

| Path | Purpose |
|---|---|
| `assets/textures/gltf_embedded_0.png` | Dark mode terrain texture |
| `assets/textures/gltf_embedded_0_light.png` | Light mode terrain texture |
| `assets/textures/gltf_embedded_0.jpeg` | Original embedded texture (reference) |
| `assets/images/cso.jpg` / `npdes.jpg` / `rcra.jpg` | Thumbnail images shown in detail panels |
| `assets/images/IMG_1–4.jpg` | Scene images anchored to map locations |
| `assets/images/collage-drawing1–4.png` | Flat drawing planes for Collage mode |
| `assets/icons/marker_placeholder.png` | Fallback marker icon |

---

## 3D Model (`models/`)

**`models/nyc_topo.glb`** (67.5 MB)
Draco-compressed GLB of the NYC topographic model. Exported from Rhino with Z-up already converted to Y-up (Three.js convention). Coordinates are in EPSG:2263. The origin offset in `config/config.js` shifts the model centroid to near-zero in world space.
