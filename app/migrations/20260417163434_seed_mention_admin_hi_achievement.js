// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const KEY = "mention_admin_hi";
const CATEGORY_KEY = "social";

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  const category = await knex("achievement_categories").where({ key: CATEGORY_KEY }).first();
  if (!category) {
    throw new Error(`achievement_categories row with key='${CATEGORY_KEY}' not found`);
  }

  await knex("achievements").insert({
    category_id: category.id,
    key: KEY,
    name: "來自鬆餅的祝福",
    description: "與管理員打招呼",
    icon: "🥞",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 100,
    order: 99,
    condition: JSON.stringify({
      targetUserIds: ["U41b31c07a3279ca64355d2de43101b3d"],
      keywords: ["鬆餅", "祝福"],
    }),
    notify_on_unlock: true,
    notify_message: "恭喜你加入鬆餅教(((o(*ﾟ▽ﾟ*)o)))\n已解鎖隱藏成就：{icon} {name}",
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex("achievements").where({ key: KEY }).del();
};
