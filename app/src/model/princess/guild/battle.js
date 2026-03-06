const mysql = require("../../../util/mysql");

/**
 * 新增完成紀錄
 * @param {String} guildId
 * @param {String} userId
 */
exports.setFinishBattle = (guildId, userId) => {
  let { start, end } = getBattleDate(new Date());
  return mysql
    .transaction(trx => {
      trx
        .select("id")
        .from("GuildBattleFinish")
        .where({ guildId, userId })
        .whereBetween("CreateDTM", [start, end])
        .then(res => {
          if (res.length === 0) {
            return trx("GuildBattleFinish").insert({
              guildId,
              userId,
            });
          }
          return Promise.resolve(1);
        })
        .then(trx.commit)
        .catch(trx.rollback);
    })
    .catch(console.error);
};

exports.resetFinishBattle = (guildId, userId) => {
  let { start, end } = getBattleDate(new Date());
  return mysql
    .from("GuildBattleFinish")
    .where({ guildId, userId })
    .whereBetween("CreateDTM", [start, end])
    .delete();
};

/**
 * 取得今日完成三刀列表
 * @param {String} guildId
 * @param {Date} objDate 指定的日期
 */
exports.getFinishList = async (guildId, objDate) => {
  let { start, end } = getBattleDate(objDate);
  let memberIds = [],
    signinIds = [];

  let rows = await mysql.select("userId").from("GuildMembers").where({ guildId, status: 1 });

  memberIds = rows.map(row => row.userId);

  let GBFrows = await mysql
    .select(["userId", "createDTM"])
    .from("GuildBattleFinish")
    .where({ guildId })
    .whereBetween("createDTM", [start, end]);

  signinIds = GBFrows.map(row => row.userId);

  return memberIds.map(id => ({
    userId: id,
    isSignin: signinIds.includes(id),
    ...GBFrows.find(row => row.userId === id),
  }));
};

/**
 * 取得該月份簽到表
 * @param {String} guildId
 * @param {Number} month
 */
exports.getMonthFinishList = (guildId, month) => {
  return mysql
    .select(["userId", "createDTM"])
    .from("GuildBattleFinish")
    .where({ guildId })
    .whereRaw("month(createDTM) = ?", [month]);
};

/**
 * 取得戰隊用日期
 * @param {Date} objDate 可指定哪一天
 */
function getBattleDate(objDate) {
  let start = new Date(objDate);
  let end = new Date(objDate);

  let hour = objDate.getHours();

  if (hour < 5) {
    start.setDate(start.getDate() - 1);
  } else {
    end.setDate(end.getDate() + 1);
  }

  return {
    start:
      [start.getFullYear(), start.getMonth() + 1, start.getDate()].join("-") +
      " " +
      ["05", "00", "00"].join(":"),
    end:
      [end.getFullYear(), end.getMonth() + 1, end.getDate()].join("-") +
      " " +
      ["04", "59", "59"].join(":"),
  };
}

