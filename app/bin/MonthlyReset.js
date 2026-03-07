const mysql = require("../src/util/mysql");
const { CustomLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  try {
    let result = await recordTotalTimes();
    if (result !== true) throw "TotalEventTimes 紀錄失敗，發信通知";

    await clearRecords();
    CustomLogger.info({ message: "每月次數已重置" });
  } catch (e) {
    console.log(e);
    CustomLogger.info({ message: e, alert: true });
  }
}

async function recordTotalTimes() {
  let date = new Date();
  let str = [date.getFullYear(), `0${date.getMonth() + 1}`.substr(-2)].join("");
  let [affectedRows] = await mysql
    .from(
      mysql.raw("?? (??, ??, ??, ??, ??, ??)", [
        "TotalEventTimes",
        "TET_DATE",
        "TET_TEXT",
        "TET_IMAGE",
        "TET_STICKER",
        "TET_VIDEO",
        "TET_UNSEND",
      ])
    )
    .insert(function () {
      this.from("MessageRecord")
        .select({ date: mysql.raw(str) })
        .sum({ textCnt: "MR_TEXT" })
        .sum({ imageCnt: "MR_IMAGE" })
        .sum({ stickerCnt: "MR_STICKER" })
        .sum({ videoCnt: "MR_VIDEO" })
        .sum({ unsendCnt: "MR_UNSEND" });
    });

  return affectedRows === 0;
}

async function clearRecords() {
  await mysql.transaction(async trx => {
    await mysql("GuildMembers").update({ SpeakTimes: 0 }).transacting(trx);
    await mysql("MessageRecord")
      .update({
        MR_TEXT: 0,
        MR_IMAGE: 0,
        MR_STICKER: 0,
        MR_VIDEO: 0,
        MR_UNSEND: 0,
        MR_MODIFYDTM: new Date(),
      })
      .transacting(trx);
  });
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
