/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("IanUser");
  await knex.schema.dropTableIfExists("GuildBattle");
  await knex.schema.dropTableIfExists("GuildWeek");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.createTable("IanUser", table => {
    table.increments("id").primary();
    table.integer("platform").notNullable();
    table.string("userId").notNullable();
    table.string("ianUserId").notNullable();
    table.datetime("createDTM").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("GuildBattle", table => {
    table.increments("id").primary();
    table.string("guildId").notNullable();
    table.string("formId").notNullable();
    table.string("month").notNullable();
  });
  await knex.schema.createTable("GuildWeek", table => {
    table.increments("id").primary();
    table.string("guildId").notNullable();
    table.string("month").notNullable();
    table.integer("week").defaultTo(1);
    table.datetime("modifyDTM").defaultTo(knex.fn.now());
  });
};
