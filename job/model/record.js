const mysql = require("../lib/mysql");

/**
 * 清除所有事件紀錄
 * - 群組會員說話紀錄(舊)
 * - 說話紀錄(新)
 */
exports.clearRecords = async () => {
  let trx = await mysql.transaction();

  await mysql("GuildMembers")
    .update({
      SpeakTimes: 0,
    })
    .transacting(trx);

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

  await trx.commit();
};

exports.recordTotalTimes = async () => {
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
};
