const TABLE = "world_boss_role";
const base = require("../base");

class WorldBossRole extends base {}

const model = new WorldBossRole({
  table: TABLE,
  fillable: ["user_id", "role", "chosen_at", "reselect_count"],
});

exports.table = TABLE;
exports.model = model;

/**
 * 依 platform_id 取得職業設定
 * @param {String} userId LINE platform_id
 * @returns {Promise<Object|undefined>}
 */
exports.find = userId => model.first({ filter: { user_id: userId } });

/**
 * 新增職業設定
 * @param {Object} attrs
 * @returns {Promise<Number>}
 */
exports.create = attrs => model.create(attrs);

/**
 * 更新職業設定 (主鍵為 user_id)；可選 opts.trx 讓更新參與外部交易。
 * Base.update 不吃 options.trx，故以 setTransaction 前後切換。
 * @param {String} userId LINE platform_id
 * @param {Object} attrs
 * @param {Object} [opts]
 * @param {import("knex").Knex.Transaction} [opts.trx]
 * @returns {Promise<Number>}
 */
exports.update = (userId, attrs, opts = {}) => {
  if (opts.trx) {
    model.setTransaction(opts.trx);
    return model.update(userId, attrs, { pk: "user_id" }).finally(() => model.setTransaction(null));
  }
  return model.update(userId, attrs, { pk: "user_id" });
};
