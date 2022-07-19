const GachaModel = require("../../model/princess/gacha");
const InventoryModel = require("../../model/application/Inventory");
const { inventory } = InventoryModel;
const random = require("math-random");
const GachaTemplate = require("../../templates/princess/gacha");
const { recordSign } = require("../../util/traffic");
const allowParameter = ["name", "headimage_url", "star", "rate", "is_princess", "tag"];
const redis = require("../../util/redis");
const { DefaultLogger } = require("../../util/Logger");
// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const lineClient = getClient("line");
const chunk = require("lodash/chunk");
const get = require("lodash/get");
const signModel = require("../../model/application/SigninDays");
const moment = require("moment");
const EventCenterService = require("../../service/EventCenterService");
const { isNull, slice } = require("lodash");

function GachaException(message, code) {
  this.message = message;
  this.code = code;
  this.name = "Gacha";
}

GachaException.prototype = new Error();

function getTotalRate(gachaPool) {
  var result = gachaPool
    .map(data => parseFloat(data.rate.replace("%", "")))
    .reduce((pre, curr) => pre + curr);
  return [Math.round(result * 10000), 10000];
}

/**
 * 進行亂數產生
 * @param {Number} times
 * @returns {Array}
 */
function genRandom(max, min, times = 1) {
  let result = [];
  for (let i = 0; i < times; i++) {
    result.push(Math.round(random() * (max - min) + min));
  }

  return result;
}

/**
 * 進行轉蛋
 * @param {Array} gachaPool 轉蛋池
 */
function play(gachaPool, times = 1) {
  const [max, rate] = getTotalRate(gachaPool);
  // 產出亂數陣列，用該數字，取得轉蛋池中相對應位置之獎勵
  const randomAry = genRandom(max, 1, times).sort((a, b) => a - b);

  var stack = 0; // 數字堆疊
  var anchor = 0; // 處理到的亂數陣列錨點
  var rewards = []; // 轉出獎勵陣列

  gachaPool.forEach(data => {
    if (anchor >= randomAry.length) return;
    let top = Math.floor(parseFloat(data.rate.replace("%", "") * rate));

    // 介於轉蛋池中的 堆疊數 和 頂點 的亂數 即為抽出內容物
    while (
      randomAry[anchor] >= stack &&
      randomAry[anchor] <= stack + top &&
      anchor < randomAry.length
    ) {
      rewards.push({ ...data });
      anchor++; // 處理下一錨點
    }

    stack += top; // 數字往上堆疊
  });

  return rewards;
}

function getRainbowCharater(gachaPool) {
  return gachaPool.filter(data => data.star == 3);
}

/**
 * 篩選出符合標籤之轉蛋池
 * @param {Array} gachaPool
 * @param {String} tag
 */
