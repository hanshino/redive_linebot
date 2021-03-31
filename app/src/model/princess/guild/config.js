const mysql = require("../../../util/mysql");
const GUILD_BATTLE_CONFIG_TABLE = "GuildBattleConfig";

/**
 * 獲取群組戰隊設定
 * @param {String} guildId
 * @returns {Promise<Array<{groupId: String, notifyToken: String, signMessage: String}>>}
 */
exports.queryConfig = guildId => {
  return mysql
    .select({ groupId: "GuildId", notifyToken: "NotifyToken", signMessage: "SignMessage" })
    .from(GUILD_BATTLE_CONFIG_TABLE)
    .where({ guildId });
};

/**
 * 新增設定紀錄
 * @param {String} guildId
 * @param {Object} config
 * @param {String} config.notifyToken
 * @param {String} config.signMessage
 */
exports.insertConfig = async (guildId, config) => {
  let { notifyToken, signMessage } = config;
  return await mysql.insert({ guildId, notifyToken, signMessage }).into(GUILD_BATTLE_CONFIG_TABLE);
};

/**
 * 更新設定紀錄
 * @param {String} guildId
 * @param {Object} config
 * @param {String} config.notifyToken
 * @param {String} config.signMessage
 */
exports.updateConfig = async (guildId, config) => {
  return await mysql(GUILD_BATTLE_CONFIG_TABLE).update(config).where({ guildId });
};
