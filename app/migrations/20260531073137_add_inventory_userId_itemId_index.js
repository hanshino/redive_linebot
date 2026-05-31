/**
 * Add a composite index on Inventory(userId, itemId).
 *
 * Root cause of several slow `/me` and gacha queries: `Inventory` only had
 * PRIMARY(ID), so every `WHERE userId = ? ... ORDER BY itemId` did a full table
 * scan (~660k rows) plus a filesort. The composite index covers both the
 * userId equality filter and the itemId ordering, eliminating both.
 *
 * Online DDL: on MySQL 8 InnoDB, adding a secondary index runs in-place with
 * `ALGORITHM=INPLACE, LOCK=NONE` (concurrent reads + writes stay allowed), so
 * this is safe to apply on the live table. It still builds over ~660k rows —
 * run it off-peak and confirm the maintenance window with the repo owner.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("Inventory", table => {
    table.index(["userId", "itemId"], "idx_inventory_userId_itemId");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("Inventory", table => {
    table.dropIndex(["userId", "itemId"], "idx_inventory_userId_itemId");
  });
};
