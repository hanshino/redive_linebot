const base = require("../base");

class MarketDetail extends base {
  getById(id) {
    return this.knex
      .select([
        { id: `${this.table}.id` },
        { itemId: "item_id" },
        "price",
        "quantity",
        { name: "Name" },
        { image: "HeadImage_Url" },
      ])
      .leftJoin("GachaPool", "GachaPool.ID", "item_id")
      .where({ [`${this.table}.id`]: id })
      .first();
  }
}

module.exports = new MarketDetail({
  table: "market_detail",
  fillable: [
    "item_id",
    "price",
    "quantity",
    "sell_target",
    "sell_target_list",
    "is_sold",
    "sold_at",
    "closed_at",
  ],
});
