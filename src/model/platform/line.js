const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");

/**
 * 新增一筆群組資料
 * @param {String} groupId
 */
exports.insertGroup = groupId => {
  var query = sql.insert(this.table.Guild, { guildId: groupId, createDTM: new Date().getTime() });
  return sqlite.run(query.text, query.values);
};

/**
 * 取得群組資料
 * @param {String} groupId
 */
exports.getGroup = async groupId => {
  var query = sql.select(this.table.Guild, "*").where({ guildId: groupId });
  return sqlite.get(query.text, query.values);
};

/**
 * 關閉群組，Status設為0
 * @param {String} groupId
 */
exports.closeGroup = groupId => {
  console.log("closeGroup", groupId);
  return setStatus(
    this.table.Guild,
    {
      status: 0,
      closeDTM: new Date().getTime(),
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
  console.log("openGroup", groupId);
  return setStatus(
    this.table.Guild,
    {
      status: 1,
      closeDTM: "",
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
exports.insertUser = (userId, platform) => {
  var query = sql.insert(this.table.User, {
    platform: platform,
    platformId: userId,
    createDTM: new Date().getTime(),
  });

  return sqlite.run(query.text, query.values);
};

/**
 * 取得User資料
 * @param {String} userId
 */
exports.getUser = userId => {
  var query = sql.select(this.table.User, "*").where({ platformId: userId });
  return sqlite.get(query.text, query.values);
};

/**
 * 關閉User，status設為0
 * @param {String} userId
 */
exports.closeUser = userId => {
  return setStatus(
    this.table.User,
    {
      status: 0,
      closeDTM: new Date().getTime(),
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
      closeDTM: "",
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
function setStatus(table, updateField, whereField) {
  var query = sql.update(table, updateField).where(whereField);
  return sqlite.run(query.text, query.values);
}

/**
 * 取得群組特定會員資料
 * @param {String} userId
 * @param {String} groupId
 */
exports.getGuildMember = (userId, groupId) => {
  var query = sql.select(this.table.GuildMembers, "*").where({ userId: userId, guildId: groupId });
  return sqlite.get(query.text, query.values);
};

/**
 * 新增群組會員資料
 * @param {String} userId
 * @param {String} groupId
 */
exports.memberJoined = async (userId, groupId) => {
  console.log("memberJoined", userId, groupId);

  var memberData = await this.getGuildMember(userId, groupId);

  if (memberData !== undefined) return this.setMemberStatus(userId, groupId, 1);

  var query = sql.insert(this.table.GuildMembers, {
    guildId: groupId,
    userId: userId,
    JoinedDTM: new Date().getTime(),
  });
  return sqlite.run(query.text, query.values);
};

/**
 * 群組會員資料，status設為0
 * @param {String} userId
 * @param {String} groupId
 */
exports.memberLeft = (userId, groupId) => {
  console.log("memberLeft", userId, groupId);
  return this.setMemberStatus(userId, groupId, 0);
};

/**
 * 群組會員資料status切換
 * @param {String} userId
 * @param {String} groupId
 * @param {Number} status
 */
exports.setMemberStatus = (userId, groupId, status) => {
  return setStatus(
    "GuildMembers",
    {
      status: status,
      leftDTM: status === 1 ? null : new Date().getTime(),
    },
    {
      guildId: groupId,
      userId: userId,
    }
  );
};

exports.table = {
  Guild: "Guild",
  GuildMembers: "GuildMembers",
  User: "User",
};

exports.increaseSpeakTimes = (userId, groupId) => {
  var query = sql
    .update("GuildMembers", { LastSpeakDTM: new Date().getTime() })
    .where({ userId: userId, guildId: groupId });

  sqlite.run(query.text.replace(" WHERE", ", SpeakTimes = SpeakTimes + 1 WHERE"), query.values);
};

/**
 * 獲取群組說話排行
 * @param {String} groupId 群組ID
 */
exports.getGroupSpeakRank = groupId => {
  var query = sql
    .select(this.table.GuildMembers, [
      "UserId",
      "Status",
      "JoinedDTM",
      "LeftDTM",
      "SpeakTimes",
      "LastSpeakDTM",
    ])
    .where({ GuildId: groupId })
    .orderby("SpeakTimes DESC");
  return sqlite.all(query.text, query.values);
};
