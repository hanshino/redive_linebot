const mysql = require("../../util/mysql");
const TABLE = "world_boss_user_attack_message";
const pick = require("lodash/pick");

exports.table = TABLE;

exports.all = async () => {
  return await mysql
    .select("*")
    .from(TABLE)
    .join(
      "attack_message_has_tags",
      "world_boss_user_attack_message.id",
      "attack_message_has_tags.attack_message_id"
    );
};

exports.find = async id => {
  return await mysql.first("*").from(TABLE).where({ id });
};

exports.delete = async id => {
  return await mysql.delete().from(TABLE).where({ id });
};

exports.update = async (id, attributes) => {
  return await mysql
    .update(pick(attributes, ["icon_url", "template", "creator_id"]))
    .from(TABLE)
    .where({ id });
};

exports.create = async attributes => {
  attributes = pick(attributes, ["icon_url", "template", "creator_id"]);
  return await mysql.insert(attributes).into(TABLE);
};
