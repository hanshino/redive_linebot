/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex("scratch_card_types").del();
  await knex("scratch_card_types").insert([
    {
      name: "龍母刮刮卡",
      price: 50000,
      max_reward: 1000000,
      image: "https://chieru.randosoru.me/assets/units/full/124531.png",
    },
    {
      name: "深月刮刮卡",
      price: 25000,
      max_reward: 500000,
      image: "https://chieru.randosoru.me/assets/units/full/124731.png",
    },
    {
      name: "聖母刮刮卡",
      price: 10000,
      max_reward: 100000,
      image: "https://chieru.randosoru.me/assets/units/full/124631.png",
    },
  ]);
};
