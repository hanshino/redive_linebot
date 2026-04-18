/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("auto_gacha_job_log", function (table) {
    table.json("reward_summary").nullable().after("pulls_made").comment("抽到的獎勵摘要");
    table.integer("duration_ms").nullable().after("error").comment("代抽耗時 ms");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("auto_gacha_job_log", function (table) {
    table.dropColumn("reward_summary");
    table.dropColumn("duration_ms");
  });
};
