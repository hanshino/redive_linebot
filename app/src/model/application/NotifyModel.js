const mysql = require("../../util/mysql");
const NOTIFY_LIST_TABLE = "notify_list";

/**
 * 綁定Line Notify通知
 * @param {Number} id
 * @param {String} token Line Notify Token
 */
exports.bindingLineNotify = (id, token) => {
  return bindingToken({ id, type: 1, token });
};

/**
 * 綁定Discord Webhook通知
 * @param {Number} id
 * @param {String} token Discord Webhook Token
 */
exports.bindingDiscordWebhook = (id, token) => {
  return bindingToken({ id, type: 2, token });
};

/**
 * 關閉通知
 * @param {String} id
 */
exports.closeNotify = async id => {
  return await mysql(NOTIFY_LIST_TABLE).where({ id }).delete();
};

exports.getData = async id => {
  return await mysql
    .select(["id", "type", { subType: "sub_type" }, "status", "token"])
    .where({ id })
    .from(NOTIFY_LIST_TABLE);
};

/**
 * 設定訂閱種類
 * @param {Object} objData
 * @param {Number} objData.id
 * @param {Number} objData.sub_type
 * 1. inc
 * 2. dec
 */
exports.setSubStatus = async ({ id, sub_type }) => {
  let query = mysql(NOTIFY_LIST_TABLE).where({ id }).update({ sub_type });
  console.log(query.toSQL().toNative());
  return await query;
};

/**
 * 新增綁定token資料
 * @param {Object} objData 參數
 * @param {Number} objData.id
 * @param {Number} objData.type
 * @param {String} objData.token
 */
async function bindingToken(objData) {
  return await mysql(NOTIFY_LIST_TABLE).insert({ ...objData, modify_date: new Date() });
}
