/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("janken_pair_stats", table => {
    table.string("player_a", 33).notNullable();
    table.string("player_b", 33).notNullable();
    table.integer("matches").notNullable().defaultTo(0);
    table.integer("a_wins").notNullable().defaultTo(0);
    table.integer("b_wins").notNullable().defaultTo(0);
    table.integer("draws").notNullable().defaultTo(0);
    table.timestamp("last_match_at").notNullable().defaultTo(knex.fn.now());
    table.primary(["player_a", "player_b"]);
  });

  await knex.schema.alterTable("janken_rating", table => {
    table.string("last_won_opponent_id", 33).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("janken_rating", table => {
    table.dropColumn("last_won_opponent_id");
  });
  await knex.schema.dropTable("janken_pair_stats");
};
