const base = require("../base");

class SubscribeUser extends base {}

module.exports = new SubscribeUser({
  table: "subscribe_user",
  fillable: ["user_id", "subscribe_card_key", "start_at", "end_at"],
});
