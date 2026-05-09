const mysql = require("../../util/mysql");
const redis = require("../../util/redis");
const memKey = "GlobalOrders";
const uuid = require("uuid-random");
const TABLE = "GlobalOrders";
exports.table = TABLE;

function buildRows(objData, key) {
  return objData.replyDatas.map((data, index) => ({
    no: index,
    messageType: data.messageType,
    reply: data.reply,
    senderName: objData.senderName,
    senderIcon: objData.senderIcon,
    keyword: objData.order,
    touchType: objData.touchType,
    modifyTS: new Date(),
    key,
  }));
}

/**
 * 新增指令
 * @param {Object} objData
 * @param {String} objData.order
 * @param {String} objData.touchType 1: 全符合，2:關鍵字
 * @param {String?} objData.senderName
 * @param {String?} objData.senderIcon
 * @param {Array}  objData.replyDatas
 * @param {String} replyData.messageType
 * @param {String} replyData.reply
 */
exports.insertData = async objData => {
  const key = uuid();
  await mysql.insert(buildRows(objData, key)).into(TABLE);
  resetOrderCache();
};

/**
 * 修改指令資料 — atomically replaces all rows for this key so that
 * adding, removing, reordering, and editing replies all behave consistently.
 * @param {Object} objData
 * @param {String} objData.orderKey
 * @param {String} objData.order
 * @param {String} objData.touchType 1: 全符合，2:關鍵字
 * @param {String?} objData.senderName
 * @param {String?} objData.senderIcon
 * @param {Array}  objData.replyDatas
 */
exports.updateData = async objData => {
  const { orderKey, replyDatas } = objData;
  const rows = buildRows(objData, orderKey);

  await mysql.transaction(async trx => {
    await trx(TABLE).where({ key: orderKey }).del();
    if (rows.length) await trx(TABLE).insert(rows);
  });

  if (replyDatas.length) resetOrderCache();
};

/**
 * 刪除特定指令
 * @param {String} orderKey 指令金鑰
 */
exports.deleteData = orderKey => {
  return mysql.from(TABLE).where({ key: orderKey }).del().then(resetOrderCache);
};

exports.fetchAllData = async () => {
  var query = mysql
    .select([
      "no",
      "key",
      "keyword",
      "touchType",
      "messageType",
      "reply",
      "modifyTS",
      "senderName",
      "senderIcon",
    ])
    .from(TABLE)
    .orderBy("key");

  var orders = await redis.get(memKey);
  if (orders !== null) return JSON.parse(orders);

  orders = await query.then(arrangeOrder);
  redis.set(memKey, JSON.stringify(orders), {
    EX: 60 * 60,
  });

  return orders;
};

function arrangeOrder(orders) {
  var hashData = {};

  orders.forEach(orderData => {
    let { key } = orderData;
    hashData[key] = hashData[key] || {
      orderKey: key,
      order: orderData.keyword,
      touchType: orderData.touchType,
      replyDatas: [],
      senderName: orderData.senderName,
      senderIcon: orderData.senderIcon,
    };

    hashData[key].replyDatas.push({
      no: orderData.no,
      messageType: orderData.messageType,
      reply: orderData.reply,
    });
  });

  return Object.values(hashData);
}

function resetOrderCache() {
  redis.del(memKey);
}
