const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "achievements";
const fillable = [
  "category_id",
  "key",
  "name",
  "description",
  "icon",
  "type",
  "rarity",
  "target_value",
  "reward_stones",
  "order",
];

class Achievement extends Base {}

const model = new Achievement({ table: TABLE, fillable });

exports.model = model;

exports.all = async (options = {}) => {
  return model.all(options);
};

exports.find = async id => {
  return model.find(id);
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};

exports.allWithCategories = async () => {
  return mysql(TABLE)
    .join("achievement_categories", "achievements.category_id", "achievement_categories.id")
    .select(
      "achievements.*",
      "achievement_categories.key as category_key",
      "achievement_categories.name as category_name",
      "achievement_categories.icon as category_icon"
    )
    .orderBy([
      { column: "achievement_categories.order", order: "asc" },
      { column: "achievements.order", order: "asc" },
    ]);
};

exports.findByType = async type => {
  return model.all({ filter: { type } });
};

exports.getStats = async () => {
  const totalUsers = await mysql("user").count({ count: "*" }).first();
  const stats = await mysql("user_achievements")
    .select("achievement_id")
    .count({ unlock_count: "id" })
    .groupBy("achievement_id");

  return stats.map(s => ({
    achievement_id: s.achievement_id,
    unlock_count: s.unlock_count,
    total_users: totalUsers.count,
    unlock_rate: totalUsers.count > 0 ? (s.unlock_count / totalUsers.count) * 100 : 0,
  }));
};
