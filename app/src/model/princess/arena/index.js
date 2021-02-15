const mysql = require("../../../util/mysql");
const ARENA_RECORD_TABLE = "arena_records";
/**
 * 新增一筆競技場紀錄
 * @param {Object}  params
 * @param {String}  params.left_team json string
 * @param {String}  params.right_team json String
 * @param {String}  params.left_result 1:win, 0:lose
 * @param {String}  params.right_result 1:win, 0:lose
 * @param {String}  params.left_type 1:進攻, 2:防守
 * @param {String}  params.right_type 1:進攻, 2:防守
 * @param {String}  params.author_id 提供者id
 * @param {String}  params.source_id 群組id or 個人id
 * @param {String}  params.is_share 1:分享, 0:私藏
 */
exports.insertRecrod = async params => {
  return await mysql.insert(params).into(ARENA_RECORD_TABLE);
};
