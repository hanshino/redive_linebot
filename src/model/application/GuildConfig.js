const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");
const memory = require("memory-cache");

exports.fetchConfig = groupId => {
  var GroupConfig = memory.get(`GuildConfig_${groupId}`);

  if (GroupConfig === null) {
    var query = sql.select("GuildConfig", "*").where({ GuildId: groupId });
    return sqlite.get(query.text, query.values).then(res => {
      if (res === undefined) {
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
        res = JSON.parse(res.Config);
      }

      memory.put(`GuildConfig_${groupId}`, res, 60 * 60 * 1000);
      return res;
    });
  }

  return Promise.resolve(GroupConfig);
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
exports.getDiscordWebhook = groupId => {
  const memoryKey = `DiscordWebhook_${groupId}`;

  var webhook = memory.get(memoryKey);
  if (webhook !== null) return Promise.resolve(webhook);

  var query = sql.select("GuildConfig", "DiscordWebhook").where({ GuildId: groupId });

  return sqlite.get(query.text, query.values).then(res => {
    if (res === undefined || res === null) {
      webhook = "";
    } else {
      webhook = res.DiscordWebhook || "";
    }

    memory.put(memoryKey, webhook, 60 * 60 * 1000);
    return webhook;
  });
};

/**
 * 設定群組 Discord Webhook
 * @param {String} groupId
 * @param {String} webhook
 * @return {Promise}
 */
exports.setDiscordWebhook = (groupId, webhook) => {
  clearMemWebhook(groupId);
  var query = sql
    .update("GuildConfig", {
      DiscordWebhook: webhook,
    })
    .where({
      GuildId: groupId,
    });

  return sqlite.run(query.text, query.values);
};

/**
 * 將群組 Discord Webhook 解除綁定
 * @param {String} groupId
 * @return {Promise}
 */
exports.removeDicordWebhook = groupId => {
  clearMemWebhook(groupId);
  var query = sql
    .update("GuildConfig", {
      DiscordWebhook: null,
    })
    .where({
      GuildId: groupId,
    });

  return sqlite.run(query.text, query.values);
};

function clearMemWebhook(groupId) {
  const memoryKey = `DiscordWebhook_${groupId}`;
  memory.del(memoryKey);
}

/**
 * 寫入歡迎訊息
 * @param {String} groupId
 * @return {Promise}
 */
exports.setWelcomeMessage = (groupId, message) => {
  var query = sql
    .update("GuildConfig", {
      WelcomeMessage: message,
    })
    .where({
      GuildId: groupId,
    });

  return sqlite.run(query.text, query.values);
};

/**
 * 獲得歡迎訊息
 * @param {String} groupId
 * @return {Promise}
 */
exports.getWelcomeMessage = groupId => {
  var query = sql.select("GuildConfig", "WelcomeMessage").where({ GuildId: groupId });
  return sqlite.get(query.text, query.values).then(res => res.WelcomeMessage || "");
};

/**
 * 寫入群組設定
 * @param {String} groupId
 * @param {Object} config
 * @return {Promise}
 */
function saveConfig(groupId, config) {
  // 將快取清除，讓下次直接重新fetch
  memory.del(`GuildConfig_${groupId}`);

  var query = sql
    .update("GuildConfig", {
      Config: JSON.stringify(config),
      modifyDTM: new Date().getTime(),
    })
    .where({
      GuildId: groupId,
    });

  return sqlite.run(query.text, query.values);
}

function insertConfig(groupId, config) {
  var query = sql.insert("GuildConfig", {
    GuildId: groupId,
    Config: JSON.stringify(config),
    modifyDTM: new Date().getTime(),
  });

  return sqlite.run(query.text, query.values);
}
