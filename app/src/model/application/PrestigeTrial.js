const Base = require("../base");

const TABLE = "prestige_trials";
const fillable = [
  "id",
  "slug",
  "display_name",
  "star",
  "required_exp",
  "duration_days",
  "restriction_meta",
  "reward_meta",
  "description",
];

class PrestigeTrial extends Base {}

const model = new PrestigeTrial({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "star", direction: "asc" }] });

exports.findBySlug = slug => model.first({ filter: { slug } });

exports.findById = id => model.first({ filter: { id } });
