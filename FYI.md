# Toxos Forensics 2026 — Codebase Overview

---

## Entry Point

**`index.html`**
The only HTML page. Defines the static shell: preloader, header, navigation bar, legend, tooltip placeholder, about/credits overlays, and footer. All dynamic content (detail panels, dissected annotations, snap cursor) is injected by JavaScript at runtime. Links the three CSS files and loads `js/main.js` as an ES module.

---

## JavaScript (`js/`)

**`main.js`**
Application entry point and orchestrator. Runs on page load, calls all other modules in sequence, and wires everything together. Owns the preloader progress, the subnav click routing (About / Collage / Fatberg / Recorded / Remediated / Dissected / Credits), dark mode toggle logic, and the mode-switching state machine that shows/hides layers and updates body classes. If you want to change what happens when a nav item is clicked, this is the file.

**`viewer.js`**
Sets up the Three.js scene: orthographic camera, WebGL renderer, OrbitControls, lighting, and the render loop. Exports helpers used by main.js to shift the camera when a detail panel opens, animate the intro fly-in, and switch between standard and dissected/top-down camera angles. Touch on this file if you need to change camera behavior, lighting, or renderer settings.

**`gltfLoader.js`**
Loads the NYC topographic GLB model (`models/nyc_topo.glb`) using GLTFLoader with Draco decompression. Also owns the dark/light mode texture crossfade — a custom GLSL shader lerps between two terrain texture variants (`gltf_embedded_0.png` / `gltf_embedded_0_light.png`) as the mode changes. Touch this file to change how the 3D model loads or how the terrain responds to dark mode.

**`csvLoader.js`**
Parses the three dataset CSV files and places sprite markers in the 3D scene. Converts EPSG:2263 coordinates (US survey feet) to Three.js world units. Each marker is a canvas-drawn circle textured onto a sprite. Marker sizes are kept constant on screen by rescaling every frame in the render loop. Touch this file to change marker appearance, coordinate handling, or how CSV columns are read.

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
All layout, component, and state styles. Covers the preloader, header, subnav, legend, tooltip, detail panel, overlays, footer, scene labels, dissected annotations, snap cursor, and responsive mobile rules. Uses CSS custom properties from `color.css` for all colors.

**`css/threejs.css`**
Minimal styles scoped specifically to the Three.js canvas container (`.viewer-container`). Kept separate because these rules are coupled to the renderer's DOM structure rather than the page's UI components.

---

## Data (`data/`)

| File | Dataset | Points |
|---|---|---|
| `cso_2263_clipped.csv` | Combined Sewer Overflows | ~70 |
| `npdes_2263_clipped.csv` | Water Discharge Permits (NPDES) | ~80 |
| `rcra_2263_clipped.csv` | Hazardous Waste Facilities (RCRA) | ~1,600 |

All coordinates are in EPSG:2263 (New York State Plane, US survey feet). The loader converts them to metres for Three.js.

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
