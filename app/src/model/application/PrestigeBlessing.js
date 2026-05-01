const Base = require("../base");

const TABLE = "prestige_blessings";
const fillable = ["id", "slug", "display_name", "effect_meta", "description"];

class PrestigeBlessing extends Base {}

const model = new PrestigeBlessing({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "id", direction: "asc" }] });

exports.findBySlug = slug => model.first({ filter: { slug } });

exports.findById = id => model.first({ filter: { id } });
