// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const KEY = "mention_memory_seeker";
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
    name: "追尋神祇回憶的人",
    description: "觸碰到了布丁古神的意識",
    icon: "🍮",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 100,
    order: 100,
    condition: JSON.stringify({
      targetUserIds: ["U80ca6f24809c9a00981562b771fb6b84"],
      keywords: [],
    }),
    notify_on_unlock: true,
    notify_message:
      "你觸摸到了布丁古神，古老的符文緩緩浮現……\n「穿越時光的旅人啊，神祇向你致意」\n已解鎖隱藏成就：{icon} {name}",
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex("achievements").where({ key: KEY }).del();
};
