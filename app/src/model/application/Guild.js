// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");
const mysql = require("../../util/mysql");
const { clearLineSession } = require("../../lib/bot");

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
    .from("guild_members")
    .where({ userId, status: 1 });
};

exports.fetchGuildMembers = guildId => {
  return mysql.select(["guildId", "userId"]).from("guild_members").where({ guildId, status: 1 });
};

/**
 * 清除目前 bot engine 的群組 session
 * @param {String} guildId
 * @returns {Promise}
 */
exports.clearLineSession = guildId => {
  return clearLineSession(guildId);
};

/**
 * @returns {Knex}
 */
exports.query = () => mysql("guild");
