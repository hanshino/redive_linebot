const GoogleSheet = require("../../common/GoogleSheet");
const redis = require("../../../util/redis");
const CharacterDatas = require("../../../../doc/characterInfo.json");

async function getRecommendDatas() {
  var result = await redis.get("CharacterRecommend");
  if (result === null) {
    result = await GoogleSheet.querySheetData({
      key: "1OSQZmL5cJlJhsrxETxsviNZCnSpGar6stOw2kBAGxUU",
      type: "json",
      query:
        'select A,C,D,E,F,G,H,I,J,K,L,M,N,O,P where A is not null label A "角色", C "RANK推薦", E "備註"',
      gid: "0",
    }).then(resp => {
      return resp.map(data => {
        data["備註"] = data["備註"] || "無";
        return data;
      });
    });
    redis.set("CharacterRecommend", result, 60 * 60);
  }

  return result;
}

function getDatas() {
  return JSON.parse(JSON.stringify(CharacterDatas));
}

module.exports = {
  getDatas: getDatas,
  getRecommendDatas: getRecommendDatas,
};
