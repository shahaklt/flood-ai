# Design

## Visual Theme

Dark instrument-panel default (this is a live data tool read in a demo/planning context, often projected or screen-shared — dark reduces glare and makes the risk-color ramp read with more contrast than it would on white). Deep near-black navy background, slate surfaces one step up, no gradients as background fill. Color is reserved for data (risk ramp, coverage states) and one accent (cyan) for interactive/informational chrome — never decorative.

## Color (OKLCH)

```css
--bg:          oklch(0.16 0.02 250);   /* near-black navy, base canvas */
--surface:     oklch(0.21 0.02 250);   /* panels, cards */
--surface-2:   oklch(0.26 0.02 250);   /* raised/hover surface */
--border:      oklch(0.32 0.02 250);
--ink:         oklch(0.94 0.01 250);   /* primary text */
--ink-muted:   oklch(0.70 0.02 250);   /* secondary text — still >=4.5:1 on --bg/--surface */
--accent:      oklch(0.78 0.13 220);   /* cyan — interactive chrome, links, focus */
--accent-ink:  oklch(0.16 0.02 250);   /* text on --accent */
--warn:        oklch(0.80 0.14 80);    /* amber — comparison / caution framing */
--warn-surface:oklch(0.24 0.05 80);
--danger:      oklch(0.62 0.19 25);    /* reserved: errors only, never risk-scale */
```

The risk color ramp itself (`apps/web/lib/colorRamp.ts`) is unchanged — it is its own deliberate colorblind-safe sequential scale (deep indigo -> magenta -> amber -> yellow) and is never blended with the UI accent above.

## Typography

- **Sans (UI text, labels, prose)**: Geist Sans (already wired via `next/font/google` in `layout.tsx`).
- **Mono (all numeric/data readouts)**: Geist Mono — risk scores, confidence values, coordinates, model/data version strings, factor-contribution numbers, table figures. Any place a number is the point, it renders in mono, tabular, right-aligned where in a list.
- Body text max ~70ch. No display/hero type scale needed — this is a product surface, not a landing page; headings stay functional (18-24px range), not oversized.

## Components

- **Panels**: flat `--surface` background, 1px `--border`, no blur/glassmorphism, no drop shadow beyond a minimal `0 1px 2px` separation from the map. Square-ish corners (4px radius, not the default rounded-2xl sameness).
- **Data readout rows**: label (sans, `--ink-muted`, small) + value (mono, `--ink`, right-aligned) in a tight grid — used for factor contributions, exposure stats, confidence, model/data version.
- **Legend**: horizontal ramp swatch with numeric tick labels in mono underneath, not a vague gradient bar.
- **Toggles/checkboxes**: plain, small, labeled — no pill switches with accent-gradient fills.
- **Buttons/links**: solid `--accent` background with `--accent-ink` text for primary actions; ghost/outline `--border` for secondary. No gradient fills anywhere.
- **Coverage-tier / limitation callouts**: `--warn-surface` background with `--warn` left accent text (not a colored left border stripe — use a small inline label instead, e.g. a bracketed tag `[UNSUPPORTED]` in mono).

## Layout

- Map is the dominant surface; overlay panels are compact, information-dense, and positioned at fixed corners — not full-height sidebars that compete with the map.
- Use CSS grid for the dense data readouts (label/value pairs), flexbox for one-dimensional toggle/control rows.
- Consistent 8px-based spacing scale; tighter than typical marketing spacing (this is a tool, not a landing page).

## Motion

Minimal and functional only: panel open/close as a short opacity+translate (150ms, ease-out), no bounce. Respect `prefers-reduced-motion` (crossfade fallback). No motion on the map/data layers beyond MapLibre's own native interaction.
