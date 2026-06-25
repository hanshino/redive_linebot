// Read-side queries for the chat word-cloud feature (M5).
//
// All views are derived from topic_daily by GROUP BY keyword over a UTC+8
// date window. See docs/plans/2026-06-22-topic-heat-keywords-concept.md.
//
// keyword cardinality is open-vocabulary, so callers always cap the result;
// LIMIT_CAP keeps a single giga bubble under ~10KB (12 rows ≈ 8.5KB).

const moment = require("moment");
const mysql = require("../../util/mysql");

const TABLE = "topic_daily";
const TPE_OFFSET_MIN = 480;
const LIMIT_CAP = 12;

// First day (inclusive) of an N-day window ending today, on the UTC+8 calendar.
// days=30 -> [today-29 .. today]; days=7 -> [today-6 .. today].
function windowStartDate(days) {
  const span = Math.max(1, days) - 1;
  return moment().utcOffset(TPE_OFFSET_MIN).subtract(span, "day").format("YYYY-MM-DD");
}

function capLimit(limit) {
  return Math.min(Math.max(1, limit), LIMIT_CAP);
}

/**
 * 個人文字雲：某使用者近 N 天的高頻用字。
 * groupId 給定時只看該群（本群個人雲）；省略時跨所有群聚合（1:1 私聊情境）。
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {?string} [options.groupId=null] 指定群組；null 代表跨群聚合
 * @param {number} [options.days=30]       回溯天數（UTC+8 日界線）
 * @param {number} [options.limit=12]      最多回傳幾個詞（上限 12）
 * @returns {Promise<Array<{keyword: string, count: number}>>} desc by count
 */
exports.topUserKeywords = async (userId, { groupId = null, days = 30, limit = 12 } = {}) => {
  const query = mysql(TABLE)
    .select("keyword")
    .sum({ count: "message_count" })
    .where("user_id", userId)
    .andWhere("stat_date", ">=", windowStartDate(days))
    .groupBy("keyword")
    .orderBy("count", "desc")
    .limit(capLimit(limit));

  if (groupId) query.andWhere("group_id", groupId);

  const rows = await query;
  return rows.map(r => ({ keyword: r.keyword, count: Number(r.count) }));
};

/**
 * 群組文字雲：某群近 N 天的高頻用字（聚合，不掛人名）。
 * userCount = 講過該詞的不同人數，比訊息數更能反映「真的在被討論」。
 *
 * @param {string} groupId
 * @param {object} [options]
 * @param {number} [options.days=30]  回溯天數（UTC+8 日界線）
 * @param {number} [options.limit=12] 最多回傳幾個詞（上限 12）
 * @returns {Promise<Array<{keyword: string, count: number, userCount: number}>>} desc by count
 */
exports.topGroupKeywords = async (groupId, { days = 30, limit = 12 } = {}) => {
  const rows = await mysql(TABLE)
    .select("keyword")
    .sum({ count: "message_count" })
    .countDistinct({ userCount: "user_id" })
    .where("group_id", groupId)
    .andWhere("stat_date", ">=", windowStartDate(days))
    .groupBy("keyword")
    .orderBy("count", "desc")
    .limit(capLimit(limit));

  return rows.map(r => ({
    keyword: r.keyword,
    count: Number(r.count),
    userCount: Number(r.userCount),
  }));
};

exports._internal = { windowStartDate, capLimit, LIMIT_CAP };
