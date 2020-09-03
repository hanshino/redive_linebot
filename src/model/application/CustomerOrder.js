const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");
const memory = require("memory-cache");

exports.table = "CustomerOrder";
exports.columnsAlias = [
  { o: "NO", a: "no" },
  { o: "SOURCE_ID", a: "sourceId" },
  { o: "ORDER_KEY", a: "orderKey" },
  { o: "CUSORDER", a: "cusOrder" },
  { o: "TOUCH_TYPE", a: "touchType" },
  { o: "MESSAGE_TYPE", a: "messageType" },
  { o: "REPLY", a: "reply" },
  { o: "CREATE_DTM", a: "createDTM" },
  { o: "CREATE_USER", a: "createUser" },
  { o: "MODIFY_DTM", a: "modifyDTM" },
  { o: "MODIFY_USER", a: "modifyUser" },
  { o: "STATUS", a: "status" },
];

/**
 * 對資料庫新增指令
 * @param {Object} objData
 * @param {Number} objData.NO
 * @param {String} objData.SOURCE_ID
 * @param {String} objData.ORDER_KEY
 * @param {String} objData.CUSORDER
 * @param {String} objData.TOUCH_TYPE
 * @param {String} objData.MESSAGE_TYPE
 * @param {String} objData.REPLY
 * @param {String} objData.CREATE_DTM
 * @param {String} objData.CREATE_USER
 * @param {String} objData.MODIFY_USER
 */
exports.insertOrder = async function (objData) {
  resetMemoryOrder(objData.SOURCE_ID);

  var query = sql.insert(this.table, objData);

  return sqlite.run(query.text, query.values);
};

/**
 * 取得所有指令
 * @param {String} sourceId
 * @param {Number} status
 */
exports.queryOrderBySourceId = async function (sourceId, status = "") {
  var memoryKey = `CustomerOrder_${sourceId}_${status}`;
  var orders = memory.get(memoryKey);

  if (orders !== null) return orders;

  var query = sql
    .select(this.table, getColumnName(this.columnsAlias))
    .where({ SOURCE_ID: sourceId });

  if (status !== "") {
    query = query.and({ STATUS: status });
  }

  orders = await sqlite.all(query.text, query.values);

  memory.put(memoryKey, orders, 60 * 60 * 1000);
  return orders;
};

exports.queryOrderByKey = async function (orderKey, sourceId) {
  var query = sql
    .select(this.table, getColumnName(this.columnsAlias))
    .where({ ORDER_KEY: orderKey, SOURCE_ID: sourceId, STATUS: 1 });

  var result = await sqlite.get(query.text, query.values);

  return result;
};

/**
 * 取得可刪除指令列表
 * @param {String} cusOrder
 */
exports.queryOrderToDelete = async (cusOrder, sourceId) => {
  var query = sql.select(this.table, getColumnName(this.columnsAlias)).where({
    SOURCE_ID: sourceId,
    CUSORDER: cusOrder,
    STATUS: 1,
  });

  return sqlite.all(query.text, query.values);
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
  var query = sql
    .update("CustomerOrder", {
      status: status,
      modify_user: objData.modifyUser,
      modify_DTM: new Date().getTime(),
    })
    .where({
      source_id: objData.sourceId,
      order_key: objData.orderKey,
      status: 1,
    });

  return sqlite.run(query.text, query.values);
};

/**
 * 觸發指令紀錄
 * @param {String} order
 * @param {String} sourceId
 */
exports.touchOrder = (order, sourceId) => {
  var query = sql
    .update("CustomerOrder", {
      touch_dtm: new Date().getTime(),
    })
    .where({
      source_id: sourceId,
      cusOrder: order,
      status: 1,
    });

  return sqlite.run(query.text, query.values);
};

exports.orderShutdown = sourceId => {
  resetMemoryOrder(sourceId);
  var query = sql
    .update("CustomerOrder", {
      status: 0,
      modify_DTM: new Date().getTime(),
      MODIFY_USER: "system",
    })
    .where({
      source_id: sourceId,
    });
  return sqlite.run(query.text, query.values);
};

/**
 * 修改自訂指令
 * @param {String} sourceId 來源ID
 * @param {Object} orderData 修改項目
 * @param {String} orderData.orderKey
 * @param {String} orderData.order
 * @param {String} orderData.touchType
 * @param {String} orderData.status
 */
exports.updateOrder = (sourceId, orderData) => {
  resetMemoryOrder(sourceId);
  var query = sql
    .update("CustomerOrder", {
      status: orderData.status,
      touch_type: orderData.touchType,
      cusorder: orderData.order,
    })
    .where({
      order_key: orderData.orderKey,
      source_id: sourceId,
    });
  return sqlite.run(query.text, query.values);
};

function getColumnName(columnsAlias) {
  return columnsAlias.map(col => `${col.o} as ${col.a}`).join(",");
}

function resetMemoryOrder(sourceId) {
  var memoryKey = `CustomerOrder_${sourceId}_`;
  memory.del(`${memoryKey}`);
  memory.del(`${memoryKey}1`);
  memory.del(`${memoryKey}0`);
}
