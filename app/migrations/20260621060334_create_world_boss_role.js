/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_role", table => {
    table.string("user_id", 33).notNullable().primary().comment("LINE platform_id");
    table.enu("role", ["dps", "healer", "tank"]).notNullable();
    table.timestamp("chosen_at").defaultTo(knex.fn.now());
    table.integer("reselect_count").notNullable().defaultTo(0).comment("0 = 仍有免費重選");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_role");
};
