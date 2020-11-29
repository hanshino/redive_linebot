const mysql = require("../lib/mysql");
const notify = require("../lib/notify");
const RecordModel = require("../model/record");
/**
 * 關閉的群組，進行以下清除
 * - 群組資料
 * - 群組會員資料
 * - 自訂指令
 * - 群組設定
 * - 戰隊資料（戰隊表、戰隊周次、戰隊簽到）
 */
exports.clearClosed = async () => {
  let expireDates = new Date();
  let records = [];
  expireDates.setDate(expireDates.getDate() - 7);

  let delGuilds = await mysql
    .select("guildId")
    .from("Guild")
    .where("status", 0)
    .where("CloseDTM", "<", expireDates)
    .then(res => res.map(data => data.guildId));

  if (delGuilds.length === 0) {
    await notify.push({
      message: "沒有關閉的群組需要清除",
      alert: true,
    });
    return;
  }

  await mysql.transaction(trx => {
    let delGuild = trx.from("Guild").whereIn("GuildId", delGuilds).delete();
    let delGuildMembers = trx.from("GuildMembers").whereIn("GuildId", delGuilds).delete();
    let delGuildConfig = trx.from("GuildConfig").whereIn("GuildId", delGuilds).delete();
    let delGuildBattle = trx.from("GuildBattle").whereIn("GuildId", delGuilds).delete();
    let delGuildWeek = trx.from("GuildWeek").whereIn("GuildId", delGuilds).delete();
    let delGuildBattleFinish = trx.from("GuildBattleFinish").whereIn("GuildId", delGuilds).delete();
    let delCustomerOrder = trx.from("CustomerOrder").whereIn("SourceId", delGuilds).delete();

    delGuild
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組`, delGuildMembers))
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組會員資料`, delGuildConfig)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組設定`, delGuildBattle)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊表`, delGuildWeek)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊周次資料`, delGuildBattleFinish)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊簽到資料`, delCustomerOrder)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組自訂指令`, Promise.resolve)
      )
      .then(trx.commit)
      .catch(trx.rollback);
  });

  await notify.push({
    message: records.join("\n"),
    alert: true,
  });

  function recordResultThenNext(msg, next) {
    records.push(msg);
    return next;
  }
};

exports.clearLeftMembers = async () => {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 7);
  let affectedRows = await mysql("GuildMembers")
    .where("LeftDTM", "<", expireDates)
    .where("status", "=", 0)
    .delete();

  notify.push({ message: `清除了 ${affectedRows} 退出成員資料` });
};

exports.resetRecords = async () => {
  try {
    let result = await RecordModel.recordTotalTimes();
    if (result !== 1) throw "TotalEventTimes 紀錄失敗，發信通知";

    await RecordModel.clearRecords();

    notify.push({ message: "每月次數已重置" });
  } catch (e) {
    notify.push({ message: e, alert: true });
  }
};
