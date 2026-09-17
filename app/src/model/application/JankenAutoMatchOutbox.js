const { pick } = require("lodash");
const base = require("../base");

const EVENT_NAMES = Object.freeze(["janken_win", "janken_challenge"]);

/**
 * 自動配對成就事件 outbox（KTD4）。unique (match_id, role, event_name)。
 * 寫入方（U3 結算 core）與結算同 trx；consumer（U4）另行實作。
 */
class JankenAutoMatchOutbox extends base {
  /**
   * 與結算同一交易內批次寫入事件。`payload` 若為物件會自動 JSON.stringify。
   * @param {Array<Object>} rows
   * @param {import("knex").Knex.Transaction} trx
   */
  async insertEvents(rows, trx) {
    const data = rows.map(row => {
      if (!EVENT_NAMES.includes(row.event_name)) {
        throw Object.assign(new Error("Unsupported janken auto-match outbox event"), {
          code: "INVALID_JANKEN_AUTO_MATCH_OUTBOX_EVENT",
        });
      }
      const picked = pick(row, this.fillable);
      if (picked.payload !== undefined && picked.payload !== null) {
        if (typeof picked.payload !== "string") picked.payload = JSON.stringify(picked.payload);
      }
      return picked;
    });
    return await this.insert(data, trx);
  }
}

module.exports = new JankenAutoMatchOutbox({
  table: "janken_auto_match_outbox",
  fillable: [
    "match_id",
    "role",
    "event_name",
    "run_date",
    "user_id",
    "payload",
    "occurred_at",
    "attempts",
    "last_error",
    "processed_at",
  ],
});
module.exports.EVENT_NAMES = EVENT_NAMES;
