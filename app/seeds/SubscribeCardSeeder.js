const monthEffects = [
  { type: "gacha_times", value: 1 },
  { type: "daily_ration", value: 200 },
];

const seasonEffects = [
  { type: "gacha_times", value: 2 },
  { type: "daily_ration", value: 500 },
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex("subscribe_card").del();
  await knex("subscribe_card").insert([
    { key: "month", name: "月卡", price: 50, duration: 30, effects: JSON.stringify(monthEffects) },
    {
      key: "season",
      name: "季卡",
      price: 130,
      duration: 90,
      effects: JSON.stringify(seasonEffects),
    },
  ]);
};
