const { DefaultLogger, CustomLogger } = require("../lib/Logger");
const ChatModel = require("../model/ChatModel");
const GroupModel = require("../model/GroupModel");
const NotifyListModel = require("../model/NotifyListModel");
const ChatRepo = require("../repository/ChatRepository");
const NotifyRepo = require("../repository/NotifyRepository");

/**
 * 將紀錄進行合併寫入
 */
exports.updateRecords = async () => {
  let records = await ChatRepo.getAllExpRecords();
  let hashRecord = {};

  if (records.length === 0) {
    CustomLogger.info("mergeRecord", "無紀錄需要處理");
    return;
  }

  records.forEach(record => {
    hashRecord[record.userId] = hashRecord[record.userId] || 0;
    hashRecord[record.userId] += record.expUnit;
  });

  let userIds = Object.keys(hashRecord);
  let expDatas = userIds.map(userId => ({ userId, experience: hashRecord[userId] }));

  await ChatRepo.initialUsers(userIds);
  await Promise.all([ChatModel.writeRecords(expDatas), handleNotify(hashRecord)]);
};

/**
 * 事件分析，將其處理成經驗累積
 * @param {botEvent} botEvent
 */
exports.handleEvent = async botEvent => {
  if (botEvent.source.type !== "group") return;
  if (botEvent.type !== "message" || botEvent.message.type !== "text") return;

  let { userId, groupId, displayName } = botEvent.source;
  if (!userId) return;

  let rate, additionRate;

  let { timestamp: currTS } = botEvent;
  let lastTouchTS = await ChatModel.getTouchTS(userId);
  let { count } = await GroupModel.getInfo(groupId);

  rate = getExpRate(currTS, lastTouchTS);
  additionRate = count ? getGroupExpAdditionRate(count) : 1;
  let globalRate = await ChatModel.getGlobalRate();
  let expUnit = getExpUnit(rate, additionRate, globalRate);

  DefaultLogger.info(
    "個人頻率倍率",
    rate,
    "群組倍率加成",
    additionRate,
    "經驗單位",
    expUnit,
    "伺服器倍率",
    globalRate,
    "群組人數",
    count,
    "Line名稱",
    displayName,
    "userId",
    userId
  );

  if (rate !== 0) {
    // 有成功獲得經驗再戳
    await ChatModel.touchTS(userId, currTS);
  }

  ChatModel.insertRecord(userId, expUnit);
};

/**
 * 根據頻率取得經驗倍率
 * @param {Number} now
 * @param {Number} last
 */
function getExpRate(now, last) {
  let defaultRate = 100;
  let configs = [
    { diff: 1000, rate: 0 },
    { diff: 2000, rate: 10 },
    { diff: 4000, rate: 50 },
    { diff: 6000, rate: 80 },
  ];
  if (!last) return defaultRate;
  let diff = now - last;

  let target = configs.find(config => diff < config.diff);

  return target ? target.rate : defaultRate;
}

/**
 * 取得群組加成經驗倍率
 * @param {Number} memberCount 群組人數
 */
function getGroupExpAdditionRate(memberCount = 0) {
  if (memberCount < 5) return 1;
  return 1 + (memberCount - 5) * 0.02;
}

/**
 * 取得經驗單位
 * @param {Number} rate 個人倍率
 * @param {Nubmer} additionRate 群組加成
 * @param {Number} globalRate 伺服器倍率
 */
function getExpUnit(rate, additionRate, globalRate) {
  return Math.round((additionRate * rate * globalRate) / 100);
}

/**
 * 處理通知
 * @param {Object} hashRecord
 */
async function handleNotify(hashRecord) {
  let [list, SubTypes] = await Promise.all([
    NotifyListModel.getList(),
    NotifyListModel.getSubTypes(),
  ]);
  let levelUpRecords = []; // for 等級上升通知用
  list.forEach(data => {
    let subTypes = NotifyRepo.transSubData(SubTypes, data.subType);
    let ChatStatus = subTypes.find(data => data.key === "ChatInfo");
    if (ChatStatus.status !== 1) return;
    if (!hashRecord[data.userId]) return;

    let { token, userId } = data;

    levelUpRecords.push({ token, userId, experience: hashRecord[userId] });

    NotifyListModel.insertNotifyList({
      token,
      message: `系統消息\n獲得了${hashRecord[data.userId]}經驗值`,
    });

    levelUpNotify(levelUpRecords);
  });
}

/**
 * 判斷升等
 * @param {Array<{userId: String, experience: Number, token: String}>}
 */
async function levelUpNotify(records) {
  let user = {};

  let userIds = records.map(data => data.userId);
  let [userDatas, exp_unit] = await Promise.all([
    ChatModel.getUserDatas(userIds),
    ChatModel.getExpUnit(),
  ]);

  for (let i = 0; i < records.length; i++) {
    user = await user_exp(records[i], userDatas);
    user.levelup = await exp_filter(user, exp_unit);
    if (user.levelup === false) continue;
    let { token } = records[i];
    await NotifyListModel.insertNotifyList({
      token,
      message: "\nRank:" + user.levelup.rank + "\nTitle:" + user.levelup.range,
    });
  }
}

/**
 * 取出每一位使用者的資料
 * @returns {Object<{after: int, now: int, getexp: int}>}
 */
function user_exp(record, userDatas) {
  let { userId: id, experience: getexp } = record;
  let { exp: after } = userDatas.find(data => data.userId === record.userId);
  let now = after - getexp;

  return { id, after, now, getexp };
}

/**
 * 比較total_exp看有沒有升等
 * @returns {Object<{rank: String, title: String, level: Number}>}
 */
function exp_filter(user, exp_unit) {
  //取下限
  let lower_bound = exp_unit.find(function (data) {
    return data.total_exp > user.now;
  });
  //取上限
  let upper_bound = exp_unit.find(function (data) {
    return data.total_exp > user.after;
  });

  //判斷該不該升等
  if (lower_bound.total_exp === upper_bound.total_exp) return false;

  let { unit_level } = lower_bound;
  return ChatRepo.getLevelTitle(unit_level).then(res => ({
    ...res,
    level: unit_level,
  }));
}
