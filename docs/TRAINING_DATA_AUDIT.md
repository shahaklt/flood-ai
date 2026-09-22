# Training Data Audit

This document compares every candidate label/feature source considered for FloodAI's pilot area (Village of Mamaroneck, NY), per the project spec's requirement to justify the training-data strategy before training anything. It is updated as the pipeline grows past the pilot.

## Candidate sources evaluated

### Global Flood Database v1 (GLOBAL_FLOOD_DB/MODIS_EVENTS/V1)

- **What it represents**: Real, satellite-observed (MODIS) surface inundation for 913 major mapped flood events worldwide, 2000-2018 (Tellman et al. 2021).
- **Resolution**: ~250 m/pixel, event-based (not continuous time series).
- **Coverage for this pilot**: Queried directly via Earth Engine (`scripts/data_pipeline/sources/gfd_labels.py`). **9 real events** intersect the pilot AOI's bounding region. Of those, **3 events show actual positive flooded pixels within the pilot AOI itself**: a March 2010 nor'easter (DFO_3625, 368 flooded pixels), a late-March 2010 event (DFO_3629, 298 pixels), and Hurricane Irene, August 2011 (DFO_3861, 315 pixels) — all real, well-documented flooding events for this part of coastal Westchester County. The other 6 events' broader footprints do not show inundation specifically within this small AOI.
- **Observed vs. modeled**: Observed (satellite-derived), not modeled or synthetic.
- **Known biases**: Cloud cover and vegetation can obscure real flooding (mitigated by the `clear_perc`/`clear_views` quality bands, which must gate which cells count as valid negatives); MODIS's coarse native resolution means small, localized pluvial flooding may not register even when real.
- **Leakage risk**: None from post-event imagery as a feature — only the pre-event static features (elevation, land cover, etc.) and event metadata (rainfall/date) are used as inputs; the flood mask is the label, never a feature.
- **Licensing**: Research/public use with attribution (Global Flood Database terms).
- **Suitability**: **Primary real label source for supervised training**, exactly as the spec's default strategy prescribes — but only 3 usable positive events for this specific small pilot AOI. This is a small-N problem: enough to build and validate a real, non-fabricated training pipeline, not enough (alone) for a statistically robust statewide model. See "Decision" below.

### NYC Stormwater Flood Maps / NYC 311 Street Flooding reports

- **What they represent**: City-modeled pluvial flood extents (Stormwater Flood Maps) and self-reported street flooding incidents (311), both real New York City data.
- **Coverage for this pilot**: Zero — the pilot AOI (Mamaroneck, Westchester County) is outside NYC and outside these datasets' coverage. Not usable for this specific pilot; would become relevant if/when the pilot expands to include NYC.
- **Status**: Not yet pulled (no adapter written) because they don't cover the current pilot AOI. Documented here so the gap is explicit rather than silently absent.

### FEMA National Flood Hazard Layer

- **What it represents**: FEMA's own official flood-hazard zone determination (regulatory mapping, not a direct observation of a specific event).
- **Coverage for this pilot**: Full coverage — 574 real zone polygons pulled for the pilot AOI (`data/raw/fema_flood_zones.geojson`).
- **Used as**: A **context/predictor feature** (`femaSfha`), never as the training label — per spec, using FEMA's own determination as both feature and reproduced label would be circular, not a genuine test of the model.

### OpenFEMA NFIP Redacted Claims

- **Status**: Not yet pulled. Coordinates are deliberately low-precision (per FEMA's redaction policy) and would need coarse spatial aggregation to be used honestly; deferred until the pipeline needs a regional trend-comparison signal, which is not yet the case at this pilot's scale.

### Verified community historical flood reports

- **Status**: Not yet collected (the `/reports` submission page has not been built yet — planned for a later phase). Per spec, these would never feed the production model directly; they'd need moderation, deduplication, and versioning first.

## Decision

Given the 3 real, geographically-relevant positive events found above, the pilot pipeline will:

1. Build a real event-cell training table from the 3 positive GFD events (DFO_3625, DFO_3629, DFO_3861) plus their genuinely-observed negative cells (valid, non-permanent-water, non-flooded, adequately-observed cells within each event's footprint) — never fabricating negatives for unobserved areas.
2. Because 3 events for one small AOI is a small sample, this supervised model is evaluated and reported honestly as **experimental / pilot-scale**, not a fully validated statewide model. Its coverage tier is reported as `experimental_transfer` (or the deterministic baseline is kept as the default shown to users), and `docs/EVALUATION.md` states this limitation explicitly rather than overstating confidence.
3. The deterministic baseline (`docs/METHODOLOGY.md`, `packages/shared/src/baselineWeights.ts`) remains available and is the default shown in the UI unless/until the supervised model's real, computed evaluation metrics justify surfacing it as primary.
4. As the pipeline expands to more of Westchester/New York State (see `docs/STUDENT_CHECKPOINTS.md` stretch goals), more real GFD events and, if the pilot area is extended into NYC, the Stormwater/311 layers become available, which is expected to substantially increase the usable positive/negative sample size.

This is not a workaround — it is exactly the spec's own required behavior: real audited data drives the decision, and the system never invents labels to force a bigger model than the real data supports.

## Update: statewide expansion

Step 4 above has since happened. Querying the real Global Flood Database against the entire real New York State boundary (not the small pilot bbox) found **33 real events intersecting New York** (vs. 9 for the pilot bbox), of which **24 produced usable event-cell rows** after excluding permanent water and low-observation-quality pixels (`scripts/data_pipeline/sources/gfd_labels_nystate.py`, `scripts/training/build_statewide_training_table.py`).

- **Resolution tradeoff**: statewide labels are downloaded at 2000 m/pixel rather than the pilot's 250 m, because Earth Engine's synchronous `getDownloadURL` hits a real server-side "User memory limit exceeded" error on a region this large at finer scales (measured: 1000 m fails, 2000 m succeeds). Real features are sampled at the same coarse scale for consistency — not presenting false statewide precision.
- **A real new gap, found and documented rather than hidden**: `distanceToWaterM` is missing for 96% of statewide rows because the OSM Overpass water query reliably times out on the much larger z=9 tile bounding boxes used for statewide feature extraction (it works fine at the pilot's smaller z=13 scale). The statewide model drops this feature rather than imputing a fabricated value. USGS NHD flowlines (not Overpass-dependent) are the likely real fix, not yet implemented.
- **Result**: 6,830 usable real rows, 1,130 real positives (16.5% — far more balanced than the pilot's 1.1%), across 24 real events and 81 real tiles. See `docs/EVALUATION.md` for the resulting model comparison.
