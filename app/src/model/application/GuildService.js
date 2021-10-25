const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const TABLE = "guild_service";

exports.table = TABLE;

exports.findByGuildId = async function (guildId) {
  return await mysql.from(TABLE).where({ guild_id: guildId }).select("*");
};

exports.findByGroupId = async function (groupId) {
  // 先從 `Guild` 表找出 `groupId` 對應的 `id`
  // 再從 `GuildService` 表找出 `guildId` 對應的 `service`
  let query = mysql.from("Guild").where({ GuildId: groupId }).select("ID");
  let finalQuery = mysql.from(TABLE).where("guild_id", query).pluck("service");

  console.log(finalQuery.toSQL().toNative());

  return await finalQuery;
};

exports.create = async function (attributes) {
  attributes = pick(attributes, ["guild_id", "service"]);
  return await mysql(TABLE).insert(attributes);
};
