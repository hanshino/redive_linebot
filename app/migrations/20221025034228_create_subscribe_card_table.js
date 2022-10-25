/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscribe_card", table => {
    table.increments("id").primary();

    table.string("key").notNullable().comment("唯一識別碼").unique();
    table.string("name", 40).notNullable().comment("卡片名稱");
    table.integer("price").unsigned().notNullable().comment("卡片價格");
    table.integer("duration").unsigned().notNullable().comment("卡片有效期限（天）");
    table.json("effects").notNullable().comment("卡片效果");

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("subscribe_card");
};
