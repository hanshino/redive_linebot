"use strict";

const EFFECT_IDENTITY = 1;

const EFFECT_LABELS = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
  exp_to_stone_rate: "經驗轉女神石",
};

/**
 * The effects actually applied to an event, plus whether protection was active.
 * V1: only debuff weathers are protectable, and protection neutralises the whole
 * weather (all-or-nothing) — see design §6.1.
 */
function resolveEffectiveEffects(weather, protection, eventTs) {
  if (!weather) return { effects: {}, protected: false };
  const isProtected =
    weather.category === "debuff" &&
    protection != null &&
    eventTs >= new Date(protection.purchased_at).getTime();
  return {
    effects: isProtected ? {} : weather.effects || {},
    protected: isProtected,
  };
}

function mult(effects, field) {
  const v = effects && effects[field];
  return typeof v === "number" && v > 0 ? v : EFFECT_IDENTITY;
}

/**
 * Weighted category pick, then weighted pick within the category, avoiding
 * avoidKey when the category has an alternative. rand() ∈ [0,1), called twice.
 * Per-weather `weight` defaults to 1; equal weights reduce to a uniform pick.
 */
function pickWeather(pool, weights, avoidKey, rand = Math.random) {
  const byCategory = {};
  for (const [key, def] of Object.entries(pool)) {
    (byCategory[def.category] = byCategory[def.category] || []).push(key);
  }
  const categories = Object.keys(byCategory).filter(c => (weights[c] || 0) > 0);
  const total = categories.reduce((s, c) => s + weights[c], 0);

  let r = rand() * total;
  let chosen = categories[categories.length - 1];
  for (const c of categories) {
    if (r < weights[c]) {
      chosen = c;
      break;
    }
    r -= weights[c];
  }

  let keys = byCategory[chosen];
  const filtered = keys.filter(k => k !== avoidKey);
  if (filtered.length > 0) keys = filtered;

  const keyWeight = k => {
    const w = pool[k].weight;
    return typeof w === "number" && w > 0 ? w : 1;
  };
  const keyTotal = keys.reduce((s, k) => s + keyWeight(k), 0);
  let kr = rand() * keyTotal;
  for (const k of keys) {
    kr -= keyWeight(k);
    if (kr < 0) return k;
  }
  return keys[keys.length - 1];
}

function describeEffects(effects) {
  return Object.entries(effects || {})
    .filter(([field]) => {
      // Safety rail only; do not show the daily mint cap as a weather effect.
      return field !== "exp_to_stone_daily_cap";
    })
    .map(([field, value]) => {
      const label = EFFECT_LABELS[field] || field;
      // Not a multiplier: it's a conversion ratio (N exp → 1 stone), so the
      // ×-1-as-percentage formatting below would render nonsense (+4900%).
      if (field === "exp_to_stone_rate") return `${label} ${value}:1`;
      const pct = Math.round((value - 1) * 100);
      return `${label} ${pct >= 0 ? `+${pct}` : pct}%`;
    });
}

module.exports = { resolveEffectiveEffects, mult, pickWeather, describeEffects, EFFECT_IDENTITY };
