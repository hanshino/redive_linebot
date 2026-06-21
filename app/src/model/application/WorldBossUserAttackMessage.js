const mysql = require("../../util/mysql");
const TABLE = "world_boss_user_attack_message";
const pick = require("lodash/pick");

exports.table = TABLE;

exports.all = async () => {
  return await mysql
    .select(
      "world_boss_user_attack_message.id",
      "world_boss_user_attack_message.icon_url",
      "world_boss_user_attack_message.template",
      "world_boss_user_attack_message.creator_id",
      mysql.raw("MAX(`attack_message_has_tags`.`tag`) as `tag`")
    )
    .from(TABLE)
    .leftJoin(
      "attack_message_has_tags",
      "world_boss_user_attack_message.id",
      "attack_message_has_tags.attack_message_id"
    )
    .groupBy("world_boss_user_attack_message.id");
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