function filterPool(gachaPool, tag) {
  if (tag === undefined) return gachaPool.filter(data => data.isPrincess === "1");

  var isPrincess = true;
  var resultPool = gachaPool.filter(data => {
    let tags = (data.tag || "").split(",");
    if (tags.indexOf(tag) !== -1) {
      isPrincess = data.isPrincess === "0" ? false : true;
      return true;
    }
  });

  // 非公主池子，直接回傳
  if (isPrincess === false) return resultPool;

  // 無符合標籤，回傳滿池，不過將非公主角色排除
  if (resultPool.length === 0) return gachaPool.filter(data => data.isPrincess === "1");

  // 有篩選出特定標籤，將1,2星角色補滿池子
  return resultPool.concat(gachaPool.filter(data => data.star < 3 && data.isPrincess === "1"));
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 針對群組單一用戶進行冷卻時間設定
 * @param {String} userId
 * @param {String} groupId
 */
async function isAble(userId, groupId) {
  // 使用 setnx 限制群組單一用戶轉蛋次數
  let key = `GachaCoolDown_${userId}_${groupId}`;
  let result = await redis.set(key, 1, {
    EX: 120,
    NX: true,
  });

  return !isNull(result);
}

/**
 * 將轉蛋池3*機率調升
 * @param {Array} pool
 */
function makePickup(pool, rate = 100) {
  return pool.map(data => {
    if (data.star !== "3") return data;
    return {
      ...data,
      rate: `${(parseFloat(data.rate) * (100 + rate)) / 100}%`,
    };
  });
}

/**
 * 檢視自己的轉蛋包包
 * @param {Context} context
 */
async function showGachaBag(context) {
  if (context.state.guildConfig.Gacha === "N") return;
  const { userId } = context.event.source;
  const bag = await InventoryModel.fetchUserItem(userId);
  const pool = await GachaModel.getPrincessCharacter();

  const ownIds = bag.map(data => data.itemId);
  const ownCharacters = pool.filter(data => ownIds.includes(data.ID));
  const notOwnCharacters = pool.filter(data => !ownIds.includes(data.ID));

  const generateBubbles = (characters, type) => {
    // 先以 20 個做分組做為一個 bubble
    let chunkCharacters = chunk(characters, 20);

    return chunkCharacters.map(perChunk => {
      // 在每個 bubble 中，每個橫排的角色數量為 5
      let chunkCharactersPerRow = chunk(perChunk, 5);

      let rawRows = chunkCharactersPerRow.map(perRow => {
        // 如果角色數量不足 5，則補足
        let rowCharacter = perRow.concat(
          Array(5 - perRow.length).fill({
            headImage: "https://pcredivewiki.tw/static/images/equipment/icon_equipment_999999.png",
          })
        );

        return rowCharacter.map(character =>
          GachaTemplate.line.genCharacterImage({ url: character.headImage })
        );
      });

      let rows = rawRows.map(row => GachaTemplate.line.genCharacterRow(row));

      return GachaTemplate.line.genCharacterBubble(type, rows);
    });
  };

  const ownBubbles = generateBubbles(ownCharacters, "已取得");
  const notOwnBubbles = generateBubbles(notOwnCharacters, "未取得");

  context.replyFlex("轉蛋背包", {
    type: "carousel",
    contents: [...ownBubbles, ...notOwnBubbles],
  });
}

module.exports = {
  /**
   * @param {Context} context
   * @param {import("bottender/dist/types").Props} param
   * @returns
   */
  play: async function (context, { match, pickup, ensure = false }) {
    recordSign("GachaPlay");
    try {
      let { tag, times } = match.groups;
      let { userId } = context.event.source;

      // 群組關閉轉蛋功能
      if (context.state.guildConfig.Gacha === "N") return;

      if (
        context.platform === "line" &&
        context.event.source.type === "group" &&
        (await isAble(context.event.source.userId, context.event.source.groupId)) === false
      )
        return;

      const gachaPool = await GachaModel.getDatabasePool();
      var filtPool = filterPool(gachaPool, tag);
      // 公主池
      let isPrincessPool = filtPool.findIndex(pool => pool.isPrincess == 0) === -1;
      // 每日轉蛋過了沒
      let hasDaily = await GachaModel.getSignin(userId);
      // 複合判斷
      let canDailyGacha = userId && !hasDaily && isPrincessPool;
      let OwnGodStone = 0;
      let costGodStone = 0;

      if (canDailyGacha) {
        OwnGodStone = await GachaModel.getUserGodStoneCount(userId);
      }

      if (canDailyGacha && pickup && OwnGodStone >= 1500) {
        // 如果使用消耗抽，扣除女神石並且機率提升，前提是女神石要有1500顆
        filtPool = makePickup(filtPool, 200);
        costGodStone = 1500;
        DefaultLogger.info(`${userId} 使用了消耗抽，扣除1500顆女神石，並且機率提升！`);
        await InventoryModel.deleteItem(userId, 999);
        await InventoryModel.insertItem(userId, 999, OwnGodStone - 1500);
      }

      times = (times || "10").length >= 3 ? 10 : parseInt(times);
      times = 10; // 暫定恆為10
      var rewards = [];
      var rareCount;

      do {
        rareCount = {};
        rewards = shuffle(play(filtPool, times));

        if (canDailyGacha && ensure === true && OwnGodStone >= 3000) {
          // 使用保證抽，扣除女神石並且將最後一抽強制轉彩，前提是女神石要有3000顆
          costGodStone = 3000;
          DefaultLogger.info(`${userId} 使用了保證抽，扣除3000顆女神石，並且將最後一抽強制轉彩！`);
          await InventoryModel.insertItem(userId, 999, 3000 * -1);
          const rainbowPool = getRainbowCharater(filtPool);
          rewards = [...slice(rewards, 0, 9), ...play(rainbowPool, 1)];
        }

        rewards.forEach(reward => {
          rareCount[reward.star] = rareCount[reward.star] || 0;
          rareCount[reward.star]++;
        });
        // 保底機制，全銀就重抽
      } while (rareCount[1] === 10);

      let DailyGachaInfo = false;
      if (canDailyGacha) {
        DailyGachaInfo = await recordToInventory(userId, rewards);
        DailyGachaInfo = {
          ...DailyGachaInfo,
          OwnGodStone,
          costGodStone,
        };

        // 戳個紀錄
        GachaModel.touchSingin(userId, JSON.stringify(rareCount));
      }

      // 沒扣女神石，卻使用消耗抽，提示用戶沒有扣也沒加倍
      if (canDailyGacha && costGodStone === 0 && pickup) {
        context.replyText("女神石不足！此次轉蛋機率不調升～");
      } else if (canDailyGacha && costGodStone === 0 && ensure) {
        context.replyText("女神石不足！無法進行保證抽！");
      }

      GachaTemplate.line.showGachaResult(
        context,
        {
          rewards,
          rareCount,
          tag,
        },
        DailyGachaInfo
      );

      if (canDailyGacha) {
        await handleSignin(userId);
        await EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId });
      }
    } catch (e) {
      console.log(e);
    }
  },

  showGachaBag,

  api: {
    showGachaPool: (req, res) => {
      GachaModel.getDatabasePool().then(pool => res.json(pool));
    },

    updateCharacter,
    insertCharacter,
    deleteCharacter,
    showGachaRank,
    showGodStoneRank,
  },
};

