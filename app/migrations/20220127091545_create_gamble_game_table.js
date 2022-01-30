/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("gamble_game", table => {
    table.increments("id").primary();
    table.string("type").notNullable().comment("遊戲類型");
    table.string("name").notNullable().comment("遊戲名稱");
    table.json("options").comment("遊戲選項");
    table.dateTime("start_at").comment("開始時間");
    table.dateTime("end_at").comment("結束時間");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gamble_game");
};
