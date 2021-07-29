const { Context } = require("bottender");
const uidModel = require("../../model/princess/uid");
const ianService = require("../../service/ianService");
const guildService = require("../../service/guildService");

/**
 * 隊長綁定，綁定後可得知戰隊情報
 * @param {Context} context
 * @param {import("bottender/dist/types").Props} props
 */
exports.leaderBinding = async (context, props) => {
  const { userId, groupId } = context.event.source;
  const { clanBinding } = context.state;

  if (new Date().getTime() - clanBinding < 60 * 10 * 1000) {
    return context.sendText("[戰隊隊長綁定] 每次綁定需等待10分鐘才能換綁");
  }

  if (!userId) {
    return context.sendText("無法獲取您的LINE ID");
  }

  let bindData = await uidModel.getBindingData(userId);
  if (!bindData) {
    return context.sendText("尚未綁定遊戲ID，請先輸入 `#好友小卡` 進行ID綁定");
  }

  let { server, uid } = bindData;
  let latestRecordTs = getLatestRecordTs();

  const clanData = await ianService.getClanBattleRank({
    server,
    leader_uid: uid,
    ts: latestRecordTs,
  });

  if (!clanData) {
    return context.sendText("查無戰隊資訊，以下為可能原因\n1. 未進入前200名\n2. 綁定者非隊長");
  }

  let { clan_name, leader_viewer_id, leader_name, damage } = clanData[0];
  let result = await guildService.updateByGuildId(groupId, {
    name: clan_name,
    uid: leader_viewer_id,
  });

  if (result) {
    context.sendText(
      [`綁定成功，戰隊名稱：${clan_name}`, `目前分數：${damage}`, `隊長名稱：${leader_name}`].join(
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
    return context.sendText("群組數據獲取失敗");
  }
  let { server, uid } = guild;

  let clanData = await ianService.getClanBattleRank({
    server,
    leader_uid: uid,
    ts: getLatestRecordTs(),
  });

  if (!clanData) {
    return context.sendText("查無戰隊資訊，以下為可能原因\n1. 未進入前200名");
  }

  let { clan_name, leader_name, damage, rank, ts } = clanData[0];
  let { boss, week, stage } = caclulateState(damage);
  let nearby = await getNearByData(server, rank);

  let response = [
    `戰隊名稱：${clan_name}`,
    `隊長名稱：${leader_name}`,
    `目前分數：${damage}`,
    `目前排名：${rank}`,
    `戰隊狀況：${stage}階 ${week}周 ${boss}王`,
    `紀錄時間：${new Date(ts * 1000).toLocaleString()}`,
  ];

  let forward = nearby.find(data => data.rank === rank - 1);
  let back = nearby.find(data => data.rank === rank + 1);
  let nearResponse = [
    `距離前一名還有 *${forward.damage - damage}* 分，對方為 *${forward.clan_name}*`,
    `距離後一名還有 *${damage - back.damage}* 分，對方為 *${back.clan_name}*`,
  ];

  context.sendText(response.join("\n"));
  context.sendText(nearResponse.join("\n"));
};

function getLatestRecordTs() {
  let now = new Date();
  let min = now.getMinutes();
  now.setMinutes(Math.floor(min / 20) * 20);
  now.setSeconds(0);

  return Math.floor(now.getTime() / 1000);
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
      hp: [7000000, 9000000, 13000000, 15000000, 20000000],
      max: 34,
    },
    {
      stage: 4,
      weight: [3.5, 3.5, 3.7, 3.8, 4],
      hp: [17000000, 18000000, 20000000, 21000000, 23000000],
      max: 44,
    },
    {
      stage: 5,
      weight: [3.5, 3.5, 3.7, 3.8, 4],
      hp: [85000000, 90000000, 95000000, 100000000, 110000000],
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
async function getNearByData(server, rank) {
  let page = Math.floor(rank / 20);
  let rankData = await ianService.getClanBattleRank({ server, page, ts: getLatestRecordTs() });

  if (!rankData) return null;
  let nearby = rankData.filter(data => [rank - 1, rank + 1].includes(data.rank));

  return nearby;
}
