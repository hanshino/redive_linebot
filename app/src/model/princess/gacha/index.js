const mysql = require("../../../util/mysql");
const { getClient } = require("bottender");
const LineClient = getClient("line");
const redis = require("../../../util/redis");
exports.table = "GachaPool";

exports.getDatabasePool = () => {
  return mysql
    .select()
    .columns(["id", "name", "star", "rate", "tag"])
    .columns([{ imageUrl: "headImage_Url" }, { isPrincess: "is_Princess" }])
    .from(this.table);
};

/**
 * 新增角色
 * @param {Object} objData
 * @param {String} objData.name
 * @param {String} objData.headImage_url
 * @param {String} objData.star
 * @param {String} objData.rate
 * @param {String} objData.is_princess
 * @param {String} objData.tag
 * @returns {Promise}
 */
exports.insertNewData = objData => {
  return mysql.insert({ ...objData, modify_ts: new Date() }).into("GachaPool");
};

/**
 * 修改角色資料
 * @param {String} id
 * @param {Object} objData
 * @param {String} objData.name
 * @param {String} objData.headImage_url
 * @param {String} objData.star
 * @param {String} objData.rate
 * @param {String} objData.is_princess
 * @param {String} objData.tag
 * @returns {Promise}
 */
exports.updateData = (id, objData) => {
  return mysql
    .update({ ...objData, modify_ts: new Date() })
    .from("GachaPool")
    .where({ id })
    .then(res => res);
};

/**
 * 刪除角色資料
 * @param {String} id
 * @returns {Promise}
 */
exports.deleteData = id => {
  return mysql.from("GachaPool").where({ id }).del();
};

/**
 * 當日轉蛋紀錄
 * @param {String} userId
 * @returns {object|undefined}
 */
exports.getSignin = async userId => {
  var memoryKey = `GachaSignin_${userId}`;
  var isSignin = await redis.get(memoryKey);

  if (isSignin !== null) return isSignin;

  [isSignin] = await mysql
    .select("ID")
    .from("GachaSignin")
    .where({ userId, signinDate: getTodayDate() });

  let ID = isSignin ? isSignin.ID : 1;
  redis.set(memoryKey, ID, 10 * 60);

  return isSignin;
};

/**
 * 轉蛋紀錄
 * @param {String} userId
 */
exports.touchSingin = userId => {
  var memoryKey = `GachaSignin_${userId}`;
  redis.set(memoryKey, 1, 10 * 60);
  return mysql.insert({ userId, signinDate: getTodayDate() }).into("GachaSignin").then();
};

/**
 * 獲取所有公主角色
 * @return {Promise<Array>}
 */
exports.getPrincessCharacter = () => {
  return mysql.select("ID").from(this.table).where({ Is_Princess: 1 });
};

exports.getPrincessCharacterCount = async () => {
  var memoryKey = "PrincessCharacterCount";
  var count = await redis.get(memoryKey);
  if (count !== null) return count;

  var datas = await this.getPrincessCharacter();

  redis.set(memoryKey, datas.length);
  return datas.length;
};

/**
 * 取得用戶收集到的角色數
 * @param {String} userId
 */
exports.getUserCollectedCharacterCount = userId => {
  return mysql
    .select()
    .count("*", { as: "count" })
    .from("Inventory")
    .join(this.table, "Inventory.itemId", "=", "GachaPool.id")
    .where({
      userId,
    })
    .then(res => (res.length === 0 ? 0 : res[0].count));
};

exports.getUserGodStoneCount = userId => {
  return mysql
    .select()
    .from("Inventory")
    .sum({ total: "itemAmount" })
    .where({ itemId: 999, userId })
    .then(res => (res.length === 0 ? 0 : res[0].total || 0));
};

function getTodayDate() {
  let date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("/");
}

/**
 * 取得蒐集排行榜
 * @param {Object}  options
 * @param {?Number}  options.type 0:歐洲榜、1:非洲榜
 * @param {?Number}  options.limit 取得資料數
 * @param {?Boolean}  options.showName 顯示名字
 * @param {?Boolean}  options.cache 是否快取
 */
exports.getCollectedRank = async options => {
  var defaultOption = {
    type: 0,
    limit: 10,
    showName: true,
    cache: true,
  };

  options = {
    ...defaultOption,
    ...options,
  };

  var memoryKey = `GachaRank_${options.type}`;
  var rank = await redis.get(memoryKey);

  if (rank !== null) return rank;

  let order = options.type === 0 ? "DESC" : "ASC";

  var query = mysql
    .select("userId")
    .from("Inventory")
    .count({ cnt: "itemId" })
    .where("itemId", "<>", 999)
    .groupBy("userId")
    .orderBy("cnt", order);

  if (options.limit !== 0) {
    query = query.limit(options.limit);
  }

  rank = await query;
  var rankDatas = rank;

  if (options.showName) {
    rankDatas = await Promise.all(
      rank.map(data =>
        LineClient.getUserProfile(data.userId)
          .then(
            profile => profile.displayName,
            () => "路人甲"
          )
          .then(displayName => ({ ...data, displayName }))
      )
    );
  }

  if (options.cache) {
    redis.set(memoryKey, rankDatas, 1 * 60 * 60);
  }

  return rankDatas;
};
