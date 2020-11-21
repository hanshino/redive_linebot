const mysql = require("../lib/mysql");
const notify = require("../lib/notify");
/**
 * 刪除已標記刪除自訂指令
 */
exports.removeDeleted = async () => {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 3);
  let affectedRows = await mysql
    .from("CustomerOrder")
    .where("status", 0)
    .where("ModifyDTM", "<", expireDates)
    .delete();

  await notify.push({
    message: `已刪除自訂指令清除了：${affectedRows} 筆`,
    alert: true,
  });
};

/**
 * 將不常用的指令進行標記
 */
exports.markUseless = async () => {
  let expireDates = new Date();
  expireDates.setMonth(expireDates.getMonth() - 2);

  let affectedRows = await mysql
    .from("CustomerOrder")
    .where("status", 1)
    .where("touchDTM", "<", expireDates)
    .delete();

  await notify.push({
    message: `已將 ${affectedRows} 個不常用指令標記刪除`,
    alert: true,
  });
};
