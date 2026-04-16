const Base = require("../base");

const TABLE = "titles";
const fillable = ["key", "name", "description", "icon", "rarity", "order"];

class Title extends Base {}

const model = new Title({ table: TABLE, fillable });

exports.model = model;

exports.all = async () => {
  return model.all({ order: [{ column: "order", direction: "asc" }] });
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};
