const GODDESS_STONE_ITEM_ID = 999;
const ACHIEVEMENT_KEY = "prestige_5";
const SENTINEL_NOTE = "成就獎勵 [prestige-5-backfill-2026-08-28]";

const ACHIEVEMENT = {
  key: ACHIEVEMENT_KEY,
  name: "輪迴盡頭",
  description: "累計完成 5 次轉生，抵達轉生終點",
  icon: "🌌",
  type: "hidden",
  rarity: 3,
  target_value: 1,
  reward_stones: 500,
  order: 21,
  notify_on_unlock: true,
  notify_message: "🎉 {user} 走完五世輪迴，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  let backfilled = 0;

  await knex.transaction(async trx => {
    const category = await trx("achievement_categories").where({ key: "chat" }).first();
    if (!category) throw new Error("achievement_categories row with key='chat' not found");

    await trx("achievements")
      .insert({ ...ACHIEVEMENT, category_id: category.id, condition: null })
      .onConflict("key")
      .ignore();
    const achievement = await trx("achievements").where({ key: ACHIEVEMENT_KEY }).first("id");

    // Ledger first: the NOT EXISTS gate must see the pre-backfill achievement state.
    const [inventoryResult] = await trx.raw(
      `
        INSERT INTO inventory (userId, itemId, itemAmount, note)
        SELECT cud.user_id, ?, ?, ?
        FROM chat_user_data cud
        WHERE cud.prestige_count >= 5
          AND NOT EXISTS (
            SELECT 1 FROM user_achievements ua
            WHERE ua.user_id = cud.user_id AND ua.achievement_id = ?
          )
      `,
      [GODDESS_STONE_ITEM_ID, ACHIEVEMENT.reward_stones, SENTINEL_NOTE, achievement.id]
    );

    const [achievementResult] = await trx.raw(
      `
        INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
        SELECT cud.user_id, ?, NOW()
        FROM chat_user_data cud
        WHERE cud.prestige_count >= 5
      `,
      [achievement.id]
    );
    backfilled = achievementResult.affectedRows || 0;
    console.log(
      `[${ACHIEVEMENT_KEY}-backfill] achievements=${backfilled} inventory=${
        inventoryResult.affectedRows || 0
      }`
    );
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.transaction(async trx => {
    const achievement = await trx("achievements").where({ key: ACHIEVEMENT_KEY }).first("id");
    if (!achievement) return;

    // Rollback intentionally deletes real unlocks created by this achievement.
    await trx("user_achievements").where({ achievement_id: achievement.id }).delete();
    await trx("inventory").where({ note: SENTINEL_NOTE }).delete();
    await trx("achievements").where({ id: achievement.id }).delete();
    console.warn(
      `[${ACHIEVEMENT_KEY}-backfill:down] deleted real user achievement and inventory data`
    );
  });
};
