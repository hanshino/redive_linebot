const MarketDetailModel = require("../../model/application/MarketDetail");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const ajv = require("../../util/ajv");
const { get } = require("lodash");
const { DefaultLogger } = require("../../util/Logger");
const i18n = require("../../util/i18n");

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
      message: i18n.__("api.error.bad_request"),
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
      message: i18n.__("api.error.transaction.not_enough_item"),
    });
  }

  const isSelf = userId === get(req, "body.targetId");
  if (isSelf) {
    return res.status(400).json({
      message: i18n.__("api.error.transaction.self_trade"),
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

/**
 * 搜尋自己所有交易
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.all = async (req, res) => {
  const { userId } = req.profile;
  const data = req.query;

  const validate = ajv.getSchema("pagination");
  const valid = validate(data);

  if (!valid) {
    return res.status(400).json({
      message: "參數錯誤",
      error: validate.errors,
    });
  }

  const pagination = {
    page: get(data, "page", 1),
    perPage: get(data, "per_page", 10),
  };

  const marketDetailList = await MarketDetailModel.all({
    filter: {
      seller_id: userId,
    },
    pagination,
    order: [
      {
        column: get(data, "order_by", "created_at"),
        direction: get(data, "order", "desc"),
      },
    ],
  });

  res.json(marketDetailList);
};
