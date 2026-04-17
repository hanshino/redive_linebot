// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const KEY = "mention_void_gazer";
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
    name: "凝視虛無者",
    description: "當你凝視著深淵，深淵也凝視著你",
    icon: "👁️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 100,
    order: 101,
    condition: JSON.stringify({
      targetUserIds: ["Uc28b2e002c86886fffdb6cabea060c6e"],
      keywords: ["sudo su"],
    }),
    notify_on_unlock: true,
    notify_message:
      "$ tail -f /dev/abyss\n[WARN] the void is watching back.\n你凝視著程式碼深處的虛無，虛無透過螢幕凝視著你。\n已解鎖隱藏成就：{icon} {name}",
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex("achievements").where({ key: KEY }).del();
};
