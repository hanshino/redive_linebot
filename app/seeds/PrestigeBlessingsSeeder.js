const BLESSINGS = [
  {
    id: 1,
    slug: "language_gift",
    display_name: "語言天賦",
    effect_meta: { type: "per_msg_xp_multiplier", value: 0.08 },
    description: "單句基礎 XP +8%。",
  },
  {
    id: 2,
    slug: "swift_tongue",
    display_name: "迅雷語速",
    effect_meta: { type: "cooldown_threshold_shift", from: 6, to: 5 },
    description: "冷卻滿速門檻 6s → 5s。",
  },
  {
    id: 3,
    slug: "ember_afterglow",
    display_name: "燃燒餘熱",
    effect_meta: { type: "cooldown_tier_override", tiers: { "0-1": 0.1, "1-2": 0.3 } },
    description: "冷卻初段緩衝：<1s 0→10%、1–2s 10→30%。",
  },
  {
    id: 4,
    slug: "whispering",
    display_name: "絮語之心",
    effect_meta: { type: "diminish_tier_expand", tier: "0-200", to: 300 },
    description: "日 XP 100% 區間 0–200 → 0–300。",
  },
  {
    id: 5,
    slug: "rhythm_spring",
    display_name: "節律之泉",
    effect_meta: { type: "diminish_tier_expand", tier: "200-500", to: 600 },
    description: "日 XP 30% 區間 200–500 → 200–600。",
  },
  {
    id: 6,
    slug: "star_guard",
    display_name: "群星加護",
    effect_meta: { type: "group_bonus_slope", value: 0.025 },
    description: "群組加成斜率 0.02 → 0.025。",
  },
  {
    id: 7,
    slug: "greenhouse",
    display_name: "溫室之語",
    effect_meta: { type: "small_group_multiplier", threshold: 10, value: 1.3 },
    description: "群組 <10 人時 XP ×1.3。",
  },
];

function buildRows() {
  return BLESSINGS.map(b => ({
    ...b,
    effect_meta: JSON.stringify(b.effect_meta),
  }));
}

exports.buildRows = buildRows;

exports.seed = async function (knex) {
  await knex("prestige_blessings").del();
  await knex("prestige_blessings").insert(buildRows());
};
