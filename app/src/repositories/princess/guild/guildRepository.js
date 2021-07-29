const guild = require("../../../model/application/Guild");

/**
 * 透過`guildId`更新數據
 * @param {String} guildId 群組id
 * @param {Object} attributes 要更動的屬性
 */
exports.updateByGuildId = (guildId, attributes) => {
  let query = guild.query();
  return query.update(attributes).where("GuildId", guildId);
};

/**
 * 透過`guildId`取得數據
 * @param {String} guildId 群組id
 * @param {Array}  relation 要關聯的資料表
 * @returns {Promise<Object|null>}
 */
exports.findByGuildId = (guildId, relation) => {
  let query = guild.query().where("GuildId", guildId).first();

  if (relation.includes("princess")) {
    query = princess(query);
  }

  return query;
};

function princess(query) {
  return query.join("PrincessUID", "Guild.uid", "=", "PrincessUID.uid");
}
