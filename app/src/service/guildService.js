const guildRepo = require("../repositories/princess/guild/guildRepository");

/**
 * 更新群組數據
 * @param {String} guildId  群組id
 * @param {Object} attributes 屬性
 * @param {String} attribute.name 戰隊名稱
 * @param {String} attribute.uid  戰隊長uid
 */
exports.updateByGuildId = (guildId, attributes) => {
  let { name, uid } = attributes;
  return guildRepo.updateByGuildId(guildId, { name, uid });
};

/**
 * 取得群組數據
 * @param {String} guildId
 * @param {Array} relation
 */
exports.findByGuildId = (guildId, relation = []) => {
  return guildRepo.findByGuildId(guildId, relation);
};
