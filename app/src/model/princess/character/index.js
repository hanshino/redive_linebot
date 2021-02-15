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

function genChatacterIds() {
  characterIds = CharacterDatas.map(data => data.unitId);
}
