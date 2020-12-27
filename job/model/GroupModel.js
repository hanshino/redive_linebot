const line = require("@line/bot-sdk");
const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});
const redis = require("../lib/redis");

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
