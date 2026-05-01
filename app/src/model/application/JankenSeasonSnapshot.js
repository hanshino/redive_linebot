const mysql = require("../../util/mysql");

const TABLE = "janken_season_snapshot";

exports.bulkInsert = async function (seasonId, rows, trx) {
  if (!rows || rows.length === 0) return undefined;
  const db = trx || mysql;
  const data = rows.map(r => ({
    season_id: seasonId,
    rank: r.rank,
    user_id: r.user_id,
    display_name: r.display_name || null,
    elo: r.elo,
    rank_tier: r.rank_tier,
    win_count: r.win_count || 0,
    lose_count: r.lose_count || 0,
    draw_count: r.draw_count || 0,
    max_streak: r.max_streak || 0,
  }));
  await db(TABLE).insert(data);
  return undefined;
};

exports.getBySeason = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId }).orderBy("rank", "asc");
};
