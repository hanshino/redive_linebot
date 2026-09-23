// 建立「月卡 Plus」卡種。見 docs/plans/2026-09-09-sponsorship-subscription-roadmap.md
// §5「2026-09-23 Plus 售價與折算決策」：售價 NT$60／30 天，effects 為完整一套
// （非月卡的增量）：gacha_times 2、daily_ration 500、auto_daily_gacha、auto_janken_fate，
// 加上 Plus 專屬的 auto_janken_match（每日自動配對，僅開關無數值，value:1）。
// 冪等：已存在 key="month_plus" 就不重複 insert；down 只刪這一列。
const MONTH_PLUS_EFFECTS = [
  { type: "gacha_times", value: 2 },
  { type: "daily_ration", value: 500 },
  { type: "auto_daily_gacha", value: 1 },
  { type: "auto_janken_fate", value: 1 },
  { type: "auto_janken_match", value: 1 },
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const existing = await knex("subscribe_card").where({ key: "month_plus" }).first();
  if (existing) return;

  await knex("subscribe_card").insert({
    key: "month_plus",
    name: "月卡 Plus",
    price: 60,
    duration: 30,
    effects: JSON.stringify(MONTH_PLUS_EFFECTS),
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex("subscribe_card").where({ key: "month_plus" }).del();
};
