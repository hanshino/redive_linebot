const mysql = require("../../util/mysql");
const { canonicalUnsignedInteger } = require("../../util/decimalInteger");

const TABLE = "world_boss_score_event";

// direct = 自己打出的 raw damage；assist = 留下效果的人；relay = 接棒引爆 banner 的人。
const KINDS = { DIRECT: "direct", ASSIST: "assist", RELAY: "relay" };

function fail(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Competition ranking：同分同名次，下一名跳號（1,1,3）。rows 必須已按 `total_score`
 * 遞減、user_id 遞增排好；名次只由分數決定，不受 limit 截斷影響。
 */
function withCompetitionRank(rows) {
  let previousScore = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const totalScore = canonicalUnsignedInteger(row.total_score);
    const ranking = previousScore === totalScore ? previousRank : index + 1;
    previousScore = totalScore;
    previousRank = ranking;
    return { ...row, total_score: totalScore, ranking };
  });
}

exports.insertMany = async function (trx, rows) {
  if (!rows.length) return;
  await trx(TABLE).insert(rows);
};

/**
 * 賽季總分。SUM(points) 交給 MySQL 算，回字串 —— BIGINT 加總會超過 Number.MAX_SAFE_INTEGER。
 */
exports.sumSeasonScore = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ season_id: seasonId, beneficiary_user_id: userId })
    .sum({ total: "points" })
    .first();
  return row.total === null || row.total === undefined ? "0" : canonicalUnsignedInteger(row.total);
};

/**
 * 個人賽季分數拆帳。缺席的 kind 回 "0" 而不是 null，呼叫端不必判空。
 *
 * v1 舊資料在 migration 被 backfill 成 legacy `direct`（points = contribution.damage），
 * 所以舊玩家的 direct 是混合值：v1 的實際扣血 + v2 的 raw damage。這是刻意的，分數本來
 * 就不該因為改版歸零。
 */
exports.seasonScoreByKind = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  const rows = await db(TABLE)
    .where({ season_id: seasonId, beneficiary_user_id: userId })
    .select("kind")
    .sum({ total: "points" })
    .groupBy("kind");
  const totals = { direct: "0", assist: "0", relay: "0" };
  for (const row of rows) totals[row.kind] = canonicalUnsignedInteger(row.total);
  return totals;
};

function rankingQuery(db, seasonId) {
  return db(TABLE)
    .where({ season_id: seasonId })
    .select({ user_id: "beneficiary_user_id" })
    .sum({ total_score: "points" })
    .groupBy("beneficiary_user_id")
    .orderBy("total_score", "desc")
    .orderBy("beneficiary_user_id", "asc");
}

/**
 * 排行榜。分數來源是 score event，不是 contribution.damage —— 兩者在 v2 之後不再相等
 * （overkill 計分不扣血、assist/relay 的受益者不是出手的人）。
 */
exports.seasonRanking = async function (seasonId, limit, trx) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("INVALID_RANKING_LIMIT");
  const db = trx || mysql;
  return withCompetitionRank(await rankingQuery(db, seasonId).limit(limit));
};

exports.seasonRankingAll = async function (seasonId, trx) {
  const db = trx || mysql;
  return withCompetitionRank(await rankingQuery(db, seasonId));
};

/**
 * 一次攻擊產生的分數拆帳，供 DTO 使用。一次攻擊每個 kind 至多一筆，所以直接覆寫即可。
 * 缺席的 kind 是 "0" 而不是 null，呼叫端不必判空。注意 assist 的受益者是留下效果的人，
 * 不是攻擊者本人。
 */
exports.breakdown = function (rows) {
  const totals = { direct: "0", assist: "0", relay: "0" };
  for (const row of rows) totals[row.kind] = canonicalUnsignedInteger(row.points);
  return totals;
};

exports.TABLE = TABLE;
exports.KINDS = KINDS;
exports.withCompetitionRank = withCompetitionRank;
