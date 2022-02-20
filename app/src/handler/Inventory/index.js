const { inventory: InventoryModel } = require("../../model/application/Inventory");
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
