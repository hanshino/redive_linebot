/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .dropTableIfExists("number_gamble_history")
    .then(() => knex.schema.dropTableIfExists("user_gamble_option"))
    .then(() => knex.schema.dropTableIfExists("gamble_game"));
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .createTable("gamble_game", table => {
      table.increments("id").primary();
      table.string("type").notNullable().comment("遊戲類型");
      table.string("name").notNullable().comment("遊戲名稱");
      table.json("options").comment("遊戲選項");
      table.dateTime("start_at").comment("開始時間");
      table.dateTime("end_at").comment("結束時間");
      table.timestamps(true, true);
    })
    .then(() =>
      knex.schema.createTable("user_gamble_option", table => {
        table.increments("id").primary();
        table.string("user_id").notNullable().comment("使用者ID");
        table.bigInteger("gamble_game_id").notNullable().comment("遊戲ID");
        table.string("option").notNullable().comment("選項");
        table.integer("amount").notNullable().comment("金額");
        table.timestamps(true, true);
      })
    )
    .then(() =>
      knex.schema.createTable("number_gamble_history", table => {
        table.increments("id");
        table.string("user_id", 64).notNullable();
        table.string("option", 16).notNullable();
        table.string("dices", 16).notNullable().comment("ex: 1,2,3");
        table.integer("chips").notNullable();
        table.integer("payout").notNullable().comment("1: big/small, 5: double, 24: triple");
        table.tinyint("result").notNullable().comment("0: lose, 1: win");
        table.integer("reward").notNullable();
        table.index("user_id");
        table.timestamps(true, true);
      })
    );
};
