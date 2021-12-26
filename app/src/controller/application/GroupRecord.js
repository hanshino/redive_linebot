const LineModel = require("../../model/platform/line");
const { getClient } = require("bottender");
const LineClient = getClient("line");

exports.getRankDatas = async (req, res) => {
  const { groupId } = req.params;

  try {
    var rankDatas = await LineModel.getGroupSpeakRank(groupId);

    var result = await Promise.all(
      rankDatas.map(async (data, index) => {
        let { displayName } = await LineClient.getGroupMemberProfile(groupId, data.userId).catch(
          () => ({ displayName: "路人甲" })
        );

        let temp = {
          ...data,
          rank: index + 1,
          displayName,
          lastSpeakTS: new Date(data.lastSpeakTS).getTime(),
          joinedTS: new Date(data.lastSpeakTS).getTime(),
          leftTS: data.leftTS === null ? null : new Date(data.leftTS).getTime(),
        };

        if (displayName === null || displayName === undefined) {
          temp.status = 0;
          temp.speakTimes = 0;
        }

        return temp;
      })
    );
  } catch (e) {
    console.error(e);
    result = { status: "failed", message: "something wrong" };
  }

  res.json(result);
};
