const base = require("../base");

class GachaRecordDetail extends base {}

module.exports = new GachaRecordDetail({
  table: "gacha_record_detail",
  fillable: ["gacha_record_id", "user_id", "character_id", "star", "is_new"],
});
