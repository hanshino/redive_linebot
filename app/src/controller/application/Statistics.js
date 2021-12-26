const Model = require("../../model/application/Statistics");
const traffic = require("../../util/traffic");
const GachaModel = require("../../model/princess/gacha");

function StatException(message, code) {
  this.message = message;
  this.code = code;
}

exports.showStatistics = async (req, res) => {
  try {
    var result = {};
    const [GuildCount, UserCount, CustomerOrderCount, TotalSpeakTimes, OnlineData] =
      await Promise.all([
        Model.getGuildCount(),
        Model.getUserCount(),
        Model.getCustomerOrderCount(),
        Model.getSpeakTimesCount(),
        traffic.getPeopleData(),
      ]);

    result = { GuildCount, UserCount, CustomerOrderCount, TotalSpeakTimes, ...OnlineData[1] };
  } catch (e) {
    console.error(e);
    result = { Message: "unknown" };
  }
  res.json(result);
};

exports.showUserStatistics = async (req, res) => {
  try {
    var result = {};
    var { userId } = req.profile;
    if (!userId) throw new StatException("Bad Request.", 1);

    var GuildData = await Model.getGuildDataByUser(userId);
    var GachaData = await getUserRank(userId);

    result = { GuildData, GachaData };
  } catch (e) {
    if (!(e instanceof StatException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
};

function getUserRank(userId) {
  return GachaModel.getCollectedRank({
    type: 0,
    limit: 0,
    showName: false,
    cache: false,
  }).then(data => {
    let Rank = 0;
    let target = data.find((d, index) => {
      if (d.userId === userId) {
        Rank = index + 1;
        return true;
      }

      return false;
    });

    let CollectedCount = target ? target.cnt : 0;

    return { Rank, CollectedCount };
  });
}
