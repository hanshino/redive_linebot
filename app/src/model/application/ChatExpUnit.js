const Base = require("../base");

const TABLE = "chat_exp_unit";
const fillable = ["unit_level", "total_exp"];

class ChatExpUnit extends Base {}

const model = new ChatExpUnit({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "unit_level", direction: "asc" }] });

/**
 * 用給定的曲線資料，回傳 exp 所屬的最高等級。
 * @param {number} exp
 * @param {Array<{unit_level: number, total_exp: number}>} rows 依 unit_level 升冪排列
 * @returns {number}
 */
exports.getLevelFromExp = function (exp, rows) {
  let level = 0;
  for (const row of rows) {
    if (row.total_exp <= exp) level = row.unit_level;
    else break;
  }
  return level;
};

/**
 * @param {number} level
 * @param {Array<{unit_level: number, total_exp: number}>} rows
 * @returns {number|null}
 */
exports.getTotalExpForLevel = function (level, rows) {
  const row = rows.find(r => r.unit_level === level);
  return row ? row.total_exp : null;
};
