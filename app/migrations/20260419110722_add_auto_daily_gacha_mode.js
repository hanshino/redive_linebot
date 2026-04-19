/**
 * 為 user_auto_preference 新增自動抽卡的模式選擇。
 * 現行 auto_daily_gacha 仍是總開關；mode 決定開關打開時實際執行哪種抽卡路徑。
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("user_auto_preference", function (table) {
    table
      .enum("auto_daily_gacha_mode", ["normal", "pickup", "ensure", "europe"])
      .notNullable()
      .defaultTo("normal")
      .comment("自動抽卡模式：normal 普通 / pickup 機率調升 / ensure 保證 / europe 歐派");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("user_auto_preference", function (table) {
    table.dropColumn("auto_daily_gacha_mode");
  });
};
