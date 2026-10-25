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

/**
 * `color` 是 sx 用的 token 字串（"warning.main"），拿去做 alpha() 之類的運算前要先解成實際色值。
 * 只能在 sx 的 theme callback 或有 theme 的地方呼叫。
 */
export function resolveStarColor(theme, star) {
  const [group, shade] = getStarConfig(star).color.split(".");
  return theme.palette[group]?.[shade] ?? theme.palette.success.main;
}

export default STAR_CONFIG;
