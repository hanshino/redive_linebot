const base = require("../base");

class GambleGame extends base {}

module.exports = new GambleGame({
  table: "gamble_game",
  fillable: ["type", "name", "options", "start_at", "end_at"],
});