function trimParamter(rowData) {
  var objParam = {};

  Object.keys(rowData).forEach(key => {
    if (allowParameter.includes(key.toLocaleLowerCase())) {
      objParam[key] = rowData[key];
    }
  });

  return objParam;
}

async function updateCharacter(req, res) {
  const { id, data } = req.body;
  var result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    var objParam = trimParamter(data);

    await GachaModel.updateData(id, objParam);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function insertCharacter(req, res) {
  const data = req.body;
  var result = {};

  try {
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    var objParam = trimParamter(data);

    if (Object.keys(objParam).length < 5) throw new GachaException("Parameter Leak", 3);

    await GachaModel.insertNewData(objParam);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function deleteCharacter(req, res) {
  const { id } = req.params;
  var result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    await GachaModel.deleteData(id);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function recordToInventory(userId, rewards) {
  var ids = rewards.map(reward => reward.id);
  var uniqIds = [...new Set(ids)];

  const ownItems = await InventoryModel.fetchUserOwnItems(userId, uniqIds);

  var ownIds = ownItems.map(item => item.itemId);
  var insertIds = ids.filter(id => !ownIds.includes(id));
  insertIds = [...new Set(insertIds)];

  var oldIds = [...ids];
  insertIds.forEach(id => delete oldIds[oldIds.indexOf(id)]);
  oldIds = oldIds.filter(() => true);

  if (insertIds.length !== 0) {
    await InventoryModel.insertItems(insertIds.map(itemId => ({ userId, itemId, itemAmount: 1 })));
  }

  var godStoneArray = oldIds.map(id => {
    let reward = rewards.find(data => data.id === id);
    switch (reward.star) {
      case "1":
        return 1;
      case "2":
        return 10;
      case "3":
        return 50;
      default:
        return 1;
    }
  });

  var GodStoneAmount = 0;

  if (godStoneArray.length !== 0) {
    GodStoneAmount = godStoneArray.reduce((pre, curr) => pre + curr);
    await InventoryModel.insertItem(userId, 999, GodStoneAmount);
  }

  var [collectedCount, allCount] = await Promise.all([
    GachaModel.getUserCollectedCharacterCount(userId),
    GachaModel.getPrincessCharacterCount(),
  ]);

  let NewCharacters = insertIds.map(id => rewards.find(reward => reward.id === id));

  return {
    NewCharacters,
    GodStoneAmount,
    collectedCount,
    allCount,
  };
}

async function showGachaRank(req, res) {
  try {
    var { type } = req.params;
    var result = {};
    var rankDatas = await GachaModel.getCollectedRank({ type: parseInt(type) });

    result = rankDatas;
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function handleSignin(userId) {
  const userData = await signModel.find(userId);
  const now = moment();

  if (!userData) {
    return await signModel.create({ user_id: userId, last_signin_at: now.format() });
  }

  const latsSigninAt = moment(userData.last_signin_at);
  const updateData = { last_signin_at: now.format() };

  if (now.diff(latsSigninAt, "days") > 1) {
    updateData.sum_days = 1;
  } else {
    updateData.sum_days = userData.sum_days + 1;
  }

  await signModel.update(userId, updateData);
}

/**
 * 呼叫女神石排行 api
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function showGodStoneRank(req, res) {
  try {
    const rankData = await inventory.getGodStoneRank({ limit: 10 });
    const result = await Promise.all(
      rankData.map(async (data, index) => {
        // 將 userId 轉換成 userName
        const { userId } = data;
        const profile = await lineClient.getUserProfile(userId);
        const displayName = get(profile, "displayName", `未知${index + 1}`);

        return {
          ...data,
          displayName,
        };
      })
    );

    res.json(result);
  } catch (e) {
    DefaultLogger.warn(e);
    return res.status(400).json({ message: e.message });
  }
}
