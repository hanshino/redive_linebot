// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  const hasOld = await knex.schema.hasTable("chat_user_data");
  if (hasOld) {
    await knex.schema.renameTable("chat_user_data", "chat_user_data_legacy_snapshot");
  }

  return knex.schema.createTable("chat_user_data", table => {
    table.string("user_id", 33).notNullable().primary().comment("LINE platform_id");
    table
      .tinyint("prestige_count")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("0-5, 5 = 覺醒終態");
    table.smallint("current_level").unsigned().notNullable().defaultTo(0).comment("0-100");
    table.integer("current_exp").unsigned().notNullable().defaultTo(0).comment("0-27000");
    table.datetime("awakened_at").nullable().comment("prestige_count 到 5 時寫入");
    table.tinyint("active_trial_id").unsigned().nullable().comment("目前挑戰中的試煉 (NULL = 無)");
    table.datetime("active_trial_started_at").nullable().comment("60 天期限倒數起點");
    table
      .integer("active_trial_exp_progress")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("試煉條件累積 XP");
    table.timestamps(true, true);

    table.index(["active_trial_id", "active_trial_started_at"], "idx_active_trial");
    table.index(["awakened_at"], "idx_awakened");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("chat_user_data");
  const hasSnapshot = await knex.schema.hasTable("chat_user_data_legacy_snapshot");
  if (hasSnapshot) {
    await knex.schema.renameTable("chat_user_data_legacy_snapshot", "chat_user_data");
  }
};
