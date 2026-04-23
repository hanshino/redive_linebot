const TRIALS = [
  {
    id: 1,
    slug: "departure",
    display_name: "啟程",
    star: 1,
    required_exp: 2000,
    duration_days: 60,
    restriction_meta: { type: "none" },
    reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    description: "初次踏上轉生之路，無限制。達標觸發啟程成就。",
  },
  {
    id: 2,
    slug: "hardship",
    display_name: "刻苦",
    star: 2,
    required_exp: 3000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.7 },
    reward_meta: { type: "permanent_xp_multiplier", value: 0.1 },
    description: "期間 XP ×0.7，通過後永久 XP +10%。",
  },
  {
    id: 3,
    slug: "rhythm",
    display_name: "律動",
    star: 3,
    required_exp: 2500,
    duration_days: 60,
    restriction_meta: { type: "cooldown_shift_multiplier", value: 1.33 },
    reward_meta: { type: "cooldown_tier_override", tiers: { "2-4": 0.7, "4-6": 0.9 } },
    description: "冷卻曲線右移 ×1.33（8s 滿速）。通過後中段 tier 提升。",
  },
  {
    id: 4,
    slug: "solitude",
    display_name: "孤鳴",
    star: 4,
    required_exp: 2500,
    duration_days: 60,
    restriction_meta: { type: "group_bonus_disabled" },
    reward_meta: { type: "group_bonus_double" },
    description: "期間群組加成失效。通過後群組加成斜率翻倍。",
  },
  {
    id: 5,
    slug: "awakening",
    display_name: "覺悟",
    star: 5,
    required_exp: 5000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.5 },
    reward_meta: {
      type: "permanent_xp_multiplier",
      value: 0.15,
      achievement_slug: "prestige_awakening",
    },
    description: "最終試煉，期間 XP ×0.5。通過後永久 XP +15% 並解鎖覺醒。",
  },
];

function buildRows() {
  return TRIALS.map(t => ({
    ...t,
    restriction_meta: JSON.stringify(t.restriction_meta),
    reward_meta: JSON.stringify(t.reward_meta),
  }));
}

exports.buildRows = buildRows;

exports.seed = async function (knex) {
  await knex("prestige_trials").del();
  await knex("prestige_trials").insert(buildRows());
};
