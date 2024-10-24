const mysql = require("../lib/mysql");
const RecordModel = require("../model/record");
const GroupModel = require("../model/GroupModel");
const redis = require("../lib/redis");
const { CustomLogger } = require("../lib/Logger");
const { delay, random } = require("../lib/common");

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
    CustomLogger.info({
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
    let delGuildBattleConfig = trx.from("GuildBattleConfig").whereIn("GuildId", delGuilds).delete();
    let guildIds = trx.from("Guild").select("id").whereIn("GuildId", delGuilds);
    let delGuildService = trx.from("guild_service").where("guild_id", "in", guildIds).delete();

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
        recordResultThenNext(`刪除了 ${affectedRows} 個群組自訂指令`, delGuildBattleConfig)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊設定`, delGuildService)
      )
      .then(affectedRows =>
        recordResultThenNext(`刪除了 ${affectedRows} 個群組服務設定`, Promise.resolve)
      )
      .then(trx.commit)
      .catch(trx.rollback);
  });

  CustomLogger.info({
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

  CustomLogger.info({ message: `清除了 ${affectedRows} 退出成員資料` });
};

exports.resetRecords = async () => {
  try {
    let result = await RecordModel.recordTotalTimes();
    if (result !== true) throw "TotalEventTimes 紀錄失敗，發信通知";

    await RecordModel.clearRecords();

    CustomLogger.info({ message: "每月次數已重置" });
  } catch (e) {
    console.log(e);
    CustomLogger.info({ message: e, alert: true });
  }
};

/**
 * 盤點會員資料，七天盤一次
 */
exports.provideCleanUpMembers = async () => {
  let memberDatas = await GroupModel.getActiveMembers();
  CustomLogger.info(`七天固定盤點會員資料，此次處理筆數 ${memberDatas.length}`);
  let status = memberDatas.map(data => redis.enqueue("CleanUpMembers", JSON.stringify(data)));
  await Promise.all(status);
};

exports.consumeCleanUpMembers = async () => {
  let count = 0;
  let markIds = [];

  while (true) {
    let memberData = await redis.dequeue("CleanUpMembers");
    if (memberData === null) break;
    count++;

    memberData = JSON.parse(memberData);

    let profile = await GroupModel.getGroupMemberProfile(memberData.groupId, memberData.userId);

    if (!profile) {
      CustomLogger.info(memberData.id, "準備標記刪除");
      markIds.push(memberData.id);
    }

    if (count > 1000) break;
    await delay(random(1, 10) * 0.1);
  }

  CustomLogger.info(`關閉 ${markIds.length} 個 群組會員資料`);

  await GroupModel.shutdownMembers(markIds);
};
