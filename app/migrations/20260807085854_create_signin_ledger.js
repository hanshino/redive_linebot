// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * signin_ledger：一天一列的簽到帳本，取代 signin_days 的「單列 + sum_days」設計。
 * 舊表保留不動（不再讀寫、也不 drop），避免歷史查詢與回滾風險。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("signin_ledger", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable();
    table.date("signin_date").notNullable().comment("UTC+8 date");
    table.enu("source", ["normal", "makeup"]).notNullable().comment("normal:每日一抽, makeup:補簽");
    table.integer("cost_stones").notNullable().defaultTo(0).comment("補簽花費女神石");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["user_id", "signin_date"], "uq_signin_user_date");
    table.index("signin_date", "idx_signin_date");
  });

  // 當月回填：以 DB 的 +08 session 時區把 gacha_record.created_at 折成日期，
  // 一次 set-based INSERT ... SELECT，不逐列跑。只補當月，更早的月份不回填
  // （補簽只允許當月，回填更早等於送出無法對應的歷史）。
  await knex.raw(`
    INSERT IGNORE INTO signin_ledger (user_id, signin_date, source, cost_stones, created_at)
    SELECT
      user_id,
      DATE(created_at) AS signin_date,
      'normal',
      0,
      MIN(created_at)
    FROM gacha_record
    WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
    GROUP BY user_id, DATE(created_at)
  `);
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("signin_ledger");
};
