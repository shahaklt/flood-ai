# AI Usage

This document is updated throughout the build with a specific, honest account of how Claude Code assisted development, distinguishing AI-assisted work from the student's own decisions, validation, and understanding. It is not complete until the project is complete — treat entries added so far as provisional.

## Phase 0 — Scaffolding

- Claude Code proposed the monorepo layout (directly following the project's master build spec), initialized the git repository, scaffolded the Next.js app via `create-next-app`, set up the Python virtual environment and dependency list, and diagnosed a local network issue (school-network DNS blocking `registry.npmjs.org`, worked around via the `registry.yarnpkg.com` mirror).
- Claude Code moved the student-provided Google Earth Engine service-account key to a private, git-ignored location and verified it against the Earth Engine API, surfacing the exact IAM permission the student's Google Cloud project was missing.
- Student-owned decisions still pending: reviewing and approving the pilot AOI boundary, reviewing the deterministic baseline's feature weights before they're treated as final, and personally validating every real data source cited in `docs/TRAINING_DATA_AUDIT.md`.
