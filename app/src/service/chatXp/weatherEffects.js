"use strict";

const EFFECT_IDENTITY = 1;

const EFFECT_LABELS = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
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
 * Weighted category pick, then uniform pick within the category, avoiding
 * avoidKey when the category has an alternative. rand() ∈ [0,1), called twice.
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
  return keys[Math.floor(rand() * keys.length)];
}

function describeEffects(effects) {
  return Object.entries(effects || {}).map(([field, value]) => {
    const label = EFFECT_LABELS[field] || field;
    const pct = Math.round((value - 1) * 100);
    return `${label} ${pct >= 0 ? `+${pct}` : pct}%`;
  });
}

module.exports = { resolveEffectiveEffects, mult, pickWeather, describeEffects, EFFECT_IDENTITY };
