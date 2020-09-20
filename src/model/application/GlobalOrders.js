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
  let key = uuid();
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
      key,
    };
  });

  return mysql.insert(params).into(this.table).then(resetOrderCache);
};

/**
 * 修改指令資料
 * @param {Object} objData
 * @param {String} objData.orderKey
 * @param {String} objData.order
 * @param {Number} objData.touchType 1: 全符合，2:關鍵字
 * @param {String?} objData.senderName
 * @param {String?} objData.senderIcon
 * @param {Array}  objData.replyDatas
 * @param {Object} replyData
 * @param {String} replyData.no
 * @param {String} replyData.messageType
 * @param {String} replyData.reply
 */
exports.updateData = objData => {
  let { orderKey, replyDatas, order, touchType } = objData;
  return mysql
    .transaction(trx => {
      let updatePromise = Promise.all(
        replyDatas.map((data, index) => {
          let { messageType, reply, senderName, senderIcon } = data;
          return trx(this.table)
            .update({
              messageType,
              reply,
              no: index,
              senderName,
              senderIcon,
              keyword: order,
              touchType,
              modifyTS: new Date(),
            })
            .where({
              no: index,
              key: orderKey,
            });
        })
      );

      updatePromise
        .then(() =>
          trx(this.table).where({ key: orderKey }).where("no", ">=", replyDatas.length).del()
        )
        .then(trx.commit)
        .then(resetOrderCache)
        .catch(trx.rollback);
    })
    .catch(console.error);
};

/**
 * 刪除特定指令
 * @param {String} orderKey 指令金鑰
 */
exports.deleteData = orderKey => {
  return mysql.from("GlobalOrders").where({ key: orderKey }).del().then(resetOrderCache);
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
