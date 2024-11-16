const GachaModel = require("../../model/princess/gacha");
const InventoryModel = require("../../model/application/Inventory");
const { inventory } = InventoryModel;
const random = require("math-random");
const GachaTemplate = require("../../templates/princess/gacha");
const allowParameter = ["name", "headimage_url", "star", "rate", "is_princess", "tag"];
const redis = require("../../util/redis");
const { DefaultLogger, CustomLogger } = require("../../util/Logger");
const { getClient } = require("bottender");
const lineClient = getClient("line");
const moment = require("moment");
const EventCenterService = require("../../service/EventCenterService");
const signModel = require("../../model/application/SigninDays");
const { isNull, get, countBy, shuffle, uniqBy, difference, sum, uniq, pullAt } = require("lodash");
const GachaRecord = require("../../model/princess/GachaRecord");
const SubscribeUser = require("../../model/application/SubscribeUser");
const SubscribeCard = require("../../model/application/SubscribeCard");
const config = require("config");
const i18n = require("../../util/i18n");
const commonTemplate = require("../../templates/common");

function GachaException(message, code) {
  this.message = message;
  this.code = code;
  this.name = "Gacha";
}

GachaException.prototype = new Error();

function getTotalRate(gachaPool) {
  let result = gachaPool
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

  let stack = 0; // 數字堆疊
  let anchor = 0; // 處理到的亂數陣列錨點
  const rewards = []; // 轉出獎勵陣列

  gachaPool.forEach(data => {
    if (anchor >= randomAry.length) return;
    let top = Math.floor(parseFloat(data.rate.replace(/[^\d.]+/, "") * rate));

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

  let isPrincess = true;
  let resultPool = gachaPool.filter(data => {
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
 * 針對群組單一用戶進行冷卻時間設定
 * @param {String} userId
 * @param {String} groupId
 */
async function isAble(userId, groupId) {
  const groupCooldown = config.get("gacha.group_cooldown");
  // 使用 setnx 限制群組單一用戶轉蛋次數
  let key = `GachaCoolDown_${userId}_${groupId}`;
  let result = await redis.set(key, 1, {
    EX: groupCooldown,
    NX: true,
  });

  return !isNull(result);
}

/**
 * 針對用戶進行冷卻時間設定，避免用戶快速轉蛋
 * @param {String} userId 用戶ID
 */
async function userCooldown(userId) {
  const userCooldown = config.get("gacha.user_cooldown");
  // 使用 setnx 限制用戶轉蛋次數
  let key = `GachaCoolDown_${userId}`;
  let result = await redis.set(key, 1, {
    EX: userCooldown,
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
 * @param {import("bottender").LineContext} context
 */
async function showGachaBag(context) {
  if (context.state.guildConfig.Gacha === "N") return;
  const bagUri = commonTemplate.getLiffUri("tall", "/Bag");
  const bubble = commonTemplate.genLinkBubble("轉蛋包包", bagUri, "blue");

  context.replyFlex("轉蛋包包", bubble);
}

/**
 * 進行模擬轉蛋
 * @param {import("bottender").LineContext} context
 * @param {import("bottender").Props} param1
 * @param {Boolean} param1.pickup
 * @param {Boolean} param1.ensure
 */
async function gacha(context, { match, pickup, ensure = false, europe = false }) {
  let { tag, times = 10 } = match.groups;
  const { userId, type, groupId } = context.event.source;
  const now = moment();
  const month = now.month() + 1;
  const date = now.date();
  const isEventTime = month === 11 && date >= 17 && date <= 22;

  // 只有 12/31~1/1 這兩天才會開放歐洲轉蛋池
  if (europe && !isEventTime) {
    return context.replyText(i18n.__("message.gacha.cross_year_only"));
  }

  if (type === "group" && context.state.guildConfig.Gacha === "N") {
    DefaultLogger.info(`${userId} 在群組 ${groupId} 嘗試進行轉蛋，但該群組已關閉轉蛋功能`);
    return;
  }

  // 檢查是否能進行轉蛋
  // 測試環境中，不進行冷卻時間檢查
  // 私聊狀態下，不進行冷卻時間檢查
  // 群組狀態下，進行冷卻時間檢查
  const isAbleGacha =
    process.env.NODE_ENV !== "production" ||
    (type !== "group" && (await userCooldown(userId))) ||
    (type === "group" && (await isAble(userId, groupId)));

  if (!isAbleGacha) {
    return;
  }

  const gachaPool = await GachaModel.getDatabasePool();
  const filteredPool = filterPool(gachaPool, tag);
  // 是否為公主池
  const isPrincessPool = filteredPool.findIndex(pool => pool.isPrincess == 0) === -1;
  // 暫時恆為 10 次
  times = 10;

  // 不包含每日一抽的普通模擬轉蛋
  const normalGacha = () => {
    const rewards = shuffle(play(filteredPool, times));
    const rareCount = countBy(rewards, "star");
    const bubble = GachaTemplate.line.generateGachaResult({
      rewards,
      tag,
      rareCount,
      hasCooldown: type === "group",
    });
    return context.replyFlex("轉蛋結果", bubble);
  };
  // 非公主轉蛋池，無法進行每日一抽，直接抽完並且發送結果
  if (!isPrincessPool) {
    return await normalGacha();
  }

  const isAbleDailyGacha = await detectCanDaily(userId, groupId);
  if (!isAbleDailyGacha) {
    return await normalGacha();
  }

  // 進行每日一抽
  // 需要檢查是否要花費女神石進行機率調升或是保證抽
  const userOwnStone = parseInt(await GachaModel.getUserGodStoneCount(userId));
  const pickupCost = config.get("gacha.pick_up_cost");
  const ensureCost = config.get("gacha.ensure_cost");
  const europeCost = config.get("gacha.europe_cost");

  // 檢查是否有足夠的女神石
  if (pickup && userOwnStone < pickupCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  } else if (ensure && userOwnStone < ensureCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  } else if (europe && userOwnStone < europeCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  }

  const queries = [];
  const dailyResult = {
    rewards: [],
    godStoneCost: 0,
    ownCharactersCount: 0,
    newCharacters: [],
    repeatReward: 0,
  };
  // const dailyPool = pickup ? makePickup(filteredPool, 200) : filteredPool;
  const dailyPool = (() => {
    if (pickup) {
      return makePickup(filteredPool, 200);
    } else if (ensure) {
      return filteredPool;
    } else if (europe) {
      return filteredPool.filter(data => data.star == "3");
    }
    return filteredPool;
  })();

  // 進行特殊費用扣除
  if (pickup || ensure || europe) {
    let cost = 0;
    let note = "";
    if (pickup) {
      cost = pickupCost;
      note = i18n.__("message.gacha.pick_up_cost_note");
    } else if (ensure) {
      cost = ensureCost;
      note = i18n.__("message.gacha.ensure_cost_note");
    } else if (europe) {
      cost = europeCost;
      note = i18n.__("message.gacha.europe_cost_note");
    }

    queries.push(
      inventory.knex.insert({
        userId,
        itemId: 999,
        itemAmount: -1 * cost,
        note,
      })
    );
    dailyResult.godStoneCost = cost;
  }

  let rareCount;
  do {
    const rewards = shuffle(play(dailyPool, times));

    if (ensure) {
      DefaultLogger.info(`${userId} 使用了保證抽，扣除3000顆女神石，並且將最後一抽強制轉彩！`);
      const rainbowPool = getRainbowCharater(dailyPool);
      // remove last element of rewards
      rewards.pop();
      // add rainbow character
      rewards.push(...play(rainbowPool, 1));
    }

    rareCount = countBy(rewards, "star");
    dailyResult.rewards = rewards;
  } while (rareCount[1] === 10);

  // 每日一抽成功，紀錄轉蛋資訊
  const message = [];
  const uniqRewards = uniqBy(dailyResult.rewards, "id");
  const rawRewardIds = dailyResult.rewards.map(reward => reward.id);
  const rewardIds = uniq(rawRewardIds);
  const ownItems = await inventory.knex
    .where({ userId })
    .select("itemId")
    .andWhereNot("itemId", 999)
    .orderBy("itemId", "asc");
  const ownItemIds = ownItems.map(item => item.itemId);

  dailyResult.ownCharactersCount = ownItemIds.length;
  // 檢查是否有重複獲得的角色
  const duplicateItems = [...rawRewardIds];
  // 檢查是否有尚未獲得的角色
  const newItemIds = difference(rewardIds, ownItemIds);
  pullAt(
    duplicateItems,
    newItemIds.map(id => duplicateItems.indexOf(id))
  );

  dailyResult.repeatReward = sum(
    duplicateItems.map(id => {
      const targetReward = uniqRewards.find(reward => reward.id === id);

      switch (parseInt(targetReward.star)) {
        case 1:
          message.push(`${targetReward.name} 1星 +1`);
          return config.get("gacha.silver_repeat_reward");
        case 2:
          message.push(`${targetReward.name} 2星 +10`);
          return config.get("gacha.gold_repeat_reward");
        case 3:
          message.push(`${targetReward.name} 3星 +50`);
          return config.get("gacha.rainbow_repeat_reward");
        default:
          return 0;
      }
    })
  );
  dailyResult.newCharacters = uniqRewards.filter(reward => newItemIds.includes(reward.id));

  // 紀錄每日一抽獲得的角色
  if (dailyResult.newCharacters.length > 0) {
    queries.push(
      inventory.knex.insert(
        dailyResult.newCharacters.map(character => ({
          userId,
          itemId: character.id,
          itemAmount: 1,
          attributes: JSON.stringify([
            {
              key: "star",
              value: parseInt(character.star),
            },
          ]),
          note: i18n.__("message.gacha.new_character_note"),
        }))
      )
    );
  }

  // 紀錄每日一抽獲得的女神石
  if (dailyResult.repeatReward > 0) {
    queries.push(
      inventory.knex.insert({
        userId,
        itemId: 999,
        itemAmount: dailyResult.repeatReward,
        note: i18n.__("message.gacha.repeat_reward_note"),
      })
    );
  }

  // 寫入所有紀錄
  const trx = await inventory.transaction();
  try {
    await Promise.all(queries.map(query => query.transacting(trx)));
    GachaRecord.setTransaction(trx);
    await GachaRecord.create({
      user_id: userId,
      silver: rareCount[1],
      gold: rareCount[2],
      rainbow: rareCount[3],
      has_new: dailyResult.newCharacters.length > 0 ? 1 : 0,
    });
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    console.log(err);
    return context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "gacha_daily: transaction error when insert data",
      })
    );
  }

  await Promise.all([
    handleSignin(userId),
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId }),
  ]);

  const bubbles = [];
  // 發送每日一抽結果
  bubbles.push(
    GachaTemplate.line.generateGachaResult({
      rewards: dailyResult.rewards,
      tag,
      rareCount,
      hasCooldown: type === "group",
    })
  );

  const allCharactersCount = await GachaModel.getPrincessCharacterCount();

  bubbles.unshift(
    GachaTemplate.line.generateDailyGachaInfo({
      newCharacters: dailyResult.newCharacters,
      collectedCount: dailyResult.ownCharactersCount + dailyResult.newCharacters.length,
      allCount: allCharactersCount,
      ownGodStone: userOwnStone,
      costGodStone: dailyResult.godStoneCost,
      gainGodStoneAmount: dailyResult.repeatReward,
    })
  );

  return context.replyFlex("每日一抽結果", {
    type: "carousel",
    contents: bubbles,
  });
}

/**
 * 檢查是否可以進行每日轉蛋
 * @param {String} userId
 * @returns {Promise<Boolean>}
 */
async function detectCanDaily(userId) {
  const now = moment();
  const key = `daily_gacha_${userId}_${now.format("MMDD")}`;
  const content = await redis.get(key);
  const dailyLimit = config.get("gacha.daily_limit");

  if (!isNull(content)) {
    // redis 中有資料，表示今日已經抽過了
    return false;
  }

  // redis 中沒有資料，表示今日還沒抽過
  // 檢查是否有超過每日抽卡上限
  const record = await GachaRecord.knex
    .where({ user_id: userId })
    .whereBetween("created_at", [now.startOf("day").toDate(), now.endOf("day").toDate()])
    .count({ count: "*" })
    .first();

  // 轉蛋次數
  const usedCount = get(record, "count", 0);
  const subscribeUser = await SubscribeUser.all({
    filter: {
      user_id: userId,
    },
  }).join(
    SubscribeCard.table,
    SubscribeCard.getColumnName("key"),
    SubscribeUser.getColumnName("subscribe_card_key")
  );

  if (subscribeUser.length === 0) {
    // 無訂閱用戶，不管有無超過，都幫其設定一個 cache
    // 以免每次都要去資料庫檢查
    // 此次的回傳便可以讓呼叫端知道是否超過
    await redis.set(key, "1", {
      EX: 60,
    });

    return usedCount < dailyLimit;
  }

  // 計算訂閱用戶的轉蛋次數
  const bonusCount = subscribeUser.reduce((acc, data) => {
    const { effects } = data;
    const gachaEffect = effects.find(effect => effect.type === "gacha_times");
    const effectCount = get(gachaEffect, "value", 0);
    return acc + effectCount;
  }, dailyLimit);

  CustomLogger.info(`detectCanDaily: ${userId} useCount: ${usedCount} bonusCount: ${bonusCount}`);

  if (usedCount >= bonusCount) {
    // 超過每日限制，設定 cache 1 天
    await redis.set(key, "1", {
      EX: 60,
    });
    return false;
  }

  return true;
}

async function purgeDailyGachaCache(userId) {
  const now = moment();
  const key = `daily_gacha_${userId}_${now.format("MMDD")}`;
  await redis.del(key);
}

exports.play = gacha;
exports.showGachaBag = showGachaBag;
exports.purgeDailyGachaCache = purgeDailyGachaCache;

exports.api = {};

exports.api.showGachaPool = (req, res) => {
  GachaModel.getDatabasePool().then(pool => res.json(pool));
};

exports.api.updateCharacter = updateCharacter;
exports.api.insertCharacter = insertCharacter;
exports.api.deleteCharacter = deleteCharacter;
exports.api.showGachaRank = showGachaRank;
exports.api.showGodStoneRank = showGodStoneRank;

function trimParamter(rowData) {
  let objParam = {};

  Object.keys(rowData).forEach(key => {
    if (allowParameter.includes(key.toLocaleLowerCase())) {
      objParam[key] = rowData[key];
    }
  });

  return objParam;
}

async function updateCharacter(req, res) {
  const { id, data } = req.body;
  let result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    let objParam = trimParamter(data);

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
  let result = {};

  try {
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    let objParam = trimParamter(data);

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
  let result = {};

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

async function showGachaRank(req, res) {
  try {
    let { type } = req.params;
    let rankDatas = await GachaModel.getCollectedRank({ type: parseInt(type) });

    res.json(rankDatas);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400).json({ message: e.message });
  }
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

async function handleSignin(userId) {
  const userData = await signModel.first({ filter: { user_id: userId } });
  const now = moment();

  if (!userData) {
    return await signModel.create({ user_id: userId, last_signin_at: now.toDate() });
  }

  const latsSigninAt = moment(userData.last_signin_at);
  const updateData = { last_signin_at: now.toDate() };

  if (now.isSame(latsSigninAt, "day")) {
    // 今天已簽到
    return;
  } else if (now.diff(latsSigninAt, "days") > 1) {
    updateData.sum_days = 1;
  } else {
    updateData.sum_days = userData.sum_days + 1;
  }

  await signModel.update(userId, updateData, { pk: "user_id" });
}
