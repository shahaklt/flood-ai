# FloodAI

FloodAI generates an interactive, continuously updating flood-risk heatmap with explainable 0–100 risk scores for a piloted area of Westchester County, NY, then uses Jev as a secondary decision layer to evaluate possible prevention interventions.

FloodAI is a planning, education, and prioritization prototype. It does not replace official flood maps, emergency alerts, engineering studies, or instructions from public authorities.

**Status: early build, in progress.** This README is updated as each phase lands. See `docs/STUDENT_CHECKPOINTS.md` for a running log of what's built and what's pending student review.

## Repository layout

```text
apps/web                 Next.js frontend
services/risk            FastAPI risk/scenario service
services/jev             Server-only Jev (TypeSafe) intervention-assessment adapter
scripts/data_pipeline    Real-data ingestion, feature engineering, tiling
scripts/training         Model training, evaluation, calibration, export
packages/shared          Shared schemas/types/constants
packages/risk-runtime    Browser-compatible prediction/explanation runtime
data/demo                Small versioned demonstration data (real, clearly labeled)
data/metadata            Dataset manifests and provenance (data/metadata/sources.json)
data/models              Versioned model cards and small deployable model artifacts
docs                     Product, architecture, methodology, and process documentation
tests                    Cross-package test fixtures
```

## Data policy

Every dataset used by FloodAI is real public data with recorded provenance in `data/metadata/sources.json`. No synthetic or fabricated data is used anywhere in the app or in model training. If a source cannot be obtained or does not support a defensible supervised model, FloodAI ships the deterministic, feature-based baseline instead of inventing labels — see `docs/TRAINING_DATA_AUDIT.md`.

## Setup

```bash
# Node side
npm install

# Python side (data pipeline, training, risk service)
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/risk/requirements.txt
```

Copy `.env.example` to `.env.local` (web) and `.env` (services) and fill in real values. Never commit filled env files or credential JSON files.

## Running the web app

```bash
npm run dev:web
```

More setup and demo instructions are added as each phase lands.
