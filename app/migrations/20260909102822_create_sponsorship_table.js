// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * sponsorship：站務（僅本人）人工登記的贊助帳本。
 *
 * 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §2.1。
 * `user_id` 對齊 `user.id`（signed int，見 20260323161743 那支 migration），
 * `new` 型必填既有玩家，`history` 型可為 null（未綁定，待本人核對後補綁）。
 *
 * `fingerprint` 只做「同一 request_id 重送時比對內容是否相同」，不建索引
 * （見規格 §2.1 說明：從未被拿來當查詢條件或反查重複）。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("sponsorship", table => {
    table.increments("id").primary();
    table.string("request_id", 64).notNullable().comment("前端冪等鍵，對應 Idempotency-Key");
    table.string("fingerprint", 64).notNullable().comment("canonical 請求內容的 SHA-256 hex");
    table.enu("type", ["new", "history"]).notNullable().comment("new:新贊助, history:歷史補登");
    table.integer("user_id").nullable().comment("對應 user.id；history 型可為 null（未綁定）");
    table.string("currency", 3).notNullable().defaultTo("TWD").comment("固定 TWD，非留白擴充");
    table.decimal("amount", 12, 2).unsigned().notNullable().comment("精確金額，正數");
    table.datetime("received_at").notNullable().comment("入帳時間，站務填寫");
    table.string("payment_method", 50).nullable();
    table.string("external_ref", 100).nullable().comment("外部對帳識別碼，選填，非唯一鍵");
    table.text("note").nullable();
    table.string("card_key", 20).nullable().comment("發卡贊助填；純贊助/歷史為 null");
    table
      .tinyint("card_count")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("history 固定 0；new 純贊助 0，發卡為實際張數");
    table.string("operator_user_id", 33).notNullable().comment("執行登記/補綁的本人 LINE userId");
    table.datetime("bound_at").nullable().comment("補綁完成時間，僅 history 補綁後有值");
    table.timestamps(true, true);

    table.unique("request_id");
    table.index("user_id");

    table.foreign("user_id").references("id").inTable("user");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("sponsorship");
};
