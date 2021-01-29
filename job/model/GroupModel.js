const line = require("@line/bot-sdk");
const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});
const redis = require("../lib/redis");
const mysql = require("../lib/mysql");

/**
 * 取得群組資訊
 * @param {String} groupId
 * @returns {Promise<{groupId: String, groupName: String, pictureUrl: String, count: Number}>}
 */
exports.getInfo = async groupId => {
  let redisKey = `LINE_GROUP_INFO_${groupId}`;
  let info = await redis.get(redisKey);
  if (info !== null) return info;

  let [summary, count] = await Promise.all([
    client.getGroupSummary(groupId),
    client.getGroupMembersCount(groupId),
  ]);

  info = { ...summary, ...count };
  await redis.set(redisKey, info, 10 * 60);

  return info;
};

exports.getGroupMemberProfile = (groupId, userId) => {
  return client.getGroupMemberProfile(groupId, userId).catch(err => null);
};

/**
 * 取得還在線的會員資料
 * @returns {Promise<Array<{id: String, groupId: String, userId: String}>>}
 */
exports.getActiveMembers = () => {
  return mysql
    .select(["id", { groupId: "GuildId" }, { userId: "UserId" }])
    .from("GuildMembers")
    .where({ status: 1 });
};

/**
 * 將給定的id會員進行關閉
 * @param {Array} ids
 */
exports.shutdownMembers = async ids => {
  return await mysql("GuildMembers").update({ status: 0, LeftDTM: new Date() }).whereIn("ID", ids);
};
