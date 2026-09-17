// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * AchievementEngine 的 per-user mutex 與 distinct-feature durable tracked-set（KTD6／KTD7）。
 *
 * 只建空表，不搬資料、不掃 Redis：每個 (user, achievement) 在第一次進入新 core 時，
 * 才於成功交易內做一次 Redis 唯讀 GET，寫 migration observation 與不可逆 item hash marker。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("achievement_user_lock", table => {
    table.string("user_id", 50).primary().comment("獨立 mutex key；不依賴 user 表存在");
  });

  await knex.schema.createTable("achievement_tracked_item", table => {
    table.string("user_id", 50).notNullable();
    table.integer("achievement_id").unsigned().notNullable();
    table.string("item_hash", 64).notNullable().comment("SHA-256 hex，不保存原始 tracked item");

    table.primary(["user_id", "achievement_id", "item_hash"]);
    table.foreign("achievement_id").references("id").inTable("achievements");
  });

  await knex.schema.createTable("achievement_tracked_migration", table => {
    table.string("user_id", 50).notNullable();
    table.integer("achievement_id").unsigned().notNullable();
    table
      .string("tracking_key", 50)
      .notNullable()
      .comment("definition revision：groupId 或 feature");
    table.boolean("redis_found").notNullable();
    table.integer("item_count").unsigned().notNullable();
    table
      .integer("baseline_value")
      .notNullable()
      .comment("觀測時既有 MySQL progress，opaque baseline");
    table.timestamp("migrated_at").notNullable().defaultTo(knex.fn.now());

    table.primary(["user_id", "achievement_id"]);
    table.foreign("achievement_id").references("id").inTable("achievements");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("achievement_tracked_migration");
  await knex.schema.dropTableIfExists("achievement_tracked_item");
  await knex.schema.dropTableIfExists("achievement_user_lock");
};
