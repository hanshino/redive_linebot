// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_prestige_trials", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable().comment("LINE platform_id");
    table.tinyint("trial_id").unsigned().notNullable().comment("FK prestige_trials.id");
    table.datetime("started_at").notNullable();
    table.datetime("ended_at").nullable();
    table
      .enum("status", ["active", "passed", "failed", "forfeited"])
      .notNullable()
      .defaultTo("active");
    table
      .integer("final_exp_progress")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("結束時凍結 — 用於 audit 與 UI 展示");
    table.timestamps(true, true);

    table.index(["user_id", "trial_id", "status"], "idx_user_trial_status");
    table.index(["status", "ended_at"], "idx_status_ended");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_prestige_trials");
};
