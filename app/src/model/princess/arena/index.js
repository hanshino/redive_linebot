const mysql = require("../../../util/mysql");
const ARENA_RECORD_TABLE = "arena_records";
const ARENA_LIKE_RECORD_TABLE = "arena_like_records";
const redis = require("../../../util/redis");
const uuid = require("uuid-random");

/**
 * 將圖片進行暫存，方便詢問此圖片資訊
 * @param {String} messageId
 */
exports.storeImageId = messageId => {
  let storeId = uuid();
  redis.set(storeId, messageId, 60);
  return storeId;
};

/**
 * 將暫存的圖片id取出
 * @param {String} storeId
 */
exports.getImageId = storeId => {
  return redis.get(storeId);
};

/**
 * 新增一筆競技場紀錄
 * @param {Object}  params
 * @param {String}  params.left_hash
 * @param {String}  params.right_hash
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
  let { left_hash, right_hash, author_id } = params;
  let rows = await mysql
    .select("*")
    .from(ARENA_RECORD_TABLE)
    .where({ left_hash, right_hash, author_id });
  if (rows.length !== 0) return false;
  return await mysql.insert(params).into(ARENA_RECORD_TABLE);
};

/**
 * 搜尋解陣結果
 * @param {String} defenseHash
 */
exports.search = async defenseHash => {
  let query = mysql
    .select("*")
    .from(ARENA_RECORD_TABLE)
    .where(builder =>
      builder.where("left_hash", defenseHash).where("left_type", 2).where("left_result", 0)
    )
    .orWhere(builder =>
      builder.where("right_hash", defenseHash).where("right_type", 2).where("right_result", 0)
    );

  return await query;
};

exports.queryLikeData = mergehashDatas => queryLikeRecord(mergehashDatas, "1");
exports.queryUnlikeData = mergehashDatas => queryLikeRecord(mergehashDatas, "2");

function queryLikeRecord(mergehashDatas, type) {
  return mysql
    .select("merge_hash")
    .count("type as count")
    .from(ARENA_LIKE_RECORD_TABLE)
    .whereIn("merge_hash", mergehashDatas)
    .where("type", type)
    .groupBy("merge_hash");
}

exports.insertLikeRecord = genLikeQuery;

/**
 * 產生按讚紀錄Query
 * @param {Object} params
 * @param {String} params.attackHash
 * @param {String} params.defenseHash
 * @param {String} params.userId
 * @param {String} params.type  1:like,2:unlike
 * @param {Boolean} params.upload  是否上傳照片證明
 */
function genLikeQuery(params) {
  let {
    mergeHash: merge_hash,
    attackHash: attack_hash,
    defenseHash: defense_hash,
    userId,
    type,
    upload,
  } = params;
  let option = {
    merge_hash,
    attack_hash,
    defense_hash,
    userId,
    is_upload_image: upload ? "1" : "0",
  };
  let selectQuery = mysql.select("attack_hash").from(ARENA_LIKE_RECORD_TABLE).where(option);

  return selectQuery.then(res => {
    // 沒紀錄insert 有紀錄就 update
    return res.length === 0
      ? mysql.insert({...option, type}).into(ARENA_LIKE_RECORD_TABLE)
      : mysql(ARENA_LIKE_RECORD_TABLE).update({ type }).where(option);
  });
}
