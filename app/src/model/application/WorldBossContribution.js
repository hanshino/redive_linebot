const mysql = require("../../util/mysql");

const TABLE = "world_boss_contribution";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function withCompetitionRank(rows) {
  let previousDamage = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const damage = Number(row.total_damage);
    const ranking = previousDamage === damage ? previousRank : index + 1;
    previousDamage = damage;
    previousRank = ranking;
    return { ...row, total_damage: damage, ranking };
  });
}

function rankingQuery(db, seasonId) {
  return db(TABLE)
    .where({ season_id: seasonId })
    .select("user_id")
    .sum({ total_damage: "damage" })
    .groupBy("user_id")
    .orderBy("total_damage", "desc")
    .orderBy("user_id", "asc");
}

exports.sumCostInRange = async function (userId, startUtc, endUtc, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ user_id: userId })
    .where("created_at", ">=", startUtc)
    .where("created_at", "<", endUtc)
    .sum({ total_cost: "cost" })
    .first();
  return Number(row.total_cost) || 0;
};

exports.seasonRanking = async function (seasonId, limit, trx) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw fail("INVALID_RANKING_LIMIT");
  }
  const db = trx || mysql;
  return withCompetitionRank(await rankingQuery(db, seasonId).limit(limit));
};

exports.seasonRankingAll = async function (seasonId, trx) {
  const db = trx || mysql;
  return withCompetitionRank(await rankingQuery(db, seasonId));
};

exports.sumSeasonDamage = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ season_id: seasonId, user_id: userId })
    .sum({ total: "damage" })
    .first();
  return Number(row.total) || 0;
};

exports.withCompetitionRank = withCompetitionRank;
