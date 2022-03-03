const base = require("../base");

class TradeHistory extends base {}

module.exports = new TradeHistory({
  table: "trade_history",
  fillable: ["seller_id", "buyer_id", "item_id", "price", "quantity"],
});
