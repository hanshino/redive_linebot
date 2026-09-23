/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("daily_quest", table => {
    table.date("quest_date").nullable().comment("新 writer 的 Asia/Taipei 任務歸屬日；舊列為 NULL");
    table.index(["user_id", "quest_date"], "idx_daily_quest_user_quest_date");
  });

  await knex.schema.createTable("daily_quest_completion", table => {
    table.string("user_id", 33).notNullable();
    table.date("quest_date").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.primary(["user_id", "quest_date"]);
  });

  await knex.schema.createTable("daily_quest_weekly_claim", table => {
    table.string("user_id", 33).notNullable();
    table.date("week_start").notNullable().comment("Asia/Taipei，週日為週首");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.primary(["user_id", "week_start"]);
  });

  await knex.schema.createTable("daily_quest_bridge_state", table => {
    table.tinyint("id").unsigned().primary();
    table.date("since_date").notNullable().comment("operator 固定的 D_c；scanner 不得自行改動");
    table.timestamp("activated_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.check("?? = 1", ["id"], "chk_daily_quest_bridge_singleton");
  });

  await knex.schema.alterTable("janken_result", table => {
    table.index(["created_at", "id"], "idx_janken_result_created_id");
    table.index(["user_id", "created_at", "id"], "idx_janken_result_user_created_id");
    table.index(["record_id", "user_id"], "idx_janken_result_record_user");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("janken_result", table => {
    table.dropIndex(["record_id", "user_id"], "idx_janken_result_record_user");
    table.dropIndex(["user_id", "created_at", "id"], "idx_janken_result_user_created_id");
    table.dropIndex(["created_at", "id"], "idx_janken_result_created_id");
  });
  await knex.schema.dropTableIfExists("daily_quest_bridge_state");
  await knex.schema.dropTableIfExists("daily_quest_weekly_claim");
  await knex.schema.dropTableIfExists("daily_quest_completion");
  await knex.schema.alterTable("daily_quest", table => {
    table.dropIndex(["user_id", "quest_date"], "idx_daily_quest_user_quest_date");
    table.dropColumn("quest_date");
  });
};
