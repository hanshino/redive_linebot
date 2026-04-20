/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("lottery_user_order");
  await knex.schema.dropTableIfExists("lottery_main");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.createTable("lottery_main", function (table) {
    table.increments("id").primary();
    table.enum("status", ["selling", "drawed", "closed"]).notNullable();
    table.string("result");
    table.integer("carryover_money").defaultTo(0);
    table.dateTime("exchange_expired_at");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("lottery_user_order", function (table) {
    table.increments("id").primary();
    table.integer("lottery_main_id").unsigned().notNullable();
    table.string("user_id").notNullable();
    table.string("content").notNullable();
    table
      .enum("status", ["initial", "exchanged", "canceled", "expired"])
      .notNullable()
      .defaultTo("initial");
    table.enum("buy_type", ["manual", "auto"]).notNullable().defaultTo("manual");
    table.enum("result", ["first", "second", "third", "fourth", "fifth"]).nullable();
    table.timestamps(true, true);
    table.foreign("lottery_main_id").references("id").inTable("lottery_main");
  });
};
