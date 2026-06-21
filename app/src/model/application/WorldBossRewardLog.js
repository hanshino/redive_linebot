const mysql = require("../../util/mysql");

const TABLE = "world_boss_reward_log";

/**
 * 冪等寫入結算獎勵紀錄；unique (user_id, world_boss_event_id) 衝突回傳 false
 * @param {Object} attrs
 * @param {String} attrs.user_id LINE platform_id
 * @param {Number} attrs.world_boss_event_id
 * @param {Number} attrs.materials 強化素材數量
 * @param {Number} attrs.stones 女神石數量
 * @param {String} attrs.board dps|healer|tank|none
 * @param {?Number} attrs.rank 名次, null = 純參與/逾時
 * @param {Boolean} attrs.is_mvp
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Boolean>}
 */
exports.tryInsert = async function (
  { user_id, world_boss_event_id, materials, stones, board, rank, is_mvp },
  trx
) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert({
      user_id,
      world_boss_event_id,
      materials,
      stones,
      board,
      rank,
      is_mvp,
    });
    return true;
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
};

/**
 * 取得單一玩家在某活動的獎勵紀錄
 * @param {String} user_id LINE platform_id
 * @param {Number} world_boss_event_id
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Object|undefined>}
 */
exports.getByUserAndEvent = function (user_id, world_boss_event_id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ user_id, world_boss_event_id }).first();
};

/**
 * 取得玩家最近一筆獎勵紀錄 (戰報卡來源)
 * @param {String} user_id LINE platform_id
 * @returns {Promise<Object|undefined>}
 */
exports.getUnreadForUser = function (user_id) {
  return mysql(TABLE).where({ user_id }).orderBy("id", "desc").first();
};

exports.table = TABLE;
