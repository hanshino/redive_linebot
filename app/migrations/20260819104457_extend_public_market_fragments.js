// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * public_market 同時支援角色與角色碎片掛單。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("public_market", table => {
    table.enu("item_kind", ["character", "fragment"]).notNullable().defaultTo("character");
    table.integer("quantity").unsigned().notNullable().defaultTo(1);
  });

  await knex.schema.alterTable("public_market", table => {
    table.dropIndex(null, "idx_public_market_book");
  });

  await knex.schema.alterTable("public_market", table => {
    table.index(
      ["item_kind", "item_id", "order_type", "status", "price"],
      "idx_public_market_book"
    );
  });

  await knex.raw(
    "ALTER TABLE `public_market` ADD CONSTRAINT `chk_public_market_quantity_positive` CHECK (`quantity` > 0), " +
      "ADD CONSTRAINT `chk_public_market_character_quantity` CHECK (`item_kind` = 'fragment' OR `quantity` = 1)"
  );
};

/**
 * Fragment rows contain asset semantics that would be lost by removing item_kind.
 *
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  const row = await knex("public_market")
    .where({ item_kind: "fragment" })
    .count({ c: "*" })
    .first();
  const fragmentCount = Number((row && row.c) || 0);

  if (fragmentCount > 0) {
    throw new Error(
      `Refusing destructive rollback: public_market still has ${fragmentCount} fragment listing(s). ` +
        "Cancel them first before removing fragment support."
    );
  }

  await knex.raw("ALTER TABLE `public_market` DROP CHECK `chk_public_market_quantity_positive`");
  await knex.raw("ALTER TABLE `public_market` DROP CHECK `chk_public_market_character_quantity`");

  await knex.schema.alterTable("public_market", table => {
    table.dropIndex(null, "idx_public_market_book");
    table.dropColumn("item_kind");
    table.dropColumn("quantity");
  });

  await knex.schema.alterTable("public_market", table => {
    table.index(["item_id", "order_type", "status", "price"], "idx_public_market_book");
  });
};
