const path = require("path");
const rediveTW = require("../../util/sqlite")(path.join(process.cwd(), "assets", "redive_tw.db"));
const config = require("config");
const { format } = require("util");

/**
 * 取得角色資料
 * @returns {Promise<{unit_id: number, unit_name: string, rarity: number}[]>}
 */
async function getAllCharacter() {
  return await rediveTW("unit_profile").select("unit_id", "unit_name");
}

async function getCharacterImages() {
  const characters = await getAllCharacter();
  return characters.map(character => {
    const { unit_id: unitId, rarity, unit_name: unitName } = character;
    // 角色圖片編號為角色編號 + 10 * 角色稀有度(3 or 6)
    const picUnitId = unitId + (rarity === 6 ? 6 : 3) * 10;
    return {
      unitId,
      unitName,
      fullImage: format(config.get("princess.character.full_image"), picUnitId),
      headImage: format(config.get("princess.character.head_image"), picUnitId),
    };
  });
}

exports.api = {
  getCharacterImages: (req, res) => getCharacterImages().then(images => res.json(images)),
};
