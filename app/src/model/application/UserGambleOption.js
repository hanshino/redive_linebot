const base = require("../base");

class UserGambleOption extends base {}

module.exports = new UserGambleOption({
  table: "user_gamble_option",
  fillable: ["user_id", "gamble_game_id", "option", "amount"],
});
