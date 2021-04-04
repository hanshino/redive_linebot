const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

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

/**
 * 強制性的將`bottender`設置的`session`清除
 * @param {String} guildId
 * @returns {Promise}
 */
exports.clearLineSession = guildId => {
  return redis.del(`line:${guildId}`);
};
