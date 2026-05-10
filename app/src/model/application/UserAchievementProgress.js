const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_achievement_progress";
const fillable = ["user_id", "achievement_id", "current_value"];

class UserAchievementProgress extends Base {}

const model = new UserAchievementProgress({ table: TABLE, fillable });

exports.model = model;

exports.getProgress = async (userId, achievementId) => {
  return mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).first();
};

/**
 * Batch fetch progress rows for one user across multiple achievements. Returns
 * a Map keyed by achievement_id → current_value. Used by AchievementEngine.evaluate
 * to collapse a per-event N+1 (was the dominant duplicate query in production
 * timing logs — every chat_message event re-issued the same single-row select 3+ times).
 *
 * @param {string} userId
 * @param {Array<number>} achievementIds
 * @returns {Promise<Map<number, number>>}
 */
exports.getProgressByIds = async (userId, achievementIds) => {
  if (!Array.isArray(achievementIds) || achievementIds.length === 0) return new Map();
  const rows = await mysql(TABLE)
    .where("user_id", userId)
    .whereIn("achievement_id", achievementIds)
    .select("achievement_id", "current_value");
  return new Map(rows.map(r => [r.achievement_id, r.current_value]));
};

exports.upsert = async (userId, achievementId, currentValue) => {
  return mysql.raw(
    `INSERT INTO ${TABLE} (user_id, achievement_id, current_value, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE current_value = VALUES(current_value), updated_at = NOW()`,
    [userId, achievementId, currentValue]
  );
};

exports.increment = async (userId, achievementId, amount = 1) => {
  return mysql.raw(
    `INSERT INTO ${TABLE} (user_id, achievement_id, current_value, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE current_value = current_value + VALUES(current_value), updated_at = NOW()`,
    [userId, achievementId, amount]
  );
};

exports.delete = async (userId, achievementId) => {
  return mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).delete();
};

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("achievements", "user_achievement_progress.achievement_id", "achievements.id")
    .where("user_achievement_progress.user_id", userId)
    .select("achievements.*", "user_achievement_progress.current_value");
};

exports.getNearCompletion = async (userId, limit = 2) => {
  return mysql(TABLE)
    .join("achievements", "user_achievement_progress.achievement_id", "achievements.id")
    .leftJoin("user_achievements", function () {
      this.on("user_achievements.user_id", "user_achievement_progress.user_id").andOn(
        "user_achievements.achievement_id",
        "user_achievement_progress.achievement_id"
      );
    })
    .whereNull("user_achievements.id")
    .where("user_achievement_progress.user_id", userId)
    .where("achievements.type", "!=", "hidden")
    .select(
      "achievements.*",
      "user_achievement_progress.current_value",
      mysql.raw(
        "ROUND(user_achievement_progress.current_value / achievements.target_value * 100) as percentage"
      )
    )
    .orderBy("percentage", "desc")
    .limit(limit);
};
