/**
 * Star color + tier label mapping for prestige trials.
 * star: 1-5 → { color (MUI theme token), tierLabel }
 */
export const STAR_CONFIG = {
  1: { color: "success.main", tierLabel: "初階" },
  2: { color: "info.main", tierLabel: "中階・負擔" },
  3: { color: "warning.light", tierLabel: "中階・律動" },
  4: { color: "warning.main", tierLabel: "高階・孤鳴" },
  5: { color: "secondary.main", tierLabel: "最終試煉" },
};

/**
 * Returns { color, tierLabel } for a given star number (1-5).
 * Falls back to success.main if star is out of range.
 */
export function getStarConfig(star) {
  return STAR_CONFIG[star] ?? STAR_CONFIG[1];
}

export default STAR_CONFIG;
