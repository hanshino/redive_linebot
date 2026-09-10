// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * sponsorship_audit：只記錄「建立」與「補綁」兩種必要操作，不做一般異動軌跡。
 * 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §2.2。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("sponsorship_audit", table => {
    table.increments("id").primary();
    table.integer("sponsorship_id").unsigned().notNullable();
    table.enu("action", ["create", "bind"]).notNullable();
    table.string("operator_user_id", 33).notNullable();
    table.json("payload_snapshot").notNullable().comment("該動作當下的關鍵欄位快照");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index("sponsorship_id");
    table.foreign("sponsorship_id").references("id").inTable("sponsorship");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("sponsorship_audit");
};
