// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * janken_records 新增 `source`：manual（既有手動對戰，含所有歷史列）/ arena / auto（自動配對）。
 * 見 docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md KTD13。
 * NOT NULL DEFAULT 'manual' 讓既有列自動回填為 manual，不需另跑 UPDATE。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table
      .enu("source", ["manual", "arena", "auto"])
      .notNullable()
      .defaultTo("manual")
      .comment("manual:手動對戰 / arena:競技場 / auto:自動配對");
    table.index(["source", "created_at"], "idx_janken_records_source_created_at");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.dropIndex(["source", "created_at"], "idx_janken_records_source_created_at");
    table.dropColumn("source");
  });
};
