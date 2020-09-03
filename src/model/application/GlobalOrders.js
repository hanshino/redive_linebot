const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");
const memory = require("memory-cache");
const memKey = "GlobalOrders";
const uuid = require("uuid-random");

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
  var query = sql.insert("GlobalOrders", {
    no: 0,
    message_type: "text",
    reply: "",
    sender_name: objData.senderName,
    sender_icon: objData.senderIcon,
    keyword: objData.order,
    touch_type: objData.touchType,
    modify_ts: new Date().getTime(),
    key: uuid(),
  });

  var text = query.text;
  var values = query.values;

  console.log(text);

  return Promise.all(
    objData.replyDatas.map((data, index) => {
      values[0] = index;
      values[1] = data.messageType;
      values[2] = data.reply;
      console.table(values);
      return sqlite.run(text, values);
    })
  ).then(() => resetOrderCache());
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
  return Promise.all(
    objData.replyDatas.map(data => {
      var query = sql
        .update("GlobalOrders", {
          no: data.no,
          message_type: data.messageType,
          reply: data.reply,
          sender_name: objData.senderName,
          sender_icon: objData.senderIcon,
          keyword: objData.order,
          touch_type: objData.touchType,
          modify_ts: new Date().getTime(),
        })
        .where({
          key: objData.orderKey,
          no: data.no,
        });

      return sqlite.run(query.text, query.values);
    })
  )
    .then(() => {
      var query = sql
        .deletes("GlobalOrders")
        .where({ key: objData.key })
        .and({ no: objData.replyDatas.length });

      return sqlite.run(query.text, query.values);
    })
    .then(() => resetOrderCache());
};

/**
 * 刪除特定指令
 * @param {String} orderKey 指令金鑰
 */
exports.deleteData = orderKey => {
  var query = sql.deletes("GlobalOrders").where({ key: orderKey });
  return sqlite.run(query.text, query.values);
};

exports.fetchAllData = async () => {
  var query = sql
    .select("GlobalOrders", [
      "no as no",
      "key as key",
      "keyword as 'order'",
      "touch_type as touchType",
      "message_type as messageType",
      "reply as reply",
      "modify_TS as modifyTS",
      "sender_name as senderName",
      "sender_icon as senderIcon",
    ])
    .orderby("key");

  var orders = memory.get(memKey);
  if (orders !== null) return orders;

  orders = await sqlite.all(query.text, query.values).then(arrangeOrder);
  memory.put(memKey, orders, 60 * 60 * 1000);

  return orders;
};

function arrangeOrder(orders) {
  var hashData = {};

  orders.forEach(orderData => {
    let { key } = orderData;
    hashData[key] = hashData[key] || {
      orderKey: key,
      order: orderData.order,
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
  memory.del(memKey);
}
