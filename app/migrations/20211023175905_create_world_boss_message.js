// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  // 此表目的為，使用特定角色進行攻擊的時候，發送到聊天室的訊息設定
  return knex.schema.createTable("world_boss_user_attack_message", table => {
    table.increments("id").primary();

    table.integer("unit_id").notNullable().comment("角色 id");
    table.string("template").notNullable().comment("訊息樣板");
    table.integer("creator_id").notNullable().comment("建立者 id");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_message");
};
