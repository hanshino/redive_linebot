const Base = require("../base");

const TABLE = "achievement_categories";
const fillable = ["key", "name", "icon", "order"];

class AchievementCategory extends Base {}

const model = new AchievementCategory({ table: TABLE, fillable });

exports.model = model;

exports.all = async () => {
  return model.all({ order: [{ column: "order", direction: "asc" }] });
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};
