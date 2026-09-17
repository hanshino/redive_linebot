// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * 自動猜拳配對：成就事件 outbox（只承載 janken_win／janken_challenge）。
 * 見 docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md KTD4。
 *
 * 與結算同一交易寫入；consumer 逐列 FOR UPDATE SKIP LOCKED，效果與 processed_at 同交易，
 * 失敗 rollback 後列回 pending 並累加 attempts／last_error。unique (match_id, role, event_name)：
 * p2 勝出時 p2 同時有 janken_win 與 janken_challenge 兩列，故 role 必須進 unique key。
 * payload 只放下游最小快照（結果、streak、feature），不含任何成就條件。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_auto_match_outbox", table => {
    table.bigIncrements("id").primary();
    table.string("match_id", 36).notNullable().comment("= janken_records.id");
    table.enu("role", ["p1", "p2"]).notNullable();
    table.string("event_name", 32).notNullable().comment("janken_win | janken_challenge");
    table.date("run_date").notNullable().comment("該場所屬 Asia/Taipei 曆日；跨日處理仍歸此日");
    table.string("user_id", 33).notNullable().comment("事件主體 LINE User ID");
    table.json("payload").nullable().comment("下游最小快照");
    table.datetime("occurred_at").notNullable();
    table.integer("attempts").unsigned().notNullable().defaultTo(0);
    table.text("last_error").nullable();
    table.datetime("processed_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["match_id", "role", "event_name"], "uq_janken_auto_match_outbox_event");
    table.index(["processed_at", "id"], "idx_janken_auto_match_outbox_pending");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("janken_auto_match_outbox");
};
