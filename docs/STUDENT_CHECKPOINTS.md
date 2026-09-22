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

**Status: not started**
