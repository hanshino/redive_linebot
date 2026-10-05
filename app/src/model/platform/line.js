const { CustomLogger } = require("../../util/Logger");
const mysql = require("../../util/mysql");

/**
 * 關閉User，status設為0
 * @param {String} userId
 */
exports.closeUser = userId => {
  return setStatus(
    this.table.User,
    {
      status: 0,
      closed_at: null,
    },
    {
      status: 1,
      platform_id: userId,
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
  CustomLogger.info("memberJoined", userId, guildId);

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
  CustomLogger.info("memberLeft", userId, groupId);
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
    "guild_members",
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
  Guild: "guild",
  GuildMembers: "guild_members",
  User: "user",
};

/**
 * 獲取群組說話排行
 * @param {String} groupId 群組ID
 */
exports.getGroupSpeakRank = groupId => {
  return mysql
    .from(this.table.GuildMembers)
    .join("message_record", "message_record.id", "=", `${this.table.GuildMembers}.id`)
    .select([
      "userId",
      "status",
      { joinedTS: "joinedDTM" },
      { leftTS: "LeftDTM" },
      "speakTimes",
      { lastSpeakTS: "LastSpeakDTM" },
      { textCnt: "MessageRecord.MR_TEXT" },
      { imageCnt: "MessageRecord.MR_IMAGE" },
      { stickerCnt: "MessageRecord.MR_STICKER" },
      { videoCnt: "MessageRecord.MR_VIDEO" },
      { unsendCnt: "MessageRecord.MR_UNSEND" },
    ])
    .where({ GuildId: groupId })
    .orderBy("SpeakTimes", "DESC");
};
