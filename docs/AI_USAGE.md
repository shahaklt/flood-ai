# AI Usage

This document is updated throughout the build with a specific, honest account of how Claude Code assisted development, distinguishing AI-assisted work from the student's own decisions, validation, and understanding. It is not complete until the project is complete — treat entries added so far as provisional.

## Phase 0 — Scaffolding

- Claude Code proposed the monorepo layout (directly following the project's master build spec), initialized the git repository, scaffolded the Next.js app via `create-next-app`, set up the Python virtual environment and dependency list, and diagnosed a local network issue (school-network DNS blocking `registry.npmjs.org`, worked around via the `registry.yarnpkg.com` mirror).
- Claude Code moved the student-provided Google Earth Engine service-account key to a private, git-ignored location and verified it against the Earth Engine API, surfacing the exact IAM permission the student's Google Cloud project was missing.
- Student-owned decisions still pending: reviewing and approving the pilot AOI boundary, reviewing the deterministic baseline's feature weights before they're treated as final, and personally validating every real data source cited in `docs/TRAINING_DATA_AUDIT.md`.

## Phase 1 — Real-data pilot pipeline and vertical slice

- Claude Code chose the pilot AOI (Village of Mamaroneck, NY) based on its documented real flood history, wrote the adapters that pull real USGS 3DEP, NLCD, OSM, and FEMA NFHL data for that AOI via public REST/Overpass endpoints, and derived the 250 m real feature grid.
- Claude Code designed and implemented the deterministic baseline risk formula, its versioned weights file, and the browser risk-runtime, including the confidence-penalty logic for the two factors (flow accumulation, soil infiltration) not yet computed.
- Claude Code diagnosed and fixed a real bundler bug (MapLibre GL's internal worker never loading under Turbopack, leaving the map blank with no console errors) by testing directly in a real browser via Playwright, inspecting the live map instance, and tracing it to a missing worker asset.
- Student-owned decisions still pending: personally verifying the pilot AOI choice and its flood-history justification, reviewing the baseline weight values in `packages/shared/src/baselineWeights.ts` and deciding whether they reflect the student's own judgment of what matters most for this area, and testing `/map` themselves rather than trusting this account of it.
