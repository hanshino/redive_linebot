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
  let levelUpRecords = list
    .filter(data => {
      let subTypes = NotifyRepo.transSubData(SubTypes, data.subType);
      let ChatStatus = subTypes.find(data => data.key === "ChatInfo");
      if (ChatStatus.status !== 1) return false;
      if (!hashRecord[data.userId]) return false;
      return true;
    })
    .map(data => ({ ...data, experience: hashRecord[data.userId] }));

  levelUpNotify(levelUpRecords);
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
    user = await processUserExp(records[i], userDatas);
    let levelInfo = await expFilter(user, exp_unit);

    let { token } = records[i];
    let { rank, range, level, levelUp, getexp, total_exp, after } = levelInfo;

    if (levelUp) {
      await NotifyListModel.insertNotifyList({
        token,
        message: `\n恭喜提升至 ${level} 等\n新稱號：${range} 的 ${rank}`,
        type: 3,
      });
    } else {
      await NotifyListModel.insertNotifyList({
        token,
        message: `\n獲得 ${getexp} 經驗\n距離下次升等還有：${total_exp - after}`,
        type: 3,
      });
    }
  }
}

/**
 * 取出每一位使用者的資料
 * @returns {Object<{after: int, now: int, getexp: int}>}
 */
function processUserExp(record, userDatas) {
  let { userId: id, experience: getexp } = record;
  let { exp: after } = userDatas.find(data => data.userId === record.userId);
  let now = after - getexp;

  return { id, after, now, getexp };
}

/**
 * 比較total_exp看有沒有升等
 * @returns {Object<{rank: String, title: String, level: Number}>}
 */
function expFilter(user, exp_unit) {
  //取下限
  let lowerBound = exp_unit.find(function (data) {
    return data.total_exp > user.now;
  });
  //取上限
  let upperBound = exp_unit.find(function (data) {
    return data.total_exp > user.after;
  });

  let { unit_level } = lowerBound;
  return ChatRepo.getLevelTitle(unit_level).then(res => ({
    ...res,
    ...user,
    ...upperBound,
    level: unit_level,
    levelUp: lowerBound.total_exp === upperBound.total_exp ? false : true,
  }));
}
