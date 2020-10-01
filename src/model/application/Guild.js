const mysql = require("../../util/mysql");

/**
 * 取得用戶所在的群組
 * @param {String} userId
 */
exports.fetchGuildInfoByUser = userId => {
  return mysql
    .select([
      {
        groupId: "GuildId",
      },
      "joinedDTM",
      "speakTimes",
      "lastSpeakDTM",
    ])
    .from("GuildMembers")
    .where({ userId, status: 1 });
};

exports.fetchGuildMembers = guildId => {
  return mysql.select(["guildId", "userId"]).from("GuildMembers").where({ guildId, status: 1 });
};
