const base = require("../base");

class MarketDetail extends base {
  getById(id) {
    return this.knex
      .select([
        { id: `${this.table}.id` },
        "item_id",
        "seller_id",
        "price",
        "quantity",
        "sell_target_list",
        "status",
        { name: "Name" },
        { image: "HeadImage_Url" },
      ])
      .leftJoin("GachaPool", "GachaPool.ID", "item_id")
      .where({ [`${this.table}.id`]: id })
      .first();
  }

  setSold(id) {
    return this.update(id, { status: 1, sold_at: new Date() });
  }

  setClosed(id) {
    return this.update(id, { status: -1, closed_at: new Date() });
  }
}

module.exports = new MarketDetail({
  table: "market_detail",
  fillable: [
    "seller_id",
    "status",
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
