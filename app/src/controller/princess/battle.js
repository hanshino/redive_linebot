const { battle: BattleModel, week: WeekModel } = require("../../model/princess/guild");
const minimist = require("minimist");
const GuildModel = require("../../model/application/Guild");
const line = require("../../util/line");
const BattleTemplate = require("../../templates/princess/guild/battle");
const { recordSign } = require("../../util/traffic");
const BattleSender = { name: "戰隊秘書", iconUrl: "https://i.imgur.com/NuZZR7Q.jpg" };
const redis = require("../../util/redis");

function BattleException(message) {
  this.message = message;
  this.name = "GuildBattle";
}

exports.BattleList = async (context, props) => {
  try {
    recordSign("BattleList");
    var { week, boss } = props.match.groups;
    if (week === undefined) {
      week = await getCurrWeek(context.event.source.groupId);
    }
    if (!isValidWeek(week)) throw new BattleException("周次輸入錯誤，請輸入介於1~199");

    const formId = await getFormId(context);

    const [formRecords, formConfigs] = await Promise.all([
      BattleModel.Ian.getFormRecords(formId, week, boss),
      BattleModel.Ian.getFormConfig(formId),
    ]);

    if (boss === undefined) {
      BattleTemplate.showBattleList(context, {
        week: week,
        formId: formId,
        datas: formRecords,
        records: [1, 2, 3, 4, 5].map(boss => genPreivewData(formRecords, boss)),
        configs: formConfigs.boss,
      });
    } else {
      BattleTemplate.showBattleDetail(context, {
        week: week,
        formId: formId,
        datas: formRecords,
        records: genPreivewData(formRecords, boss),
        boss: boss,
        configs: formConfigs.boss,
      });
    }
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

async function getFormId(context) {
  var { groupId } = context.event.source;
  var month = getNowMonth();
  var formId = await BattleModel.getFormId(groupId, month);

  if (formId === false) {
    let ianUserId = await getIanUserId(context);
    let groupSummary = await line.getGroupSummary(groupId);
    let createResult = await BattleModel.Ian.createForm(ianUserId, month, groupSummary.groupName);
    console.log(createResult);
    BattleModel.setFormId(groupId, createResult.id, month);

    return createResult.id;
  }

  return formId;
}

async function getIanUserId(context) {
  var { userId } = context.event.source;
  var profile = context.state.userDatas[userId];
  var [ianUserData] = await BattleModel.getIanUserData(2, userId);

  if (ianUserData === undefined) {
    console.log(`userId: ${userId}, none register.`);
    // 尚未到ian戰隊系統註冊，進行自動註冊
    ianUserData = await BattleModel.Ian.isRegister(2, userId);

    console.log(`userId: ${userId}, isRegiter Result ${JSON.stringify(ianUserData)}`);

    if (ianUserData.id === undefined) {
      await BattleModel.Ian.RegisterUser(2, userId, profile.displayName, profile.pictureUrl);
      ianUserData = await BattleModel.Ian.isRegister(2, userId);
    }

    await BattleModel.saveIanUserData(2, userId, ianUserData.id);

    return ianUserData.id;
  } else return ianUserData.ianUserId;
}

/**
 * 產出總覽所需資料
 * @param {Array} records
 * @param {Number} boss
 */
function genPreivewData(records, boss) {
  let temp = {
    Boss: boss,
    TotalCount: records.filter(record => record.boss === undefined || record.boss == boss).length,
    FullCount: records.filter(
      record => (record.boss === undefined || record.boss == boss) && record.status == 1
    ).length, // 正式
    NotFullCount: records.filter(
      record => (record.boss === undefined || record.boss == boss) && record.status == 2
    ).length, // 補償
    KyaryuCount: records.filter(
      record => (record.boss === undefined || record.boss == boss) && record.status == 3
    ).length, // 凱留刀
    OtherCount: records.filter(
      record =>
        (record.boss === undefined || record.boss == boss) &&
        [1, 2, 3].indexOf(record.status) === -1
    ).length,
  };

  return temp;
}

/**
 * @typedef {Object} Result
 * @property {String} result.comment
 * @property {Number} result.damage
 * @property {Number} result.type
 * 進行訊息參數分析
 * @param {String} message 訊息內容
 * @return {Result}
 */
function paramInitial(message) {
  const param = minimist(message.split(/\s+/));
  const result = {};

  Object.keys(param).forEach(key => {
    switch (key) {
      case "comment":
      case "c":
        result.comment = param[key];
        break;
      case "damage":
      case "d":
        result.damage = param[key];
        break;
      case "type":
      case "t":
        result.type = param[key];
        break;
    }
  });

  result.week = param._[1];
  result.boss = param._[2];

  return result;
}

exports.BattleSignUp = async (context, props) => {
  recordSign("BattleSignUp");

  let params = {};
  if (context.event.isText) {
    params = paramInitial(context.event.message.text);
  }
  params = { ...params, ...props };
  let { week, boss, damage, comment, type } = params;

  try {
    if (week === undefined || boss === undefined) throw new BattleException("必須指定周次以及幾王");
    if (!isValidWeek(week)) throw new BattleException("周次必須介於1~199");

    const [formId, ianUserId] = await Promise.all([getFormId(context), getIanUserId(context)]);

    var setResult = await BattleModel.Ian.setRecord(formId, week, boss, ianUserId, {
      status: type || 1,
      damage,
      comment,
    });

    if (setResult.detail === undefined) {
      let sender = {
        name: context.state.userDatas[context.event.source.userId].displayName,
        iconUrl: context.state.userDatas[context.event.source.userId].pictureUrl,
      };
      let feedback = `我報名了 *${week}周${boss}王* ，${getStatusText(type || 1)}`;
      feedback += damage ? `\n傷害：${damage}` : "";
      feedback += comment ? `\n備註：${comment}` : "";
      context.sendText(feedback, { sender });
    } else throw setResult.detail;
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.BattlePostSignUp = (context, props) => {
  const { payload } = props;
  this.BattleSignUp(context, { ...payload });
};

exports.BattleCancel = async (context, props) => {
  recordSign("BattleCancel");
  const { week, boss, recordId } = props.match.groups;

  try {
    if (week === undefined || boss === undefined) throw new BattleException("必須指定周次以及幾王");
    if (!isValidWeek(week)) throw new BattleException("周次輸入錯誤，請輸入介於1~199");
    const [formId, ianUserId] = await Promise.all([getFormId(context), getIanUserId(context)]);

    var formRecords = await BattleModel.Ian.getFormRecords(formId, week, boss);

    formRecords = formRecords.filter(record => record.user.id === ianUserId);

    if (formRecords.length !== 1 && recordId === undefined)
      throw new BattleException("紀錄不只一筆，請使用選單進行取消！");

    let cancelId = recordId || formRecords[0].id;

    let cancelRecord = formRecords.find(record => record.id == cancelId);

    if (cancelRecord === undefined || cancelRecord.user.id !== ianUserId) return; // 非本人 中斷執行

    var setResult = await BattleModel.Ian.setRecord(formId, week, boss, ianUserId, {
      status: 99,
      id: cancelId,
    });

    if (setResult.detail === undefined) {
      let sender = {
        name: context.state.userDatas[context.event.source.userId].displayName,
        iconUrl: context.state.userDatas[context.event.source.userId].pictureUrl,
      };
      context.sendText(`我取消了${week}周${boss}王`, { sender });
    } else throw setResult.detail;
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.BattlePostCancel = (context, props) => {
  const { payload } = props;
  this.BattleCancel(context, {
    match: {
      groups: { ...payload },
    },
    type: payload.type,
  });
};

function getStatusText(status) {
  switch (status) {
    case 1:
      return "完整";
    case 2:
      return "補償";
    case 3:
      return "凱留";
    default:
      return "其他";
  }
}

exports.CurrentBattle = async context => {
  recordSign("CurrentBattle");
  try {
    const { groupId } = context.event.source;

    var currWeek = await getCurrWeek(groupId);

    this.BattleList(context, { match: { groups: { week: currWeek } } });
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.SetWeek = async (context, props) => {
  recordSign("SetWeek");
  try {
    const { week } = props.match.groups;
    const { groupId } = context.event.source;

    if (/^1?\d{1,2}$/.test(week) === false || week === "0")
      throw new BattleException("周次僅限定於1~199");

    // 確保有Week紀錄
    await getCurrWeek(groupId);

    await WeekModel.setWeek(groupId, getNowMonth(), parseInt(week));

    context.sendText(`已將周次設定為${week}`, {
      sender: {
        name: "戰隊秘書",
        iconUrl: "https://i.imgur.com/NuZZR7Q.jpg",
      },
    });
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.NextBattleList = context => {
  recordSign("NextBattleList");
  try {
    const { groupId } = context.event.source;

    return getCurrWeek(groupId).then(week =>
      this.BattleList(context, {
        match: {
          groups: {
            week: week + 1,
          },
        },
      })
    );
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.PreBattleList = context => {
  recordSign("PreBattleList");
  try {
    if (context.platform !== "line") throw new BattleException("暫時只提供Line平台使用");
    if (context.event.source.type !== "group") throw new BattleException("只提供群組用戶使用");

    const { groupId } = context.event.source;

    getCurrWeek(groupId).then(week =>
      this.BattleList(context, {
        match: {
          groups: {
            week: week - 1 === 0 ? 1 : week - 1,
          },
        },
      })
    );
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.IncWeek = context => {
  return getCurrWeek(context.event.source.groupId).then(week =>
    this.SetWeek(context, {
      match: {
        groups: {
          week: week + 1,
        },
      },
    })
  );
};

exports.DecWeek = context => {
  return getCurrWeek(context.event.source.groupId).then(week =>
    this.SetWeek(context, {
      match: {
        groups: {
          week: week - 1 <= 0 ? 1 : week - 1,
        },
      },
    })
  );
};

exports.FinishWeek = async context => {
  recordSign("FinishWeek");
  const { groupId } = context.event.source;
  var currWeek = await getCurrWeek(groupId);
  WeekModel.setWeek(groupId, getNowMonth(), currWeek + 1);
  this.BattleList(context, {
    match: {
      groups: {
        week: currWeek + 1,
      },
    },
  });
};

/**
 * 取得戰隊用月份字串
 */
function getNowMonth() {
  var now = new Date();
  return [now.getFullYear(), ("0" + (now.getMonth() + 1)).substr(-2)].join("");
}

async function getCurrWeek(groupId) {
  var [currWeekData] = await WeekModel.queryWeek(groupId, getNowMonth());

  if (currWeekData === undefined) {
    await WeekModel.insertWeek(groupId, getNowMonth());
    return 1;
  }

  return parseInt(currWeekData.week);
}

/**
 * 驗證周次的正確性
 * @param {String} week
 */
function isValidWeek(week) {
  if (!/^\d+$/.test(week)) return false;
  week = parseInt(week);
  if (week >= 200) return false;
  if (week <= 0) return false;
  return true;
}

/**
 * 回報戰隊出完三刀，並寫進資料庫
 * @param {Context} context
 */
exports.reportFinish = context => {
  const { groupId, userId } = context.event.source;
  let userName = context.state.userDatas[userId].displayName || "路人甲";

  BattleModel.setFinishBattle(groupId, userId).then(() =>
    context.sendText(`恭喜${userName}今日已成為成功人士(出完三刀)！`, { sender: BattleSender })
  );
};

/**
 * 將當天回報紀錄刪除
 * @param {Context} context
 */
exports.reportReset = async context => {
  const { groupId, userId } = context.event.source;
  await BattleModel.resetFinishBattle(groupId, userId);

  context.sendText("吶吶，那你剛剛回報是不是騙我，嘖！\n幫你清除了啦！", { sender: BattleSender });
};

/**
 * 顯示今日的簽到列表
 * @param {Context} context
 */
exports.showSigninList = async (context, { match }) => {
  const { groupId } = context.event.source;
  var { date } = match.groups;
  date = date || new Date().getDate();
  let objDate = new Date();
  let currMonth = objDate.getMonth();
  objDate.setDate(parseInt(date));
  objDate.setMonth(currMonth);
  let FinishDatas = await BattleModel.getFinishList(groupId, objDate);

  if (FinishDatas.length > 50) {
    context.sendText("此指令不適用於非戰隊群組（人數超過50人）", { sender: BattleSender });
    return;
  }

  if (FinishDatas.find(data => data.isSignin) === undefined) {
    context.sendText(`${date}號查無任何出刀紀錄！`, { sender: BattleSender });
    return;
  }

  if (FinishDatas.filter(data => data.isSignin).length === FinishDatas.length) {
    context.sendText(`${date}號全群皆已完成出刀！`, { sender: BattleSender });
    return;
  }

  let sentKey = `FinishList_${groupId}`;

  if ((await redis.get(sentKey)) !== null) {
    context.sendText("此指令限制30秒呼叫一次", { sender: BattleSender });
    return;
  }

  redis.set(sentKey, 1, 30);

  let result = await Promise.all(
    FinishDatas.map(async data => ({
      ...data,
      ...(await line.getGroupMemberProfile(groupId, data.userId)),
    }))
  );

  BattleTemplate.showFinishList(context, result);
};

exports.api = {};

exports.api.showSigninList = async (req, res) => {
  let { month, guildId } = req.params;
  month = parseInt(month) || new Date().getMonth() + 1;

  let [memberDatas, signinList] = await Promise.all([
    GuildModel.fetchGuildMembers(guildId),
    BattleModel.getMonthFinishList(guildId, month),
  ]);

  let result = arrangeMonthFinishList(memberDatas, signinList);

  result = await Promise.all(
    result.map(async data => {
      let profile = await line.getGroupMemberProfile(data.guildId, data.userId);
      return { ...profile, ...data };
    })
  );

  res.json(result);
};

/**
 * 整理出可用的簽到資料
 * @param {Array<{guildId: String, userId: String}>} memberDatas 群組會員資料
 * @param {Array<{createDTM: Date, userId: String}>} signinList 簽到資料
 */
function arrangeMonthFinishList(memberDatas, signinList) {
  let result = memberDatas.map(member => ({
    ...member,
    signDates: [],
  }));

  let memberIds = memberDatas.map(data => data.userId);

  signinList.forEach(list => {
    let idx = memberIds.indexOf(list.userId);
    list.createDTM.setHours(list.createDTM.getHours() - 5);
    result[idx].signDates.push(list.createDTM.getDate());
  });

  return result;
}
