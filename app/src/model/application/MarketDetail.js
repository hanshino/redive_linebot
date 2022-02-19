const base = require("../base");

class MarketDetail extends base {}

module.exports = new MarketDetail({
  table: "market_detail",
  fillable: ["item_id", "price", "quantity", "is_sold", "sold_at", "closed_at"],
});
