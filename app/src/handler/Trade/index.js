const MarketDetailModel = require("../../model/application/MarketDetail");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const ajv = require("../../util/ajv");
const { get } = require("lodash");
const { DefaultLogger } = require("../../util/Logger");

/**
 * 建立一筆交易
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.create = async (req, res) => {
  const { userId } = req.profile;
  const validate = ajv.getSchema("marketDetail");
  const valid = validate(req.body);

  if (!valid) {
    return res.status(400).json({
      message: "參數錯誤",
      error: validate.errors,
    });
  }

  const targetItemInfo = await InventoryModel.getUserOwnCountByItemId(
    userId,
    get(req, "body.itemId")
  );

  const targetItemCount = get(targetItemInfo, "amount", 0);
  if (targetItemCount < 1) {
    return res.status(400).json({
      message: "沒有足夠的物品",
    });
  }

  DefaultLogger.info(`${userId} 建立交易 ${JSON.stringify(req.body)}`);

  const marketId = await MarketDetailModel.create({
    seller_id: userId,
    item_id: get(req, "body.itemId"),
    price: get(req, "body.charge"),
    quantity: 1,
    sell_target: 1,
    sell_target_list: JSON.stringify([get(req, "body.targetId")]),
  });

  res.json({
    ...req.body,
    userId,
    marketId,
  });
};
