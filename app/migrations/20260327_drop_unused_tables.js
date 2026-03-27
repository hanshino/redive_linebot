/**
 * Drop 11 unused tables that have zero references in application code.
 *
 * Identified by auditing production `SHOW TABLES` against all src/ references.
 *
 * Tables dropped:
 *   BulletIn, GlobalConfigs, MiniGame_Character, arena_like_records,
 *   arena_records, notify_list, sent_bulletin, subscribe_type,
 *   world_boss_tips, world_boss_notify, tips_message
 */

const UNUSED_TABLES = [
  "BulletIn",
  "GlobalConfigs",
  "MiniGame_Character",
  "arena_like_records",
  "arena_records",
  "notify_list",
  "sent_bulletin",
  "subscribe_type",
  "world_boss_tips",
  "world_boss_notify",
  "tips_message",
];

exports.up = async function (knex) {
  for (const table of UNUSED_TABLES) {
    await knex.schema.dropTableIfExists(table);
  }
};

exports.down = async function () {
  // These tables had no application code references and their original
  // schemas are preserved in earlier migration files if ever needed.
  // Intentionally left empty — recreating them is not necessary.
};
