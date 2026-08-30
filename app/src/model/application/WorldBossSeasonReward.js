const mysql = require("../../util/mysql");
const { canonicalUnsignedInteger, canonicalPositiveInteger } = require("../../util/decimalInteger");

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
  const row = await db(`${TABLE} as reward`)
    .join("world_boss_season as season", "reward.season_id", "season.id")
    .leftJoin("titles as title", "reward.title_key", "title.key")
    .where("reward.user_id", userId)
    .whereNotNull("reward.paid_at")
    .select(
      "reward.id as rewardId",
      "reward.season_id as seasonId",
      "season.name as seasonName",
      "reward.ranking as ranking",
      "reward.total_score as totalScore",
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
  return row
    ? {
        ...row,
        rewardId: canonicalPositiveInteger(row.rewardId),
        seasonId: canonicalPositiveInteger(row.seasonId),
        // v2 之前結算的 ledger 沒有 total_score（欄位是後加的 NULLable），維持 null 表示
        // 「這個賽季不是用分數排的」，不要用 total_damage 冒充。
        totalScore: row.totalScore === null ? null : canonicalUnsignedInteger(row.totalScore),
        totalDamage: canonicalUnsignedInteger(row.totalDamage),
      }
    : row;
};
