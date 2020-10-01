const mysql = require("../../util/mysql");

/**
 * 新增一筆群組資料
 * @param {String} guildId
 */
exports.insertGroup = guildId => {
  return mysql.insert({ guildId, createDTM: new Date() }).into(this.table.Guild);
};

/**
 * 取得群組資料
 * @param {String} guildId
 */
exports.getGroup = async guildId => {
  return mysql.select("*").from(this.table.Guild).where({ guildId });
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
  console.log("openGroup", groupId);
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
exports.insertUser = (userId, platform) => {
  return mysql
    .insert({
      platform: platform,
      platformId: userId,
      createDTM: new Date(),
    })
    .into(this.table.User);
};

/**
 * 取得User資料
 * @param {String} userId
 */
exports.getUser = userId => {
  return mysql.select("*").from(this.table.User).where({ platformId: userId });
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
function setStatus(table, updateField, whereField) {
  return mysql.update(updateField).from(table).where(whereField).then();
}

/**
 * 取得群組特定會員資料
 * @param {String} userId
 * @param {String} groupId
 */
exports.getGuildMember = (userId, groupId) => {
  return mysql
    .select("*")
    .from(this.table.GuildMembers)
    .where({ userId: userId, guildId: groupId });
};

/**
 * 新增群組會員資料
 * @param {String} userId
 * @param {String} guildId
 */
exports.memberJoined = async (userId, guildId) => {
  console.log("memberJoined", userId, guildId);

  var [memberData] = await this.getGuildMember(userId, guildId);

  if (memberData !== undefined) return this.setMemberStatus(userId, guildId, 1);

  return mysql
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
      leftDTM: status === 1 ? null : new Date(),
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

exports.increaseSpeakTimes = (userId, guildId) => {
  mysql
    .update({ LastSpeakDTM: new Date() })
    .increment("SpeakTimes", 1)
    .from("GuildMembers")
    .where({ userId, guildId })
    .then();
};

/**
 * 獲取群組說話排行
 * @param {String} groupId 群組ID
 */
exports.getGroupSpeakRank = groupId => {
  return mysql
    .select(["UserId", "Status", "JoinedDTM", "LeftDTM", "SpeakTimes", "LastSpeakDTM"])
    .from(this.table.GuildMembers)
    .where({ GuildId: groupId })
    .orderBy("SpeakTimes", "DESC");
};
