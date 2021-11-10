const mysql = require("../../util/mysql");
const TABLE = "world_boss_user_attack_message";
const pick = require("lodash/pick");

exports.table = TABLE;

exports.all = async () => {
  return await mysql.select("*").from(TABLE);
};

exports.create = async attributes => {
  attributes = pick(attributes, ["icon_url", "template", "creator_id"]);
  return await mysql.insert(attributes).into(TABLE);
};
