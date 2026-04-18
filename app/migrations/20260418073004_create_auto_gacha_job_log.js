/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("auto_gacha_job_log", function (table) {
    table.bigIncrements("id").primary();

    table.string("user_id", 33).notNullable().comment("LINE User ID");
    table.date("run_date").notNullable().comment("本次 cron 執行的日期（local tz）");
    table.integer("pulls_made").notNullable().defaultTo(0).comment("實際代抽的次數");
    table
      .enum("status", ["success", "failed", "skipped"])
      .notNullable()
      .comment("success=完成抽卡, failed=例外, skipped=已達上限或偏好關閉");
    table.text("error").nullable().comment("失敗原因（僅 status=failed 時）");

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["user_id", "run_date"], "uq_user_run");
    table.index(["run_date"], "idx_run_date");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("auto_gacha_job_log");
};
