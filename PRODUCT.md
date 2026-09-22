# Product

## Register

product

## Users

1. Residents exploring estimated flood risk around roads, schools, public facilities, and neighborhoods — non-technical, need the score and its meaning at a glance.
2. Municipal planners and public-works staff identifying areas that may warrant closer engineering investigation — want the underlying factors, data provenance, and confidence, not just a color.
3. Congressional App Challenge judges evaluating technical depth in a ~3-minute live demo — need to see, at a glance, that this is a real engineered system (real data, real computed scores, documented limitations), not a wrapper.

## Product Purpose

FloodAI generates an interactive, continuously updating flood-risk heatmap with explainable 0-100 risk scores for a piloted real-world area (Village of Mamaroneck, NY), computed entirely from real public environmental data (USGS elevation, NLCD land cover, FEMA flood zones, OpenStreetMap roads/facilities/water). Every score is explainable: click any cell, road, or facility to see its real contributing factors, confidence, coverage tier, and data limitations. Success looks like a judge or planner immediately trusting that the numbers on screen are real and explained, not decorative.

## Brand Personality

Precise. Instrumented. Unshowy. This should read like a scientific/engineering telemetry panel or a calm quant terminal, not a startup product. Technical credibility over polish-for-its-own-sake; real data is given visual weight (monospace numerics, dense but organized readouts); nothing is decorative that doesn't carry information.

## Anti-references

- Generic AI-generated SaaS dashboard look: purple-to-blue gradients, glassy blur-everywhere cards, rounded-corner sameness, hero sections with a big gradient headline and three identical feature cards.
- Chatbot-style interface (explicitly excluded by the product spec — FloodAI is not a conversational assistant).
- Consumer weather-app cheerfulness (rounded mascot icons, bouncy motion, bright primary colors as decoration).
- Stock photography anywhere on analytical screens.

## Design Principles

1. **Every visual element must carry real information or get cut.** No decorative gradients, no filler stat tiles, no icon-plus-heading cards repeating the same three-part rhythm.
2. **Numbers are the interface.** Risk scores, confidence, factor contributions, and coverage tiers are the primary content — typography and layout should make them scannable at a glance (monospace for numeric readouts, clear tabular alignment), not buried inside soft card chrome.
3. **Never hide uncertainty.** Coverage tiers, missing-data warnings, and "this is an estimate, not a certainty" framing are load-bearing UI, not fine print — they should look intentional, not apologetic.
4. **Calm, not cold.** Dense and technical does not mean sterile — deliberate, restrained color (from the master spec's navy/slate + cyan/water + amber/magenta-for-comparison direction) and generous real whitespace around dense data keep it readable, not intimidating.
5. **Colorblind-safe and WCAG 2.2 AA everywhere**, per the product spec — this is a civic tool, not an internal admin panel; accessibility is a correctness requirement, not a stretch goal.

## Accessibility & Inclusion

WCAG 2.2 AA target: full keyboard navigation, visible focus states, ≥4.5:1 text contrast, colorblind-safe data visualization (the existing risk color ramp already avoids red-as-sole-carrier-of-meaning; labels/legend must always accompany color), respect for `prefers-reduced-motion`, and a non-map textual/tabular fallback for core map information (already planned; not yet built).
