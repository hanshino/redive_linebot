const mysql = require("../../util/mysql");

const TABLE = "world_boss_season_reward";

exports.tryInsert = async function (payload, trx) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert(payload);
    return true;
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") return false;
    throw error;
  }
};

exports.findForUpdate = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId, user_id: userId }).forUpdate().first();
};

exports.findLatestSettledByUser = async function (userId, trx) {
  const db = trx || mysql;
  return db(`${TABLE} as reward`)
    .join("world_boss_season as season", "reward.season_id", "season.id")
    .leftJoin("titles as title", "reward.title_key", "title.key")
    .where("reward.user_id", userId)
    .whereNotNull("reward.paid_at")
    .select(
      "reward.id as rewardId",
      "reward.season_id as seasonId",
      "season.name as seasonName",
      "reward.ranking as ranking",
      "reward.total_damage as totalDamage",
      "reward.stone_amount as stoneAmount",
      "reward.title_key as titleKey",
      "title.name as titleName",
      "reward.paid_at as paidAt",
      "season.settled_at as settledAt"
    )
    .orderBy("season.settled_at", "desc")
    .orderBy("reward.id", "desc")
    .first();
};
