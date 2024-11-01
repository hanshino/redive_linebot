const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

exports.table = "CustomerOrder";
exports.columnsAlias = [
  "no",
  "sourceId",
  "orderKey",
  "cusOrder",
  "touchType",
  "messageType",
  "reply",
  "substitution",
  "createDTM",
  "createUser",
  "modifyDTM",
  "modifyUser",
  "senderName",
  "senderIcon",
  "touchDTM",
  "status",
];

/**
 * 對資料庫新增指令
 * @param {Object[]} params
 * @param {string} params[].No
 * @param {String} params[].sourceId
 * @param {String} params[].orderKey
 * @param {String} params[].CusOrder
 * @param {String} params[].touchType
 * @param {String} params[].MessageType
 * @param {String} params[].Reply
 * @param {String} params[].CreateDTM
 * @param {String} params[].CreateUser
 * @param {String} params[].ModifyUser
 * @param {String?} params[].SenderName
 * @param {String?} params[].SenderIcon
 */
exports.insertOrder = async params => {
  resetMemoryOrder(params[0].sourceId);
  return mysql(this.table).insert(params);
};

/**
 * 取得所有指令
 * @param {String} sourceId
 * @param {Number} status
 */
exports.queryOrderBySourceId = async (sourceId, status = "") => {
  var memoryKey = `CustomerOrder_${sourceId}_${status}`;
  var orders = await redis.get(memoryKey);

  if (orders !== null) return JSON.parse(orders);

  var query = mysql.select(this.columnsAlias).table(this.table).where({ sourceId });

  if (status !== "") {
    query = query.where({ STATUS: status });
  }

  orders = await query;

  redis.set(memoryKey, JSON.stringify(orders), {
    EX: 60 * 60,
  });
  return orders;
};

exports.queryOrderByKey = (orderKey, sourceId) => {
  return mysql.select(this.columnsAlias).table(this.table).where({ orderKey, sourceId });
};

/**
 * 取得可刪除指令列表
 * @param {String} cusOrder
 */
exports.queryOrderToDelete = async (cusOrder, sourceId) => {
  return mysql.select(this.columnsAlias).table(this.table).where({
    sourceId,
    cusOrder,
    STATUS: 1,
  });
};

/**
 * 將指令進行狀態切換
 * @param {Object} objData
 * @param {String} objData.orderKey
 * @param {String} objData.sourceId
 * @param {String} objData.modifyUser
 * @param {Number} status 0:關閉,1:啟用
 * @returns {Promise}
 */
exports.setStatus = (objData, status) => {
  resetMemoryOrder(objData.sourceId);
  return mysql(this.table)
    .update({
      status,
      modifyUser: objData.modifyUser,
      modifyDTM: new Date(),
    })
    .where({
      sourceId: objData.sourceId,
      orderKey: objData.orderKey,
    })
    .then(res => res);
};

/**
 * 觸發指令紀錄
 * @param {String} order
 * @param {String} sourceId
 */
exports.touchOrder = (order, sourceId) => {
  return mysql(this.table)
    .update({
      touchDTM: new Date(),
    })
    .where({
      sourceId: sourceId,
      cusOrder: order,
      status: 1,
    })
    .then(res => res);
};

exports.orderShutdown = sourceId => {
  resetMemoryOrder(sourceId);
  return mysql(this.table)
    .update({
      status: 0,
      modifyDTM: new Date(),
      modifyUser: "system",
    })
    .where({
      sourceId,
    })
    .then(res => res);
};

/**
 * 修改自訂指令
 * @param {String} sourceId 來源ID
 * @param {Object} orderData 修改項目
 * @param {String} orderData.orderKey
 * @param {String} orderData.order
 * @param {Array}  orderData.replyDatas
 * @param {String} orderData.touchType
 * @param {String} orderData.senderName
 * @param {String} orderData.senderIcon
 * @param {String} orderData.status
 * @param {String} modifyUser
 */
exports.updateOrder = (sourceId, orderData, modifyUser) => {
  let { orderKey, replyDatas, touchType, senderName, senderIcon, order } = orderData;

  return mysql
    .transaction(trx => {
      let updatePromise = Promise.all(
        replyDatas.map((data, index) => {
          let { messageType, reply } = data;
          return trx
            .select(["no", "orderKey"])
            .from(this.table)
            .where({ orderKey, no: index })
            .then(res => {
              if (res.length === 0) {
                return trx
                  .insert({
                    no: index,
                    sourceId,
                    orderKey,
                    cusorder: order,
                    touchType,
                    messageType,
                    reply,
                    CreateUser: modifyUser,
                    modifyDTM: new Date(),
                    modifyUser,
                    senderName,
                    senderIcon,
                  })
                  .into(this.table);
              } else {
                return trx(this.table)
                  .update({
                    messageType,
                    reply,
                    no: index,
                    cusorder: order,
                    touchType,
                    senderName,
                    senderIcon,
                    modifyDTM: new Date(),
                    modifyUser,
                  })
                  .where({
                    no: index,
                    orderKey,
                    sourceId,
                  });
              }
            });
        })
      );

      updatePromise
        .then(() =>
          trx(this.table).where({ sourceId, orderKey }).where("no", ">=", replyDatas.length).del()
        )
        .then(trx.commit)
        .then(() => resetMemoryOrder(sourceId))
        .catch(trx.rollback);
    })
    .catch(console.error);
};

function resetMemoryOrder(sourceId) {
  var memoryKey = `CustomerOrder_${sourceId}_`;
  redis.del(`${memoryKey}`);
  redis.del(`${memoryKey}1`);
  redis.del(`${memoryKey}0`);
}
