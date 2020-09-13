const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

exports.fetchConfig = async groupId => {
  var GroupConfig = await redis.get(`GuildConfig_${groupId}`);

  if (GroupConfig === null) {
    var query = mysql.select("*").from("GuildConfig").where({ GuildId: groupId });
    return query.then(res => {
      if (res.length === 0) {
        res = {
          Battle: "Y",
          PrincessCharacter: "Y",
          CustomerOrder: "Y",
          GlobalOrder: "Y",
          Gacha: "Y",
          PrincessInformation: "Y",
        };
        insertConfig(groupId, res);
      } else {
        res = res[0].Config;
      }

      redis.set(`GuildConfig_${groupId}`, res, 60 * 60);
      return res;
    });
  }

  return GroupConfig;
};

/**
 * 寫入群組開關設定
 * @param {String} groupId
 * @param {String} name
 * @param {String} status Y or N
 * @return {Promise}
 */
exports.writeConfig = async (groupId, name, status) => {
  const GroupConfig = await this.fetchConfig(groupId);
  GroupConfig[name] = status;
  return saveConfig(groupId, GroupConfig);
};

/**
 * 取得群組 Discord Webhook
 * @param {String} groupId
 * @return {Promise}
 */
exports.getDiscordWebhook = async groupId => {
  const memoryKey = `DiscordWebhook_${groupId}`;

  var webhook = await redis.get(memoryKey);
  if (webhook !== null) return Promise.resolve(webhook);

  var query = mysql
    .select("DiscordWebhook")
    .from("GuildConfig")
    .where({ GuildId: groupId })
    .whereNotNull("DiscordWebhook")
    .where("DiscordWebhook", "<>", "");

  var [data] = await query;
  webhook = "";
  if (data !== undefined) {
    webhook = data.DiscordWebhook;
    redis.get(memoryKey, webhook, 60 * 60);
  }

  return webhook;
};

/**
 * 設定群組 Discord Webhook
 * @param {String} groupId
 * @param {String} webhook
 * @return {Promise}
 */
exports.setDiscordWebhook = (groupId, webhook) => {
  clearMemWebhook(groupId);
  return mysql
    .update({
      DiscordWebhook: webhook,
    })
    .into("GuildConfig")
    .where({
      GuildId: groupId,
    })
    .then(res => res);
};

/**
 * 將群組 Discord Webhook 解除綁定
 * @param {String} groupId
 * @return {Promise}
 */
exports.removeDicordWebhook = groupId => {
  clearMemWebhook(groupId);
  return mysql
    .update({
      DiscordWebhook: null,
    })
    .into("GuildConfig")
    .where({
      GuildId: groupId,
    })
    .then(res => res);
};

function clearMemWebhook(groupId) {
  const memoryKey = `DiscordWebhook_${groupId}`;
  redis.del(memoryKey);
}

/**
 * 寫入歡迎訊息
 * @param {String} groupId
 * @return {Promise}
 */
exports.setWelcomeMessage = (groupId, message) => {
  return mysql
    .update({
      WelcomeMessage: message,
    })
    .into("GuildConfig")
    .where({
      GuildId: groupId,
    })
    .then(res => res);
};

/**
 * 獲得歡迎訊息
 * @param {String} groupId
 * @return {Promise}
 */
exports.getWelcomeMessage = groupId => {
  return mysql
    .select("WelcomeMessage")
    .from("GuildConfig")
    .where({ GuildId: groupId })
    .whereNotNull("WelcomeMessage")
    .where("WelcomeMessage", "<>", "")
    .then(res => (res.length === 0 ? "" : res[0].WelcomeMessage));
};

/**
 * 寫入群組設定
 * @param {String} groupId
 * @param {Object} config
 * @return {Promise}
 */
function saveConfig(groupId, config) {
  // 將快取清除，讓下次直接重新fetch
  redis.del(`GuildConfig_${groupId}`);

  return mysql
    .update({
      Config: JSON.stringify(config),
      modifyDTM: new Date(),
    })
    .into("GuildConfig")
    .where({
      GuildId: groupId,
    })
    .then(res => res);
}

function insertConfig(groupId, config) {
  return mysql
    .insert({
      GuildId: groupId,
      Config: JSON.stringify(config),
      modifyDTM: new Date(),
    })
    .into("GuildConfig")
    .then();
}
