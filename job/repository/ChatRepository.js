const ChatModel = require("../model/ChatModel");

/**
 * 根據等級取得稱號
 * @param {Number} level 等級
 * @return {Promise<{rank: String, range: String}>}
 */
exports.getLevelTitle = async level => {
  let [levelDatas, rangeDatas] = await Promise.all([
    ChatModel.getLevelTitle(),
    ChatModel.getRangeTitle(),
  ]);

  let targetTitle = levelDatas.find(data => {
    level = level - data.range;
    if (level <= 0) return true;
  });

  let rankTitle = targetTitle.title;
  let { title: rangeTitle } = rangeDatas.find(data => data.id === targetTitle.range + level);

  return { rank: rankTitle, range: rangeTitle };
};

/**
 * 初始化用戶資料
 * @param {Array} userIds
 */
exports.initialUsers = async userIds => {
  let userDatas = await Promise.all(
    userIds.map(ChatModel.getUserByUserId).filter(data => data.userId)
  );
  let existIds = userDatas.map(data => data.userId);
  let insertIds = userIds.filter(userId => !existIds.includes(userId)); // 篩選出沒在資料庫的用戶ID

  await ChatModel.insertUsers(insertIds);
};

/**
 * 取得給定的用戶資料集合
 * @param {Array<String>} userIds
 * @returns {Promise<Array<{id: Number, exp: Number, userId: String}>>}
 */
exports.getUsers = userIds => {
  return Promise.all(userIds.map(ChatModel.getUserByUserId));
};

/**
 * 取得最大1000筆的經驗紀錄
 * @returns {Promise<Array<{userId: String, expUnit: Number}>>}
 */
exports.getAllExpRecords = async () => {
  let records = [];

  // 除非長度已超長，或是沒東西處理，否則處理全部紀錄
  while (records.length <= 1000) {
    let strRecord = await ChatModel.getRecrod();
    if (strRecord === null) break;
    records.push(JSON.parse(strRecord));
  }

  return records;
};
