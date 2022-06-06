/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("creatures", table => {
    table.increments("id").primary();

    table.string("name").notNullable().comment("培養角色名稱");
    table.string("description").notNullable().comment("培養角色描述");
    table.string("image_url").notNullable().comment("培養角色圖片網址");
    table
      .integer("is_able_to_create")
      .notNullable()
      .comment("是否可以培養, 0: 不可培養, 1: 可培養");
    table.integer("max_level").notNullable().comment("最高等級");
    table.integer("max_favorability").notNullable().comment("最高好感度");
    table.integer("max_stamina").notNullable().comment("最高耐力");
    table.integer("max_satiety").notNullable().comment("最高飽足度");

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("creatures");
};
