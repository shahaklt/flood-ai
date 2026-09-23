/** Colorblind-safe sequential risk ramp (based on the "Inferno" perceptually
 * uniform palette family — distinguishable under deuteranopia/protanopia/
 * tritanopia, and never relies on red alone to carry meaning; category
 * labels and the legend always accompany color). */
const RAMP_STOPS: [number, string][] = [
  [0, "#0d0887"],
  [20, "#6a00a8"],
  [40, "#b12a90"],
  [60, "#e16462"],
  [80, "#fca636"],
  [100, "#f0f921"],
];

export function riskColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    const [s0, c0] = RAMP_STOPS[i];
    const [s1, c1] = RAMP_STOPS[i + 1];
    if (clamped >= s0 && clamped <= s1) {
      return interpolateHex(c0, c1, (clamped - s0) / (s1 - s0));
    }
  }
  return RAMP_STOPS[RAMP_STOPS.length - 1][1];
}

function interpolateHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export const RISK_RAMP_LEGEND = RAMP_STOPS;

export const UNSUPPORTED_COLOR = "#94a3b8"; // slate-400, distinct + labeled, never a risk color

/** Real USDA hydrologic soil group ramp: A (well-drained, low runoff, green)
 * through D (poorly drained, high runoff, red) -- same runoff-potential
 * ordering as HYDROLOGIC_SOIL_GROUP_FACTOR in packages/risk-runtime. */
export const SOIL_GROUP_COLORS: Record<"A" | "B" | "C" | "D", string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#f59e0b",
  D: "#ef4444",
};

export const FEMA_SFHA_COLOR = "#ef4444";
export const FEMA_NON_SFHA_COLOR = "#1e293b";
