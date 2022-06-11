const base = require("../base");

class CreatureHistory extends base {}

module.exports = new CreatureHistory({
  table: "creature_history",
  fillable: ["user_has_creature_id", "action", "data"],
});
