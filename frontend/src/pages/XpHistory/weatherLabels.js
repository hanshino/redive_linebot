const SHORT = {
  cooldown_required_mult: "冷卻",
  raw_xp_mult: "原始",
  effective_xp_mult: "最終",
  group_bonus_mult: "群組",
  exp_to_stone_rate: "經驗轉女神石",
  silence_burst: "久違發言",
};
const FULL = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
  exp_to_stone_rate: "經驗轉女神石",
  silence_burst: "久違發言",
};

// Internal safety rail, never a player-facing effect. Mirrors the same filter in
// app/src/service/chatXp/weatherEffects.js.
const HIDDEN = new Set(["exp_to_stone_daily_cap"]);

function effectPct(v) {
  const p = Math.round((Number(v) - 1) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function weatherEffectLabels(effects, { full = false } = {}) {
  const map = full ? FULL : SHORT;
  return Object.entries(effects || {})
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, v]) => {
      // A conversion ratio, not a multiplier — the ×-1-as-percentage form below
      // would render nonsense (1 → +0%, 50 → +4900%).
      if (k === "exp_to_stone_rate") {
        return Number(v) === 1 ? `${map[k]} 1:1` : `${map[k]} ${v}:1`;
      }
      if (k === "silence_burst") {
        return `${map[k]} 最高 ×${Math.max(...v.map(({ mult }) => mult))}`;
      }
      return `${map[k] || k} ${effectPct(v)}`;
    });
}
