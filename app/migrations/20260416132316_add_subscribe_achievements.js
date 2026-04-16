/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex("achievement_categories").insert({
    key: "subscribe",
    name: "訂閱",
    icon: "💳",
    order: 6,
  });

  const category = await knex("achievement_categories").where({ key: "subscribe" }).first();

  await knex("achievements").insert([
    {
      category_id: category.id,
      key: "subscribe_first",
      name: "小額贊助商",
      description: "第一次購買或兌換月卡",
      icon: "💳",
      type: "milestone",
      rarity: 0,
      target_value: 1,
      reward_stones: 50,
      order: 1,
    },
    {
      category_id: category.id,
      key: "subscribe_3",
      name: "穩定供養者",
      description: "累計購買或兌換月卡 3 次",
      icon: "💰",
      type: "milestone",
      rarity: 1,
      target_value: 3,
      reward_stones: 200,
      order: 2,
    },
    {
      category_id: category.id,
      key: "subscribe_6",
      name: "鈔能力覺醒",
      description: "累計購買或兌換月卡 6 次",
      icon: "💎",
      type: "milestone",
      rarity: 2,
      target_value: 6,
      reward_stones: 500,
      order: 3,
    },
    {
      category_id: category.id,
      key: "subscribe_12",
      name: "布丁永動機",
      description: "累計購買或兌換月卡 12 次",
      icon: "🏧",
      type: "hidden",
      rarity: 3,
      target_value: 12,
      reward_stones: 300,
      order: 4,
    },
  ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex("user_achievement_progress")
    .whereIn(
      "achievement_id",
      knex("achievements")
        .whereIn("key", ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"])
        .select("id")
    )
    .delete();
  await knex("user_achievements")
    .whereIn(
      "achievement_id",
      knex("achievements")
        .whereIn("key", ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"])
        .select("id")
    )
    .delete();
  await knex("achievements")
    .whereIn("key", ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"])
    .delete();
  await knex("achievement_categories").where({ key: "subscribe" }).delete();
};
