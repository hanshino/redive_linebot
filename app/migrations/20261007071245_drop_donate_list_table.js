/**
 * donate_list 已棄用：30 筆資料已全數以 history 型補登進 sponsorship（id 288–317，
 * note 標「歷史補登：donate_list #N」可回溯），排行與加成只讀 sponsorship。
 * down 只還原空表結構，資料需從備份還原。
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.dropTableIfExists("donate_list");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.createTable("donate_list", table => {
    table.increments("id").primary();
    table.string("user_id").notNullable().comment("使用者ID");
    table.integer("amount").notNullable().comment("捐款金額");
    table.timestamps(true, true);

    table.index("user_id");
  });
};
