/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  // Unknown historical crossings stay NULL; no backfill or processing-time default.
  return knex.schema.alterTable("chat_user_data", table => {
    table.timestamp("final_max_level_reached_at", { precision: 3 }).nullable().defaultTo(null);
    // Explicitly adopted historical finish order only (1 = earliest), never inferred time.
    table.integer("final_max_level_legacy_order").unsigned().nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("chat_user_data", table => {
    table.dropColumns("final_max_level_reached_at", "final_max_level_legacy_order");
  });
};
