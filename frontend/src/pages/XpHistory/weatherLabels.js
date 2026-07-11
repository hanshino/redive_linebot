const SHORT = {
  cooldown_required_mult: "冷卻",
  raw_xp_mult: "原始",
  effective_xp_mult: "最終",
  group_bonus_mult: "群組",
};
const FULL = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
};

function effectPct(v) {
  const p = Math.round((Number(v) - 1) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function weatherEffectLabels(effects, { full = false } = {}) {
  const map = full ? FULL : SHORT;
  return Object.entries(effects || {}).map(([k, v]) => `${map[k] || k} ${effectPct(v)}`);
}
