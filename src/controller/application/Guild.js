const GuildModel = require("../../model/application/Guild");
const line = require("../../util/line");

exports.test = context => {
  const { userId } = context.event.source;
  getGuildListByUser(userId).then(console.log);
};

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
