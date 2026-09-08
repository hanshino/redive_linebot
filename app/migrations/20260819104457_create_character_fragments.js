// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * 角色碎片庫存：每個 user／item 只有一筆 balance row。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("character_fragments", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable().collate("utf8mb4_0900_ai_ci");
    table.integer("item_id").unsigned().notNullable().comment("角色 ID，對應 GachaPool.ID");
    table.integer("amount").unsigned().notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.unique(["user_id", "item_id"], "uq_character_fragments_user_item");
    table.index(["user_id", "amount"], "idx_character_fragments_user_amount");
    // GachaPool.ID 是 signed INT，而本表 item_id 要求 unsigned；MySQL 不允許
    // 不同 signedness 的 FK，故保留 item index，並以應用層維持對應關係。
    table.index(["item_id"], "idx_character_fragments_item");
  });

  await knex.raw(
    "ALTER TABLE `character_fragments` ADD CONSTRAINT `chk_character_fragments_amount_nonnegative` CHECK (`amount` >= 0)"
  );
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("character_fragments");
};
