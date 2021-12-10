const mysql = require("../../util/mysql");
const GOD_STONE_SHOP_TABLE = "god_stone_shop";
const pick = require("lodash/pick");

const fillable = ["item_id", "price", "stock", "limit", "is_enable"];

exports.find = async function (id) {
  return await mysql(GOD_STONE_SHOP_TABLE).where({ id }).first();
};

/**
 * @returns {Promise<Array<{id: Number, item_id: Number, price: Number, stock: Number, limit: Number, is_enable: Number, name: String, headImage: String}>>}
 */
exports.all = async function () {
  return await mysql(GOD_STONE_SHOP_TABLE)
    .select([
      { itemId: "item_id" },
      "price",
      "stock",
      "limit",
      "is_enable",
      { name: "Name" },
      { headImage: "HeadImage_Url" },
    ])
    .join("GachaPool", "GachaPool.id", "=", "god_stone_shop.item_id");
};

exports.create = async function (attributes) {
  const data = pick(attributes, fillable);
  return await mysql(GOD_STONE_SHOP_TABLE).insert(data);
};

exports.update = async function (id, attributes) {
  const data = pick(attributes, fillable);
  return await mysql(GOD_STONE_SHOP_TABLE).where({ id }).update(data);
};

exports.delete = async function (id) {
  return await mysql(GOD_STONE_SHOP_TABLE).where({ id }).del();
};
