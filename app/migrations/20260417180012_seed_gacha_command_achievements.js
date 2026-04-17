// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const CATEGORY_KEY = "gacha";

const ACHIEVEMENTS = [
  {
    key: "gacha_europe_1",
    name: "歐陸初旅",
    description: "首次使用 #歐洲抽",
    icon: "🏰",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 6,
    pullType: "europe",
  },
  {
    key: "gacha_europe_10",
    name: "歐洲常客",
    description: "累計 10 次 #歐洲抽",
    icon: "🎩",
    type: "milestone",
    rarity: 1,
    target_value: 10,
    reward_stones: 200,
    order: 7,
    pullType: "europe",
  },
  {
    key: "gacha_europe_50",
    name: "歐洲貴族",
    description: "累計 50 次 #歐洲抽",
    icon: "🛡️",
    type: "milestone",
    rarity: 2,
    target_value: 50,
    reward_stones: 500,
    order: 8,
    pullType: "europe",
  },
  {
    key: "gacha_pickup_1",
    name: "鎖定目標",
    description: "首次使用 #消耗抽",
    icon: "🎯",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 9,
    pullType: "pickup",
  },
  {
    key: "gacha_pickup_10",
    name: "愛的追擊",
    description: "累計 10 次 #消耗抽",
    icon: "❤️‍🔥",
    type: "milestone",
    rarity: 1,
    target_value: 10,
    reward_stones: 200,
    order: 10,
    pullType: "pickup",
  },
  {
    key: "gacha_pickup_50",
    name: "偏執獵手",
    description: "累計 50 次 #消耗抽",
    icon: "🏹",
    type: "milestone",
    rarity: 2,
    target_value: 50,
    reward_stones: 500,
    order: 11,
    pullType: "pickup",
  },
  {
    key: "gacha_ensure_1",
    name: "保底信徒",
    description: "首次使用 #保證抽",
    icon: "🔒",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 12,
    pullType: "ensure",
  },
  {
    key: "gacha_ensure_10",
    name: "押注命運",
    description: "累計 10 次 #保證抽",
    icon: "🎰",
    type: "milestone",
    rarity: 1,
    target_value: 10,
    reward_stones: 200,
    order: 13,
    pullType: "ensure",
  },
  {
    key: "gacha_ensure_50",
    name: "逆天改命",
    description: "累計 50 次 #保證抽",
    icon: "🌈",
    type: "milestone",
    rarity: 2,
    target_value: 50,
    reward_stones: 500,
    order: 14,
    pullType: "ensure",
  },
];

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  const category = await knex("achievement_categories").where({ key: CATEGORY_KEY }).first();
  if (!category) {
    throw new Error(`achievement_categories row with key='${CATEGORY_KEY}' not found`);
  }

  const rows = ACHIEVEMENTS.map(({ pullType, ...rest }) => ({
    ...rest,
    category_id: category.id,
    condition: JSON.stringify({ pullType }),
  }));

  await knex("achievements").insert(rows);
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex("achievements")
    .whereIn(
      "key",
      ACHIEVEMENTS.map(a => a.key)
    )
    .del();
};
