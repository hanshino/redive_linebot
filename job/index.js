const mysql = require("./lib/mysql");
const report = [];
const notify = require("./lib/notify");
const CronJob = require("cron").CronJob;

let dailyJob = new CronJob("0 0 0 * * *", daily);
let nonStopJob = new CronJob("0 */10 * * * *", hearbeat);

dailyJob.start();
nonStopJob.start();

async function daily() {
  await Promise.all([
    markUselessCustomerOrder(),
    removeDeletedCustomerOrder(),
    clearCloseGroup(),
  ]);

  notify.push(`\n${report.join("\n")}`);
}

/**
 * 刪除已標記刪除自訂指令
 */
async function removeDeletedCustomerOrder() {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 3);
  let affectedRows = await mysql
    .from("CustomerOrder")
    .where("status", 0)
    .where("ModifyDTM", "<", expireDates)
    .delete();

  report.push(`已刪除自訂指令清除了：${affectedRows} 筆`);
}

/**
 * 關閉的群組，進行以下清除
 * - 群組資料
 * - 群組會員資料
 * - 自訂指令
 * - 群組設定
 * - 戰隊資料（戰隊表、戰隊周次、戰隊簽到）
 */
async function clearCloseGroup() {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 7);

  let delGuilds = await mysql
    .select("guildId")
    .from("Guild")
    .where("status", 0)
    .where("CloseDTM", "<", expireDates)
    .then(res => res.map(data => data.guildId));

  if (delGuilds.length === 0) {
    report.push("沒有關閉的群組需要清除");
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
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組會員資料`, delGuildConfig))
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組設定`, delGuildBattle))
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊表`, delGuildWeek))
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊周次資料`, delGuildBattleFinish))
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組戰隊簽到資料`, delCustomerOrder))
      .then(affectedRows => recordResultThenNext(`刪除了 ${affectedRows} 個群組自訂指令`, Promise.resolve))
      .then(trx.commit)
      .catch(trx.rollback);
  })

  function recordResultThenNext(msg, next) {
    report.push(msg);
    return next;
  }
}

async function markUselessCustomerOrder() {
  let expireDates = new Date();
  expireDates.setMonth(expireDates.getMonth() - 2);

  let affectedRows = await mysql
    .from("CustomerOrder")
    .where("status", 1)
    .where("touchDTM", "<", expireDates)
    .delete();

  report.push(`已將 ${affectedRows} 個不常用指令標記刪除`);
}

async function hearbeat() {
  let now = new Date();
  let strNow = [
    now.getFullYear(),
    (now.getMonth() + 1).toString().padStart(2, '0'),
    now.getDate().toString().padStart(2, '0'),
  ].join("/") + " " + [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join(":");

  notify.push({
    message: `${strNow} 還活著..`,
    alert: true,
  });
}
