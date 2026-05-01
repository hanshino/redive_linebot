// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_prestige_history", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table.tinyint("prestige_count_after").unsigned().notNullable().comment("1-5");
    table.tinyint("trial_id").unsigned().notNullable();
    table.tinyint("blessing_id").unsigned().notNullable();
    table.datetime("cycle_started_at").notNullable().comment("Lv.1 起算；首次 = T-0 遷移時");
    table.datetime("prestiged_at").notNullable().defaultTo(knex.fn.now());
    table.specificType(
      "cycle_days",
      "SMALLINT UNSIGNED GENERATED ALWAYS AS (DATEDIFF(prestiged_at, cycle_started_at)) STORED"
    );

    table.index(["user_id"], "idx_user");
    table.index(["prestige_count_after"], "idx_prestige_count");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_prestige_history");
};
