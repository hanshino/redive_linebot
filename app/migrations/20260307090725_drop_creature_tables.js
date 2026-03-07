/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .dropTableIfExists("creature_history")
    .then(() => knex.schema.dropTableIfExists("creature_food"))
    .then(() => knex.schema.dropTableIfExists("user_has_creatures"))
    .then(() => knex.schema.dropTableIfExists("creatures"));
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .createTable("creatures", table => {
      table.increments("id").primary();
      table.string("name").notNullable().comment("培養角色名稱");
      table.string("description").notNullable().comment("培養角色描述");
      table.string("image_url").notNullable().comment("培養角色圖片網址");
      table.integer("is_able_to_create").notNullable().comment("是否可以培養, 0: 不可培養, 1: 可培養");
      table.integer("max_level").notNullable().comment("最高等級");
      table.integer("max_favorability").notNullable().comment("最高好感度");
      table.integer("max_stamina").notNullable().comment("最高耐力");
      table.integer("max_satiety").notNullable().comment("最高飽足度");
      table.timestamps(true, true);
    })
    .then(() =>
      knex.schema.createTable("user_has_creatures", table => {
        table.increments("id").primary();
        table.integer("user_id").notNullable().comment("使用者 id");
        table.integer("creature_id").unsigned().notNullable().comment("培養角色 id");
        table.string("nickname").notNullable().comment("角色名稱");
        table.integer("level").notNullable().defaultTo(1).comment("等級");
        table.integer("exp").notNullable().defaultTo(1).comment("經驗值");
        table.integer("favorability").notNullable().defaultTo(1).comment("好感度");
        table.integer("stamina").notNullable().defaultTo(1).comment("耐力");
        table.integer("satiety").notNullable().defaultTo(1).comment("飽足度");
        table.timestamps(true, true);
        table.unique(["user_id", "creature_id"]);
        table.foreign("user_id").references("User.No");
        table.foreign("creature_id").references("creatures.id");
      })
    )
    .then(() =>
      knex.schema.createTable("creature_history", table => {
        table.increments("id").primary();
        table.integer("user_has_creature_id").notNullable().unsigned().comment("使用者培養角色 id");
        table.string("action").notNullable().comment("動作類型");
        table.json("data").notNullable().comment("動作資料");
        table.timestamps(true, true);
        table.foreign("user_has_creature_id").references("user_has_creatures.id");
      })
    )
    .then(() =>
      knex.schema.createTable("creature_food", table => {
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
      })
    );
};
