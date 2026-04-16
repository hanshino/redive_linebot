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
  const existing = await mysql(TABLE)
    .where({ user_id: userId, achievement_id: achievementId })
    .first();

  if (existing) {
    return mysql(TABLE)
      .where({ user_id: userId, achievement_id: achievementId })
      .update({ current_value: currentValue, updated_at: mysql.fn.now() });
  }

  return mysql(TABLE).insert({
    user_id: userId,
    achievement_id: achievementId,
    current_value: currentValue,
  });
};

exports.increment = async (userId, achievementId, amount = 1) => {
  const existing = await mysql(TABLE)
    .where({ user_id: userId, achievement_id: achievementId })
    .first();

  if (existing) {
    return mysql(TABLE)
      .where({ user_id: userId, achievement_id: achievementId })
      .update({
        current_value: mysql.raw("current_value + ?", [amount]),
        updated_at: mysql.fn.now(),
      });
  }

  return mysql(TABLE).insert({
    user_id: userId,
    achievement_id: achievementId,
    current_value: amount,
  });
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
