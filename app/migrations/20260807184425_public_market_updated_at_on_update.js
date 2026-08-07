// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * public_market.updated_at 補上 `ON UPDATE CURRENT_TIMESTAMP`。
 *
 * 原本的 `table.timestamps(true, true)` 只會產出 `DEFAULT CURRENT_TIMESTAMP`，
 * 於是 updated_at 永遠停在建立當下，改狀態（成交／取消／失效）都不會前進 ——
 * 語意上是錯的，任何把它當「最後修改時間」讀的人都會被誤導。
 *
 * 目前實際影響為零：getClosedListingsByUser 的
 * `COALESCE(sold_at, closed_at, updated_at)` 前兩者在已結束的列上必有值，
 * 走不到 updated_at 這個 fallback。這裡純粹是把欄位語意修正。
 *
 * 用 raw ALTER 而非 knex schema builder：後者沒有表達 ON UPDATE 的 API。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.raw(
    "ALTER TABLE `public_market` MODIFY `updated_at` TIMESTAMP NOT NULL " +
      "DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );
};

/**
 * 還原成單純的 DEFAULT CURRENT_TIMESTAMP（沒有 ON UPDATE），
 * 即 timestamps(true, true) 原本的樣子。
 *
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.raw(
    "ALTER TABLE `public_market` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
  );
};
