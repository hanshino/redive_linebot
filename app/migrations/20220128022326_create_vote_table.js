/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("vote", table => {
    table.increments("id").primary();
    table.string("host_user_id").notNullable().comment("主持人的使用者 ID");
    table.string("title").notNullable().comment("投票主題");
    table.string("description").notNullable().comment("投票說明");
    table.string("banner_url").notNullable().comment("投票圖片");
    table.json("options").notNullable().comment("投票選項");
    table.dateTime("start_time").notNullable().comment("投票開始時間");
    table.dateTime("end_time").notNullable().comment("投票結束時間");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("vote");
};
