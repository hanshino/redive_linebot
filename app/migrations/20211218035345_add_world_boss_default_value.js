// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  //  將 attack, defense, speed, luck 加入預設值
  return knex.schema.alterTable("world_boss", table => {
    table.integer("attack").defaultTo(0).notNullable().alter();
    table.integer("defense").defaultTo(0).notNullable().alter();
    table.integer("speed").defaultTo(0).notNullable().alter();
    table.integer("luck").defaultTo(0).notNullable().alter();
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  //  將 attack, defense, speed, luck 移除預設值
  return knex.schema.alterTable("world_boss", table => {
    table.integer("attack").alter();
    table.integer("defense").alter();
    table.integer("speed").alter();
    table.integer("luck").alter();
  });
};
