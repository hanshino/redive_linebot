const mysql = require("../../util/mysql");
const TABLE = "minigame_level_unit";

exports.all = async function () {
  return await mysql.select("*").from(TABLE);
};
