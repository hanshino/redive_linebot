const { battle: BattleModel, week: WeekModel } = require("../../model/princess/guild");
const line = require("../../util/line");
const BattleTemplate = require("../../templates/princess/guild/battle");
const { recordSign } = require("../../util/traffic");

function BattleException(message) {
  this.message = message;
  this.name = "GuildBattle";
}

exports.BattleList = async (context, props) => {
  try {
    recordSign("BattleList");
    const { week, boss } = props.match.groups;
    if (week === undefined) throw new BattleException("缺少參數，至少需指定周次");
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
    // 尚未到ian戰隊系統註冊，進行自動註冊

    await BattleModel.Ian.RegisterUser(2, userId, profile.displayName, profile.pictureUrl);

    ianUserData = await BattleModel.Ian.isRegister(2, userId);
    BattleModel.saveIanUserData(2, userId, ianUserData.id);

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

exports.BattleSignUp = async (context, props) => {
  recordSign("BattleSignUp");
  const { week, boss } = props.match.groups;
  const { type } = props;

  try {
    if (week === undefined || boss === undefined) throw new BattleException("必須指定周次以及幾王");

    const [formId, ianUserId] = await Promise.all([getFormId(context), getIanUserId(context)]);

    var setResult = await BattleModel.Ian.setRecord(formId, week, boss, ianUserId, {
      status: type || 1,
    });

    if (setResult.detail === undefined) {
      let sender = {
        name: context.state.userDatas[context.event.source.userId].displayName,
        iconUrl: context.state.userDatas[context.event.source.userId].pictureUrl,
      };
      context.sendText(`我報名了${week}周${boss}王，${getStatusText(type || 1)}`, { sender });
    } else throw setResult.detail;
  } catch (e) {
    if (e.name === "GuildBattle") {
      context.sendText(e.message);
    } else throw e; // keep throw
  }
};

exports.BattlePostSignUp = (context, props) => {
  const { payload } = props;
  this.BattleSignUp(context, {
    match: {
      groups: { ...payload },
    },
    type: payload.type,
  });
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
