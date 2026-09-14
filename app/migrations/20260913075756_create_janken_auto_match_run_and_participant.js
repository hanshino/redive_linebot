// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * 自動猜拳配對：每日 run claim 與 participant manifest。
 * 見 docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md KTD1／KTD2。
 *
 * - `janken_auto_match_run`：`run_date`（Asia/Taipei 曆日）為 PK，worker 以普通 INSERT 搶佔，
 *   撞 PK 的 ER_DUP_ENTRY 即代表當天已在跑或已跑過。沒有這列 = 當天「未執行」。
 * - `janken_auto_match_participant`：claim 同交易內寫入、之後不可變的 manifest。
 *   狀態只單向推進：bye 終態；not_started → completed（與結算同 commit）或 failed（status-only CAS）。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("janken_auto_match_run", table => {
    table.date("run_date").primary().comment("Asia/Taipei 曆日，一天一列的 durable claim");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("janken_auto_match_participant", table => {
    table.date("run_date").notNullable();
    table.string("user_id", 33).notNullable().comment("LINE User ID");
    table
      .string("match_id", 36)
      .nullable()
      .comment("配到對手時的場次 id（= janken_records.id）；bye 為 null");
    table.enu("role", ["p1", "p2"]).nullable().comment("bye 為 null");
    table.string("opponent_user_id", 33).nullable().comment("bye 為 null");
    table.string("choice", 10).nullable().comment("manifest 寫入時預抽的出拳；bye 為 null");
    table
      .integer("match_generation")
      .unsigned()
      .notNullable()
      .comment("寫入當下 user_auto_preference.auto_match_generation 快照");
    table
      .boolean("bet_enabled")
      .notNullable()
      .defaultTo(false)
      .comment("寫入當下 auto_match_bet_enabled 快照");
    table
      .integer("bet_generation")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("寫入當下 auto_match_bet_generation 快照");
    table
      .integer("bet_cap")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("寫入當下 auto_match_bet_cap 快照；執行時取 min(快照, 即時)");
    table
      .enu("status", ["bye", "not_started", "completed", "failed"])
      .notNullable()
      .comment("bye 終態；not_started 只能單向推進到 completed 或 failed");
    table.timestamps(true, true);

    table.primary(["run_date", "user_id"]);
    table.index("match_id", "idx_janken_auto_match_participant_match_id");
    table
      .foreign("run_date")
      .references("run_date")
      .inTable("janken_auto_match_run")
      .onDelete("RESTRICT");
  });

  // timestamps(true, true) 不會產 ON UPDATE；status CAS 要能前進 updated_at（比照 public_market）。
  await knex.raw(
    "ALTER TABLE `janken_auto_match_participant` MODIFY `updated_at` TIMESTAMP NOT NULL " +
      "DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("janken_auto_match_participant");
  await knex.schema.dropTableIfExists("janken_auto_match_run");
};
