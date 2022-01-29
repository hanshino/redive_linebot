const base = require("../base");

class GameData extends base {}

module.exports = new GameData({
  table: "game_version",
  fillable: ["truth_version", "hash"],
});
