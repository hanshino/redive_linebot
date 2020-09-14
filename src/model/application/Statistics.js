const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");
const memory = require("memory-cache");

/**
 * 取得目前所有群組數目
 */
exports.getGuildCount = () => {
  let date = new Date().getDate();
  let memoryKey = `GuildCount_${date}`;
  let count = memory.get(memoryKey);
  if (count !== null) return count;

  return sqlite.get(sql.select("Guild", "count(*) as cnt").text).then(data => {
    memory.put(memoryKey, data.cnt, 86400 * 1000);
    return data.cnt;
  });
};

/**
 * 取得目前所有會員數
 */
exports.getUserCount = () => {
  let date = new Date().getDate();
  let memoryKey = `UserCount_${date}`;
  let count = memory.get(memoryKey);
  if (count !== null) return count;

  return sqlite.get(sql.select("User", "count(*) as cnt").text).then(data => {
    memory.put(memoryKey, data.cnt, 86400 * 1000);
    return data.cnt;
  });
};

/**
 * 取得目前所有自訂指令數量
 */
exports.getCustomerOrderCount = () => {
  let date = new Date().getDate();
  let memoryKey = `CustomerOrder_${date}`;
  let count = memory.get(memoryKey);
  if (count !== null) return count;

  return sqlite.get(sql.select("CustomerOrder", "count(*) as cnt").text).then(data => {
    memory.put(memoryKey, data.cnt, 86400 * 1000);
    return data.cnt;
  });
};

/**
 * 取得目前所有說話次數總和
 */
exports.getSpeakTimesCount = () => {
  let date = new Date().getDate();
  let memoryKey = `SpeakTimes_${date}`;
  let count = memory.get(memoryKey);
  if (count !== null) return count;

  return sqlite.get(sql.select("GuildMembers", "sum(SpeakTimes) as times").text).then(data => {
    memory.put(memoryKey, data.times, 86400 * 1000);
    return data.times;
  });
};

/**
 * 取得單一用戶群組數據
 * @param {String} userId
 */
exports.getGuildDataByUser = userId => {
  let memoryKey = `GuildData_${userId}`;
  let count = memory.get(memoryKey);
  if (count !== null) return count;

  var query = sql
    .select("GuildMembers", ["sum(SpeakTimes) as times", "count(*) as cnt"])
    .where({ userId });

  return sqlite.get(query.text, query.values).then(data => {
    memory.put(memoryKey, data, 1 * 60 * 1000);
    return data;
  });
};
