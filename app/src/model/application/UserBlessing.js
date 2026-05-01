const Base = require("../base");

const TABLE = "user_blessings";
const fillable = ["user_id", "blessing_id", "acquired_at_prestige", "acquired_at"];

class UserBlessing extends Base {}

const model = new UserBlessing({ table: TABLE, fillable });

exports.model = model;

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "acquired_at_prestige", direction: "asc" }],
  });

exports.listBlessingIdsByUserId = async userId => {
  const rows = await model.all({ filter: { user_id: userId }, select: ["blessing_id"] });
  return rows.map(r => r.blessing_id);
};
