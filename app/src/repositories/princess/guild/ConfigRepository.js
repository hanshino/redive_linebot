const ConfigModel = require("../../../model/princess/guild/config");
const GuildModel = require("../../../model/application/Guild");
const redis = require("../../../util/redis");

/**
 * 取設定檔，無資料就新增
 * @param {String} groupId
 */
exports.getConfig = async groupId => {
  let data = await redis.get(`BattleConfig_${groupId}`);
  if (data) return data;
  let [configData] = await ConfigModel.queryConfig(groupId);

  if (!configData) {
    configData = {
      notifyToken: "",
      signMessage: "我報名了 *{week}周{boss}王* ，{statusText}\n傷害：{damage}\n備註：{comment}",
    };

    ConfigModel.insertConfig(groupId, configData);
  }

  await redis.set(`BattleConfig_${groupId}`, configData, 15 * 60);

  return configData;
};

exports.writeConfig = async (groupId, data) => {
  await GuildModel.clearLineSession(groupId);
  return ConfigModel.updateConfig(groupId, { ...data, modify_date: new Date() });
};
