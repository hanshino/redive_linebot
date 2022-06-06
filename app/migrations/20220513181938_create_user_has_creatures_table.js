/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_has_creatures", table => {
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
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_has_creatures");
};
