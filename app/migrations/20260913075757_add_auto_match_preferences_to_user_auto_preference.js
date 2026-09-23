// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * user_auto_preference 新增自動配對的兩個獨立同意：參與（auto_match）與下注（auto_match_bet）。
 * 見 docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md KTD12。
 *
 * 每個開關各有 generation：使用者 off → on 時遞增；manifest 快照的 generation 與即時值不同即授權失效。
 * 下注另有 cap（0 為合法值，代表不下注）；參與沒有 cap。與既有 auto_janken_fate 系列完全獨立。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("user_auto_preference", table => {
    table
      .boolean("auto_match_enabled")
      .notNullable()
      .defaultTo(false)
      .comment("是否參與每日自動配對（預設關閉）");
    table
      .integer("auto_match_generation")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("參與同意版本；off→on 遞增");
    table
      .boolean("auto_match_bet_enabled")
      .notNullable()
      .defaultTo(false)
      .comment("是否同意在自動配對中下注（預設關閉）");
    table
      .integer("auto_match_bet_generation")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("下注同意版本；off→on 遞增");
    table
      .integer("auto_match_bet_cap")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("自動配對下注上限（女神石）；0 為合法值");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("user_auto_preference", table => {
    table.dropColumn("auto_match_enabled");
    table.dropColumn("auto_match_generation");
    table.dropColumn("auto_match_bet_enabled");
    table.dropColumn("auto_match_bet_generation");
    table.dropColumn("auto_match_bet_cap");
  });
};
