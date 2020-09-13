const mysql = require("../../util/mysql");
const redis = require("../../util/redis");
const memKey = "GlobalOrders";
const uuid = require("uuid-random");
exports.table = "GlobalOrders";
/**
 * 新增指令
 * @param {Object} objData
 * @param {String} objData.order
 * @param {Number} objData.touchType 1: 全符合，2:關鍵字
 * @param {String} objData.senderName
 * @param {String} objData.senderIcon
 * @param {Array}  objData.replyDatas
 * @param {Object} replyData
 * @param {String} replyData.messageType
 * @param {String} replyData.reply
 */
exports.insertData = objData => {
  var params = objData.replyDatas.map((data, index) => {
    return {
      no: index,
      messageType: data.messageType,
      reply: data.reply,
      senderName: objData.senderName,
      senderIcon: objData.senderIcon,
      keyword: objData.order,
      touchType: objData.touchType,
      modifyTS: new Date(),
      key: uuid(),
    };
  });

  return mysql.insert(params).into(this.table);
};

/**
 * 修改指令資料
 * @param {Object} objData
 * @param {String} objData.orderKey
 * @param {String} objData.order
 * @param {Number} objData.touchType 1: 全符合，2:關鍵字
 * @param {String} objData.senderName
 * @param {String} objData.senderIcon
 * @param {Array}  objData.replyDatas
 * @param {Object} replyData
 * @param {String} replyData.no
 * @param {String} replyData.messageType
 * @param {String} replyData.reply
 */
exports.updateData = objData => {
  var sqlQuerys = objData.replyDatas.map(data => {
    return mysql
      .update({
        no: data.no,
        message_type: data.messageType,
        reply: data.reply,
        sender_name: objData.senderName,
        sender_icon: objData.senderIcon,
        keyword: objData.order,
        touch_type: objData.touchType,
        modify_ts: new Date(),
      })
      .into(this.table)
      .where({
        key: objData.orderKey,
        no: data.no,
      });
  });

  return Promise.all(sqlQuerys)
    .then(() => {
      return mysql
        .from("GlobalOrders")
        .where("key", objData.orderKey)
        .andWhere("no", ">=", objData.replyDatas.length)
        .del();
    })
    .then(() => resetOrderCache());
};

/**
 * 刪除特定指令
 * @param {String} orderKey 指令金鑰
 */
exports.deleteData = orderKey => {
  return mysql.from("GlobalOrders").where({ key: orderKey }).del();
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
    .from(this.table)
    .orderBy("key");

  var orders = await redis.get(memKey);
  if (orders !== null) return orders;

  orders = await query.then(arrangeOrder);
  redis.set(memKey, orders, 60 * 60);

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
