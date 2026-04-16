const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_achievements";
const fillable = ["user_id", "achievement_id", "unlocked_at"];

class UserAchievement extends Base {}

const model = new UserAchievement({ table: TABLE, fillable });

exports.model = model;

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("achievements", "user_achievements.achievement_id", "achievements.id")
    .join("achievement_categories", "achievements.category_id", "achievement_categories.id")
    .where("user_achievements.user_id", userId)
    .select(
      "achievements.*",
      "user_achievements.unlocked_at",
      "achievement_categories.key as category_key",
      "achievement_categories.name as category_name"
    )
    .orderBy("user_achievements.unlocked_at", "desc");
};

exports.isUnlocked = async (userId, achievementId) => {
  const row = await mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).first();
  return !!row;
};

exports.unlock = async (userId, achievementId) => {
  return mysql.raw(`INSERT IGNORE INTO ${TABLE} (user_id, achievement_id) VALUES (?, ?)`, [
    userId,
    achievementId,
  ]);
};

exports.getUnlockedIds = async (userId, achievementIds) => {
  if (achievementIds.length === 0) return new Set();
  const rows = await mysql(TABLE)
    .where("user_id", userId)
    .whereIn("achievement_id", achievementIds)
    .select("achievement_id");
  return new Set(rows.map(r => r.achievement_id));
};

exports.countByUser = async userId => {
  const result = await mysql(TABLE).where({ user_id: userId }).count({ count: "id" }).first();
  return result.count;
};

exports.getRecentByUser = async (userId, limit = 3) => {
  return mysql(TABLE)
    .join("achievements", "user_achievements.achievement_id", "achievements.id")
    .where("user_achievements.user_id", userId)
    .select("achievements.*", "user_achievements.unlocked_at")
    .orderBy("user_achievements.unlocked_at", "desc")
    .limit(limit);
};
