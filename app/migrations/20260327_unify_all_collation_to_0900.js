/**
 * Unify all tables to utf8mb4_0900_ai_ci collation.
 *
 * The database has a mix of utf8mb4_unicode_ci (old tables from MySQL 5.x era)
 * and utf8mb4_0900_ai_ci (MySQL 8 default, used by newer tables).
 * This causes ER_CANT_AGGREGATE_2COLLATIONS on any JOIN between old and new tables.
 *
 * CONVERT TO CHARACTER SET changes both the table default and all existing
 * string columns (varchar, char, text, etc.) in one operation.
 *
 * Tables converted:
 *   user, Admin, CustomerOrder, GachaPool, GlobalOrders,
 *   Guild, GuildConfig, GuildMembers, Inventory, gacha_record
 */

const OLD_TABLES = [
  "user",
  "Admin",
  "CustomerOrder",
  "GachaPool",
  "GlobalOrders",
  "Guild",
  "GuildConfig",
  "GuildMembers",
  "Inventory",
  "gacha_record",
];

exports.up = async function (knex) {
  for (const table of OLD_TABLES) {
    await knex.raw(
      `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  }
};

exports.down = async function (knex) {
  for (const table of OLD_TABLES) {
    await knex.raw(
      `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  }
};
