const monthEffects = [
  { type: "gacha_times", value: 1 },
  { type: "daily_ration", value: 200 },
];

const seasonEffects = [
  { type: "gacha_times", value: 2 },
  { type: "daily_ration", value: 500 },
];

// 完整一套（非月卡的增量），比照線上 month_plus 卡種的 effects JSON 格式。
// 見 migrations/20260923092351_create_month_plus_subscribe_card.js
// 與 20260923132724_add_auto_world_boss.js（世界王自動攻擊）。
const monthPlusEffects = [
  { type: "gacha_times", value: 2 },
  { type: "daily_ration", value: 500 },
  { type: "auto_daily_gacha", value: 1 },
  { type: "auto_janken_fate", value: 1 },
  { type: "auto_janken_match", value: 1 },
  { type: "auto_world_boss", value: 1 },
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex("subscribe_card").del();
  await knex("subscribe_card").insert([
    { key: "month", name: "月卡", price: 30, duration: 30, effects: JSON.stringify(monthEffects) },
    {
      key: "season",
      name: "季卡",
      price: 130,
      duration: 90,
      effects: JSON.stringify(seasonEffects),
    },
    {
      key: "month_plus",
      name: "月卡 Plus",
      price: 60,
      duration: 30,
      effects: JSON.stringify(monthPlusEffects),
    },
  ]);
};
