const mysql = require("../../../util/mysql");
const fetch = require("node-fetch");
const token = process.env.IAN_BATTLE_TOKEN;
const headers = { "x-token": token, "user-agent": "re:dive line-bot" };
const apiURL = process.env.IAN_BATTLE_API_URL;
const redis = require("../../../util/redis");
const { CustomLogger } = require("../../../util/Logger");

exports.saveIanUserData = (platform = 2, userId, ianUserId) => {
  return mysql
    .insert({
      platform: platform,
      userId: userId,
      ianUserId: ianUserId,
      createDTM: new Date(),
    })
    .into("IanUser");
};

exports.isRegister = (platform, userId) => {
  return mysql
    .select("*")
    .where({
      platform: platform,
      userId: userId,
    })
    .from("IanUser");
};

exports.getIanUserData = (platform, userId) => this.isRegister(platform, userId);

exports.getFormId = (guildId, month) => {
  return mysql
    .select("*")
    .from("GuildBattle")
    .where({ guildId, month })
    .then(res => (res.length === 0 ? false : res[0].FormId));
};

/**
 * 設定群組的報名表ID
 * @param {String} guildId
 * @param {String} formId
 * @param {String} month
 */
exports.setFormId = (guildId, formId, month) => {
  return mysql
    .insert({
      guildId,
      formId,
      month,
    })
    .into("GuildBattle")
    .then();
};

/**
 * 獲取用戶的群組報名表
 * @param {String} userId
 */
exports.getUserGuildFroms = userId => {
  let now = new Date();
  let month = [now.getFullYear(), `0${now.getMonth() + 1}`.substr(-2)].join("");
  let weekQuery = mysql
    .max("week")
    .as("week")
    .from("GuildWeek")
    .where(mysql.raw("guildId = GM.GuildId"));
  return mysql
    .select([{ groupId: "GB.GuildId" }, { formId: "GB.FormId" }, weekQuery])
    .join("GuildBattle as GB", "GM.GuildId", "GB.GuildId")
    .from("GuildMembers as GM")
    .where("UserId", userId)
    .where("GB.Month", month);
};

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

  let year = objDate.getFullYear();
  let hour = objDate.getHours();

  if (hour < 5) {
    start.setDate(start.getDate() - 1);
  } else {
    end.setDate(end.getDate() + 1);
  }

  return {
    start:
      [year, start.getMonth() + 1, start.getDate()].join("-") + " " + ["05", "00", "00"].join(":"),
    end: [year, end.getMonth() + 1, end.getDate()].join("-") + " " + ["04", "59", "59"].join(":"),
  };
}

exports.Ian = {};

/**
 * 向Ian戰隊系統註冊會員
 * @param {Number} platform 平台 1:discord, 2:line
 * @param {String} userId
 * @param {String} name 顯示姓名
 * @param {String} avatar 顯示頭像
 */
exports.Ian.RegisterUser = (platform = 2, userId, name, avatar = "") => {
  return doPost("/bot/register", {
    platform: platform,
    user_id: userId,
    avatar: avatar,
    name: name,
  });
};

exports.Ian.isRegister = (platform, userId) => {
  return doGet(`/bot/isRegister?platform=${platform}&user_id=${userId}`);
};

exports.Ian.createForm = (ianUserId, month, title = "") => {
  return doPost(`/bot/forms/create?user_id=${ianUserId}`, {
    month: month,
    title: title,
  });
};

exports.Ian.getFormRecords = (formId, week, boss) => {
  if (boss === undefined) return doGet(`/forms/${formId}/week/${week}`);
  return doGet(`/forms/${formId}/week/${week}/boss/${boss}`);
};

/**
 * 取得該用戶報名紀錄
 * @param {String} formId
 * @param {String} userId
 * @param {Number} limit
 */
exports.Ian.getUserFormRecords = (formId, userId, limit = 5) => {
  // https://guild.randosoru.me/api/users/aqLdqN/records?limit=5&form_id=ff0d74e7770b4c43830934a629851be1
  return doGet(`/users/${userId}/records?limit=${limit}&form_id=${formId}`);
};

/**
 *
 * @param {String} formId
 * @param {Number} week
 * @param {Number} boss
 * @param {String} ianUserId
 * @param {Object} option
 * @param {Number} option.status 狀態：1 正式，2 補償，3 凱留，11 戰鬥中，12 等待中，13 等待tag，21 完成(正式)，22 完成(補償)，23 暴死，24 求救
 * @param {Number} option.damage 傷害
 * @param {String} option.comment 備註
 * @param {Number} option.id 紀錄ID
 * @param {Array<{id: String, star: Number, rank: String}>} option.team 使用隊伍
 */
exports.Ian.setRecord = (formId, week, boss, ianUserId, option) => {
  return doPost(`/bot/forms/${formId}/week/${week}/boss/${boss}?user_id=${ianUserId}`, option);
};

/**
 * 取得報名表設定
 * @param {String} formId
 */
exports.Ian.getFormConfig = formId => {
  return doGet(`/forms/${formId}`);
};

function doGet(path) {
  CustomLogger.info(path);
  return fetch(`${apiURL}${path}`, {
    headers: headers,
  })
    .then(IsIanSeverDown)
    .then(res => res.json());
}

function doPost(path, data) {
  CustomLogger.info(`Fetch from ${path} data is ${JSON.stringify(data)}`);
  return fetch(`${apiURL}${path}`, {
    headers: headers,
    body: JSON.stringify(data),
    method: "post",
  })
    .then(IsIanSeverDown)
    .then(res => res.json())
    .then(json => {
      CustomLogger.info(`result: ${JSON.stringify(json)}`);
      return json;
    });
}

/**
 * 暫時全域設定Ian系統維修中
 */
function IsIanSeverDown(response) {
  if (response.ok === false) {
    redis.set("GuildBattleSystem", false, 1 * 60);
  }

  return response;
}
