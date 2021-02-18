const CharacterDatas = require("../../../../doc/characterInfo.json");
let characterIds = null;

exports.getDatas = () => {
  return JSON.parse(JSON.stringify(CharacterDatas));
};

/**
 * 根據unitId進行角色查詢
 * @param {Number} unitId
 * @returns {Number} index
 */
exports.findIndex = unitId => {
  if (characterIds === null) genChatacterIds();
  return characterIds.indexOf(unitId);
};

/**
 * 根據unitId進行角色查詢
 * @param {Number} unitId
 * @param {Object} character
 */
exports.find = unitId => {
  let idx = this.findIndex(unitId);
  return idx === -1 ? null : CharacterDatas[idx];
};

/**
 * 取得頭像連結
 * @param {Number} unitId
 * @param {Number} star 1,3,6
 */
exports.getHeadImage = (unitId, star) => {
  let id = unitId + star * 10;
  return `https://pcredivewiki.tw/static/images/unit/icon_unit_${id}.png`;
};

function genChatacterIds() {
  characterIds = CharacterDatas.map(data => parseInt(data.unitId));
}
