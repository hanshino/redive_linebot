const GuildModel = require("../../model/application/Guild");
const line = require("../../util/line");

exports.api = {};

exports.api.getGuildSummarys = (req, res) => {
  const { userId } = req.profile;

  getGuildListByUser(userId)
    .then(summarys => res.json(summarys))
    .catch(err => {
      console.error(err);
      res.status(400).json({ message: "Bad Request." });
    });
};

exports.api.getGuildSummary = async (req, res) => {
  const { guildId } = req.params;
  var result = {};

  try {
    result = {
      ...(await line.getGroupSummary(guildId)),
      ...(await line.getGroupCount(guildId)),
    };

    res.json(result);
  } catch (e) {
    res.status(404).json({ message: "Not Found." });
  }
};

/**
 * 取得用戶群組列表
 * @param {String} userId
 */
async function getGuildListByUser(userId) {
  var GuildInfo = await GuildModel.fetchGuildInfoByUser(userId);
  var groupIds = GuildInfo.map(info => info.groupId);
  var groupSummarys = await Promise.all(groupIds.map(line.getGroupSummary));
  return groupSummarys.filter(summary => summary.message === undefined);
}
