const { inventory: InventoryModel } = require("../../model/application/Inventory");
const GachaModel = require("../../model/princess/gacha");

/**
 * 取得所有物品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.all = async (req, res) => {
  const { userId } = req.profile;
  const items = await InventoryModel.getAllUserOwn(userId);

  res.json(items);
};

exports.getPool = async (_, res) => {
  const pool = await GachaModel.getPrincessCharacter();
  const princessCharacters = pool.map(item => ({
    itemId: item.ID,
    headImage: item.headImage,
    name: item.Name,
  }));

  res.json(princessCharacters);
};
