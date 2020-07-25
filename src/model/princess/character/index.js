const GoogleSheet = require("../../common/GoogleSheet");
const mem = require("memory-cache");
const CharacterDatas = require("../../../../doc/characterInfo.json");

async function getRecommendDatas() {
  var result = mem.get("CharacterRecommend");
  if (result === null) {
    result = await GoogleSheet.querySheetData({
      key: "1OSQZmL5cJlJhsrxETxsviNZCnSpGar6stOw2kBAGxUU",
      type: "json",
      query:
        'select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P where A is not null label A "角色", B "RANK推薦"',
      gid: "0",
    }).then(resp => {
      return resp.map(data => {
        data["附註"] = data["附註"] || "無";
        return data;
      });
    });
    mem.put("CharacterRecommend", result);
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
