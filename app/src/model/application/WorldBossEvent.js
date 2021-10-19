const mysql = require("../../util/mysql");
const WorldBoss = require("./WorldBoss");
const TABLE = "world_boss_event";

exports.table = TABLE;

exports.all = async (options = {}) => {
  const { withs = [] } = options;
  let query = mysql(this.table).select("*");

  if (withs.indexOf("worldBoss") > -1) {
    query = worldBoss(query);
  }

  return await query;
};

function worldBoss(query) {
  return query.join(WorldBoss.table, `${TABLE}.world_boss_id`, "=", `${WorldBoss.table}.id`);
}
