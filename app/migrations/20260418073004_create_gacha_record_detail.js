/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_record_detail", function (table) {
    table.bigIncrements("id").primary();

    table.integer("gacha_record_id").unsigned().notNullable().comment("對應 gacha_record.id");
    table.string("user_id", 33).notNullable().comment("LINE User ID（冗餘，避免查詢時多次 join）");
    table.integer("character_id").notNullable().comment("對應 GachaPool.id（角色或女神石 999）");
    table.tinyint("star").notNullable().comment("1=銀, 2=金, 3=彩");
    table
      .boolean("is_new")
      .notNullable()
      .defaultTo(false)
      .comment("本次抽卡對此使用者是否為首次獲得");

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["user_id", "created_at"], "idx_user_created");
    table.foreign("gacha_record_id").references("gacha_record.id").onDelete("CASCADE");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_record_detail");
};
