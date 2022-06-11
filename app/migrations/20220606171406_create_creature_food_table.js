/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("creature_food", table => {
    table.increments("id").primary();
    table.integer("creature_id").notNullable().comment("培養角色的id").unsigned();
    table.string("name").notNullable().comment("食物名稱");
    table.string("image_url").notNullable().comment("食物圖片");
    table.string("description").notNullable().comment("食物描述");
    table
      .string("access_way")
      .notNullable()
      .defaultTo("free")
      .comment("取得方式, free: 自由取得, buy: 購買取得, job: 工作取得");
    table
      .json("effects")
      .nullable()
      .comment(
        "效果類型(物件陣列), 可能有多個效果, ex: [{type: 'satiety', value: 1}, {type: 'stamina', value: 1}]"
      );
    table.integer("price").notNullable().defaultTo(0).comment("價格, 只有在購買時才會用到");

    table.timestamps(true, true);
    table.foreign("creature_id").references("creatures.id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("creature_food");
};
