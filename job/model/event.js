const mysql = require("../lib/mysql");
const redis = require("../lib/redis");

/**
 * @typedef {Object} ChatbotEvent
 * @property {String} type
 * @property {String} replyToken
 * @property {Object} source
 * @property {String} source.userId
 * @property {String} source.type
 * @property {String} source.displayName
 * @property {Number} timestamp
 * @property {String} mode
 */

exports.getUserData = getUserData;

/**
 * 取得用戶資料
 * @param {String} userId
 * @returns {Promise<{userId: String, status: Number, groupList: Array<{id: String, guildId: String, status: Number}>}>}
 */
async function getUserData(userId) {
  let redisKey = `JOB_USERDATA_${userId}`;
  let userData = await redis.get(redisKey);
  if (userData !== null) return userData;

  userData = await _getUserData(userId);
  redis.set(redisKey, userData, 10 * 60 * 1000);
  return userData;
}

async function _getUserData(userId) {
  let result = { userId, status: -1, groupList: [] };
  let userData = await mysql
    .select([{ userId: "platformId" }, "status"])
    .from("User")
    .where({ platformId: userId });

  if (userData.length !== 0) {
    result = { ...result, ...userData[0] };
    let groupData = await mysql.select("*").from("GuildMembers").where({ userId });
    result.groupList = groupData.map(data => ({
      id: data.ID,
      guildId: data.GuildId,
      status: data.Status,
    }));
  }

  return result;
}

exports.table = {
  Guild: "Guild",
  GuildMembers: "GuildMembers",
  User: "User",
};

/**
 * 新增一筆群組資料
 * @param {String} guildId
 */
exports.insertGroup = async guildId => {
  return await mysql.insert({ guildId, createDTM: new Date() }).into(this.table.Guild);
};

/**
 * 取得群組資料
 * @param {String} guildId
 */
exports.getGroup = async guildId => {
  return await mysql.select("*").from(this.table.Guild).where({ guildId });
};

/**
 * 關閉群組，Status設為0
 * @param {String} groupId
 */
exports.closeGroup = groupId => {
  return setStatus(
    this.table.Guild,
    {
      status: 0,
      closeDTM: new Date(),
    },
    {
      status: 1,
      GuildId: groupId,
    }
  );
};

/**
 * 開啟群組，Status設為1
 * @param {String} groupId
 */
exports.openGroup = groupId => {
  return setStatus(
    this.table.Guild,
    {
      status: 1,
      closeDTM: null,
    },
    {
      status: 0,
      guildId: groupId,
    }
  );
};

/**
 * 新增User資料
 * @param {String} userId
 * @param {String} platform
 */
exports.insertUser = async (userId, platform) => {
  clearCache(userId);
  return await mysql
    .insert({
      platform: platform,
      platformId: userId,
      createDTM: new Date(),
    })
    .into(this.table.User);
};

/**
 * 關閉User，status設為0
 * @param {String} userId
 */
exports.closeUser = userId => {
  clearCache(userId);
  return setStatus(
    this.table.User,
    {
      status: 0,
      closeDTM: null,
    },
    {
      status: 1,
      platformId: userId,
    }
  );
};

/**
 * 開啟User，status設為1
 * @param {String} userId
 */
exports.openUser = userId => {
  return setStatus(
    this.table.User,
    {
      status: 1,
      closeDTM: null,
    },
    {
      status: 0,
      platformId: userId,
    }
  );
};

/**
 * 設定status，用於各table進行status切換
 * @param {String} table
 * @param {String} updateField
 * @param {String} whereField
 */
async function setStatus(table, updateField, whereField) {
  return await mysql.update(updateField).from(table).where(whereField);
}

/**
 * 新增群組會員資料
 * @param {String} userId
 * @param {String} guildId
 */
exports.insertMember = async (userId, guildId) => {
  clearCache(userId);
  return await mysql
    .insert({
      guildId,
      userId,
      JoinedDTM: new Date(),
    })
    .into(this.table.GuildMembers);
};

/**
 * 群組會員資料，status設為0
 * @param {String} userId
 * @param {String} groupId
 */
exports.memberLeft = (userId, groupId) => {
  clearCache(userId);
  return this.setMemberStatus(userId, groupId, 0);
};

/**
 * 群組會員資料status切換
 * @param {String} userId
 * @param {String} groupId
 * @param {Number} status
 */
exports.setMemberStatus = async (userId, groupId, status) => {
  return await setStatus(
    this.table.GuildMembers,
    {
      status: status,
      leftDTM: status === 1 ? null : new Date(),
    },
    {
      guildId: groupId,
      userId: userId,
    }
  );
};

exports.increaseSpeakTimes = async (userId, guildId) => {
  return await mysql
    .update({ LastSpeakDTM: new Date() })
    .increment("SpeakTimes", 1)
    .from(this.table.GuildMembers)
    .where({ userId, guildId });
};

function clearCache(userId) {
  return redis.del(`JOB_USERDATA_${userId}`);
}

/**
 * 訊息次數紀錄
 * @param {ChatbotEvent} botEvent
 * @param {Number} id
 */
exports.recordMessageTimes = async (botEvent, id) => {
  let increaseCol = null;
  let query = mysql("MessageRecord").update({ MR_MODIFYDTM: new Date() }).where({ id });
  switch (botEvent.message.type) {
    case "text":
      increaseCol = "MR_TEXT";
      break;
    case "image":
      increaseCol = "MR_IMAGE";
      break;
    case "sticker":
      increaseCol = "MR_STICKER";
      break;
    case "video":
      increaseCol = "MR_VIDEO";
      break;
    case "unsend":
      increaseCol = "MR_UNSEND";
      break;
  }

  if (!increaseCol) return;

  let affectedRow = await query.increment(increaseCol);

  if (affectedRow === 0) {
    await mysql.insert({ id, MR_MODIFYDTM: new Date(), [increaseCol]: 1 }).into("MessageRecord");
  }
};
