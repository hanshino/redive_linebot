const base = require("../base");

class GachaRecord extends base {}

module.exports = new GachaRecord({
  table: "gacha_record",
  fillable: ["user_id", "silver", "gold", "rainbow", "has_new"],
});
