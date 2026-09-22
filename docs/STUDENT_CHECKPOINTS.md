# Student Checkpoints

Per-phase checkpoints. Each is marked **pending** until the student has personally reviewed it — answers and hands-on tasks are not filled in on the student's behalf.

## Phase 0 — Repository scaffolding

**Status: pending student review**

1. What was built: monorepo skeleton (`apps/web` Next.js app, `services/risk`, `services/jev`, `scripts/data_pipeline`, `scripts/training`, `packages/shared`, `packages/risk-runtime`, `data/`, `docs/`), git repo connected to `shahaklt/flood-ai`, Python virtual environment with the geospatial/ML/API stack installed, a Google Earth Engine service-account credential wired up (pending one IAM permission grant).
2. Most important technical decision: keep Python (data/ML) and TypeScript (web/runtime) as separate toolchains sharing schemas through `packages/shared`, rather than one language end to end — this matches the spec's requirement that the trained model be exportable to the browser while training stays in Python's mature geospatial/ML ecosystem.
3. Plain-language explanation: think of this as building the empty rooms of a house before deciding what furniture goes in each — a folder for the map website, a folder for the data-science pipeline, a folder for shared vocabulary (type definitions) both sides agree on, so nothing gets built twice or inconsistently.
4. Questions the student should be able to answer before continuing:
   - Why are the data pipeline and the web frontend separate codebases instead of one?
   - What does a service-account key do differently from your own personal Google login, and why does that matter for an automated pipeline?
   - Why does `.gitignore` exclude raw downloaded rasters and credential files specifically?
5. Hands-on task: grant the Earth Engine service account the "Service Usage Consumer" IAM role on your GCP project (or confirm it's already done), and personally verify you can see the FloodAI repo's first commit on github.com.

## Phase 1 — Vertical slice

**Status: pending student review**

1. What was built: a real-data pipeline for a pilot AOI (Village of Mamaroneck, NY — real OSM boundary), pulling real USGS 3DEP elevation, NLCD 2021 land cover/impervious surface, OSM roads/facilities/water, and FEMA flood hazard zones; a 250 m analysis grid with real per-cell features; a deterministic, versioned baseline risk engine; and a live `/map` page (MapLibre GL, real basemap, Web Worker inference, hover/click, one rainfall scenario, coverage overlay, colorblind-safe legend).
2. Most important technical decision: fixing a real bug where MapLibre GL's own internal tile-decoding Web Worker never loaded under Turbopack (the map silently stayed blank — zero tile requests, zero console errors) by vendoring that worker bundle as a static asset and pointing `setWorkerUrl()` at it. This is exactly the kind of bug that looks like "the map is broken" but is actually a bundler/library integration mismatch — worth understanding, not just accepting the fix.
3. Plain-language explanation: every visible colored cell on the map is computed live, in your browser, by a small formula (the "baseline weights") applied to five real numbers per 250 m square — elevation relative to its neighbors, slope, distance to water, whether FEMA already flags it as a flood zone, and how much impervious (paved/roofed) surface covers it. Nothing is looked up from a pre-baked answer key; change the rainfall dropdown and the whole map recomputes.
4. Questions the student should be able to answer before continuing:
   - Why does the baseline engine report `scoreMeaning: "relative_risk_index"` instead of a probability, and what would have to be true for that to change?
   - Two factors are always listed under "Data limitations" for every cell — which two, and why weren't they computed for this pilot?
   - Why is inference run in a Web Worker instead of directly in the React component?
5. Hands-on task: open `/map`, click at least three cells with visibly different colors, and for each one personally check whether the listed top contributing factor makes sense given what you know about that specific location in Mamaroneck (e.g. near the water, near a hill, near downtown pavement).

## Phase 2 — Full real data pipeline

**Status: not started**
