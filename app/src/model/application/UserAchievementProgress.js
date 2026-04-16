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
