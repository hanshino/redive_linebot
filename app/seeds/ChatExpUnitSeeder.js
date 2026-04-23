const MAX_LEVEL = 100;
const COEFFICIENT = 2.7;

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

exports.seed = async function (knex) {
  await knex("chat_exp_unit").del();
  await knex("chat_exp_unit").insert(buildRows());
};
