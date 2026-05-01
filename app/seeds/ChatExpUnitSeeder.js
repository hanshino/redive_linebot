const MAX_LEVEL = 100;
const COEFFICIENT = 13;
// Lv.100 total exp under the curve — used by pipeline cap, ranking lifetime XP,
// and achievement lifetime XP. Recompute from MAX_LEVEL/COEFFICIENT, not a literal.
const LV_MAX_TOTAL_EXP = Math.round(COEFFICIENT * MAX_LEVEL * MAX_LEVEL);

function buildRows() {
  const rows = [];
  for (let level = 0; level <= MAX_LEVEL; level++) {
    rows.push({
      unit_level: level,
      total_exp: Math.round(COEFFICIENT * level * level),
    });
  }
  return rows;
}

exports.buildRows = buildRows;
exports.MAX_LEVEL = MAX_LEVEL;
exports.COEFFICIENT = COEFFICIENT;
exports.LV_MAX_TOTAL_EXP = LV_MAX_TOTAL_EXP;

exports.seed = async function (knex) {
  await knex("chat_exp_unit").del();
  await knex("chat_exp_unit").insert(buildRows());
};
