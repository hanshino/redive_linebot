const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_exp_daily";
const fillable = [
  "user_id",
  "date",
  "raw_exp",
  "effective_exp",
  "msg_count",
  "honeymoon_active",
  "trial_id",
];

class ChatExpDaily extends Base {}

const model = new ChatExpDaily({ table: TABLE, fillable });

exports.model = model;

exports.findByUserDate = (userId, date) => model.first({ filter: { user_id: userId, date } });

/**
 * 以 (user_id, date) 為鍵 upsert，raw_exp / effective_exp / msg_count 為累加型欄位。
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.date          YYYY-MM-DD (UTC+8)
 * @param {number} params.rawExp        增量 (add to raw_exp)
 * @param {number} params.effectiveExp  增量 (add to effective_exp)
 * @param {number} params.msgCount      增量 (add to msg_count)
 * @param {boolean} params.honeymoonActive
 * @param {number|null} params.trialId
 */
exports.upsertByUserDate = async ({
  userId,
  date,
  rawExp,
  effectiveExp,
  msgCount,
  honeymoonActive,
  trialId,
}) => {
  return mysql.raw(
    `INSERT INTO ${TABLE}
       (user_id, date, raw_exp, effective_exp, msg_count, honeymoon_active, trial_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       raw_exp = raw_exp + VALUES(raw_exp),
       effective_exp = effective_exp + VALUES(effective_exp),
       msg_count = msg_count + VALUES(msg_count),
       honeymoon_active = VALUES(honeymoon_active),
       trial_id = VALUES(trial_id)`,
    [userId, date, rawExp, effectiveExp, msgCount, honeymoonActive, trialId]
  );
};
