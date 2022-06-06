const base = require("../base");

class UserHasCreature extends base {}

module.exports = new UserHasCreature({
  table: "user_has_creatures",
  fillable: [
    "user_id",
    "nickname",
    "creature_id",
    "level",
    "exp",
    "favorability",
    "stamina",
    "satiety",
  ],
});
