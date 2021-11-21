const CharacterDatas = require("../../../../doc/characterInfo.json");
const path = require("path");
const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: path.resolve(process.cwd(), "./assets/redive_tw.db"),
  },
  useNullAsDefault: true,
});

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

/**
 * 直接產生頭像連結
 * @param {Number} id
 */
exports.transHeadImageSrc = id => {
  return `https://pcredivewiki.tw/static/images/unit/icon_unit_${id}.png`;
};

function genChatacterIds() {
  characterIds = CharacterDatas.map(data => parseInt(data.unitId));
}

exports.getAllRarity = async () => {
  const subQuery = knex("unit_rarity")
    .max("rarity as max_rarity")
    .where("unit_rarity.unit_id", knex.raw("unit_profile.unit_id"));
  let query = knex("unit_profile").select("unit_profile.unit_id", "unit_profile.unit_name", {
    max_rarity: subQuery,
  });

  return await query;
};
