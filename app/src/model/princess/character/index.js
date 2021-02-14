const CharacterDatas = require("../../../../doc/characterInfo.json");

exports.getDatas = () => {
  return JSON.parse(JSON.stringify(CharacterDatas));
}
