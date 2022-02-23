// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const uidModel = require("../../model/princess/uid");
const ianService = require("../../service/ianService");
const guildService = require("../../service/guildService");
const _ = require("lodash");
const battleTemplate = require("../../templates/princess/guild/battle");
const characterModel = require("../../model/princess/character");
const datefromat = require("dateformat");

/**
 * 隊長綁定，綁定後可得知戰隊情報
 * @param {Context} context
 */
exports.leaderBinding = async context => {
  const { userId, groupId } = context.event.source;
  const { clanBinding } = context.state;

  if (new Date().getTime() - clanBinding < 60 * 10 * 1000) {
    return context.replyText("[戰隊隊長綁定] 每次綁定需等待10分鐘才能換綁");
  }

  if (!userId) {
    return context.replyText("無法獲取您的LINE ID");
  }

  let bindData = await uidModel.getBindingData(userId);
  if (!bindData) {
    return context.replyText("尚未綁定遊戲ID，請先輸入 `#好友小卡` 進行ID綁定");
  }

  let { server, uid } = bindData;
  const clanData = await ianService.getClanBattleRank({
    server,
    leader_uid: uid,
    month: getCurrentMonth(),
  });

  if (!clanData || clanData.length === 0) {
    return context.replyText("查無戰隊資訊，以下為可能原因\n1. 未進入前200名\n2. 綁定者非隊長");
  }

  let { clanName, leaderName, records } = clanData;
  let latestRecord = _.last(records);
  let { score } = latestRecord;
  let result = await guildService.updateByGuildId(groupId, {
    name: clanName,
    uid,
  });

  if (result) {
    context.replyText(
      [`綁定成功，戰隊名稱：${clanName}`, `目前分數：${score}`, `隊長名稱：${leaderName}`].join(
        "\n"
      )
    );

    context.setState({ clanBinding: new Date().getTime() });
  }
};

/**
 * 回應戰隊資訊
 * @param {Context} context
 */
exports.showClanInfo = async context => {
  const { groupId } = context.event.source;

  let guild = await guildService.findByGuildId(groupId, ["princess"]);

  if (!guild) {
    return context.replyText("群組數據獲取失敗");
  }
  let { server, uid } = guild;

  let clanData = await ianService.getClanBattleRank({
    server,
    leader_uid: uid,
    month: getCurrentMonth(),
  });

  if (!clanData) {
    return context.replyText("查無戰隊資訊，以下為可能原因\n1. 未進入前200名\n2. 尚未開始戰隊戰");
  }

  let { clanName, leaderName, records, leaderFavoriteUnit: unitId, leaderHash } = clanData;
  let latestRecord = _.last(records);
  let { rank, ts, score } = latestRecord;
  let status = caclulateState(score);
  let nearby = await getNearByData(server, rank, ts);

  let nearbyBox = battleTemplate.genNearbyBox(
    nearby.map(data => ({
      rank: data.records.rank,
      clanName: data.clanName,
      status: caclulateState(data.records.score),
      diff: data.records.score - score,
    }))
  );

  let bubble = battleTemplate.genGuildStatusBubble(
    {
      server,
      leaderUnit: characterModel.transHeadImageSrc(unitId),
      clanName,
      leaderName,
      rank,
      score,
      status,
      ts,
    },
    nearbyBox
  );

  let pannelBubble = battleTemplate.genGuildStatusPanel(server, leaderHash);

  context.replyFlex("戰隊狀況", {
    type: "carousel",
    contents: [bubble, pannelBubble],
  });
};

function getCurrentMonth() {
  let now = new Date();
  return datefromat(now, "yyyymm");
}

/**
 * 從分數推算目前狀態
 * @param {Number} score 分數
 */
function caclulateState(score) {
  let currStage = 1;
  let currWeek = 1;
  let currBoss = 1;

  let stageData = [
    {
      stage: 1,
      weight: [1.2, 1.2, 1.3, 1.4, 1.5],
      hp: [6000000, 8000000, 10000000, 12000000, 15000000],
      max: 3,
    },
    {
      stage: 2,
      weight: [1.6, 1.6, 1.8, 1.9, 2],
      hp: [6000000, 8000000, 10000000, 12000000, 15000000],
      max: 10,
    },
    {
      stage: 3,
      weight: [2, 2, 2.4, 2.4, 2.6],
      hp: [12000000, 14000000, 17000000, 19000000, 20000000],
      max: 30,
    },
    {
      stage: 4,
      weight: [3.5, 3.5, 3.7, 3.8, 4],
      hp: [19000000, 20000000, 23000000, 25000000, 27000000],
      max: 40,
    },
    {
      stage: 5,
      weight: [3.5, 3.5, 3.7, 3.8, 4],
      hp: [95000000, 100000000, 110000000, 120000000, 130000000],
      max: 999,
    },
  ];

  while (score > 0) {
    let currData = stageData[currStage - 1];
    score -= currData.weight[currBoss - 1] * currData.hp[currBoss - 1];
    currBoss++;

    if (currBoss > 5) {
      currBoss = 1;
      currWeek++;
    }

    if (currWeek > currData.max) {
      currStage++;
    }
  }

  if (score < 0) {
    currBoss--;
  }

  if (currBoss === 0) {
    currBoss = 5;
    currWeek--;
  }

  let target = stageData.find(data => data.max > currWeek);
  currStage = target.stage;

  return {
    stage: currStage,
    week: currWeek,
    boss: currBoss,
  };
}

/**
 * 透過排名來反推，附近排名的逼迫程度
 * @param {Number} server
 * @param {Number} rank
 */
async function getNearByData(server, rank, ts) {
  let nearRank = [rank - 1, rank, rank + 1];
  let hasTop = nearRank.includes(0);
  let hasBottom = nearRank.includes(201);

  // 頂到天或地都要修正附近排名
  if (hasTop) {
    nearRank = nearRank.map(r => r + 1);
  } else if (hasBottom) {
    nearRank = nearRank.map(r => r - 1);
  }

  let pages = _.uniq(nearRank.map(r => Math.floor(r / 20)));

  let data = await Promise.all(
    pages.map(page => ianService.getClanBattleServerRank({ server, page, ts_start: ts }))
  );

  let nearby = [];
  data.forEach(d => {
    // 將多分頁的紀錄，抓取出附近的排名塞進`nearby`
    let result = d.filter(v => nearRank.includes(v.records.rank));
    nearby = _.concat(nearby, result);
  });

  return nearby;
}
