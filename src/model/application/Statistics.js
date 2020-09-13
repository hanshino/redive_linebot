const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

/**
 * 取得目前所有群組數目
 */
exports.getGuildCount = async () => {
  let date = new Date().getDate();
  let memoryKey = `GuildCount_${date}`;
  let count = await redis.get(memoryKey);
  if (count !== null) return count;

  count = await mysql
    .select()
    .from("Guild")
    .count({ cnt: "*" })
    .then(data => data[0].cnt);

  redis.set(memoryKey, count, 3600);
  return count;
};

/**
 * 取得目前所有會員數
 */
exports.getUserCount = async () => {
  let date = new Date().getDate();
  let memoryKey = `UserCount_${date}`;
  let count = await redis.get(memoryKey);
  if (count !== null) return count;

  count = await mysql
    .select()
    .from("User")
    .count({ cnt: "*" })
    .then(data => data[0].cnt);

  redis.set(memoryKey, count, 3600);
  return count;
};

/**
 * 取得目前所有自訂指令數量
 */
exports.getCustomerOrderCount = async () => {
  let date = new Date().getDate();
  let memoryKey = `CustomerOrder_${date}`;
  let count = await redis.get(memoryKey);
  if (count !== null) return count;

  count = await mysql
    .select()
    .from("CustomerOrder")
    .count({ cnt: "*" })
    .then(data => data[0].cnt);

  redis.set(memoryKey, count, 3600);
  return count;
};

/**
 * 取得目前所有說話次數總和
 */
exports.getSpeakTimesCount = async () => {
  let date = new Date().getDate();
  let memoryKey = `SpeakTimes_${date}`;
  let times = await redis.get(memoryKey);
  if (times !== null) return times;

  times = await mysql
    .select()
    .sum({ times: "SpeakTimes" })
    .from("GuildMembers")
    .then(data => data[0].times);

  redis.set(memoryKey, times, 3600);
  return times;
};

/**
 * 取得單一用戶群組數據
 * @param {String} userId
 */
exports.getGuildDataByUser = async userId => {
  let memoryKey = `GuildData_${userId}`;
  let guildData = await redis.get(memoryKey);
  if (guildData !== null) return guildData;

  guildData = await mysql
    .select()
    .from("GuildMembers")
    .sum({ times: "SpeakTimes" })
    .count({ cnt: "*" })
    .where({ userId })
    .then(data => data[0]);

  redis.set(memoryKey, guildData, 1 * 60);
  return guildData;
};
