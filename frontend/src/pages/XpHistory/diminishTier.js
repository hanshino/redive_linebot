// Mirrors app/src/service/chatXp/diminishTier.js TIER1/2/3_RATE on the client.
const TIER1_RATE = 1;
const TIER2_RATE = 0.3;
const TIER3_RATE = 0.03;

export const TIER_ACCENT = {
  cyan: "#00ACC1",
  amber: "#F59E0B",
  red: "#DC2626",
  grey: "#9CA3AF",
};

export function tierAccentFromFactor(factor, { degraded } = {}) {
  if (degraded) return TIER_ACCENT.grey;
  if (factor === TIER3_RATE) return TIER_ACCENT.red;
  if (factor === TIER2_RATE) return TIER_ACCENT.amber;
  return TIER_ACCENT.cyan;
}

export function tierLabelFromFactor(factor) {
  if (factor === TIER1_RATE) return "遞減（第一階）";
  if (factor === TIER2_RATE) return "遞減（第二階）";
  if (factor === TIER3_RATE) return "遞減（第三階）";
  return "遞減";
}

export { TIER1_RATE, TIER2_RATE, TIER3_RATE };
