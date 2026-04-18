const GachaModel = require("../../model/princess/gacha");
const InventoryModel = require("../../model/application/Inventory");
const { inventory } = InventoryModel;
const GachaTemplate = require("../../templates/princess/gacha");
const allowParameter = ["name", "headimage_url", "star", "rate", "is_princess", "tag"];
const redis = require("../../util/redis");
const { DefaultLogger, CustomLogger } = require("../../util/Logger");
const { getClient } = require("bottender");
const lineClient = getClient("line");
const moment = require("moment");
const { isNull, get, countBy, shuffle } = require("lodash");
const GachaRecord = require("../../model/princess/GachaRecord");
const GachaBanner = require("../../model/princess/GachaBanner");
const SubscribeUser = require("../../model/application/SubscribeUser");
const SubscribeCard = require("../../model/application/SubscribeCard");
const config = require("config");
const i18n = require("../../util/i18n");
const commonTemplate = require("../../templates/common");
const { notifyUnlocks } = require("../../service/achievementNotifier");
const GachaService = require("../../service/GachaService");
const { play, filterPool } = require("../../service/gachaDrawUtil");

function GachaException(message, code) {
  this.message = message;
  this.code = code;
  this.name = "Gacha";
}

GachaException.prototype = new Error();

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

  // Europe banner pre-check — service will re-fetch internally, but controller
  // needs the cost for the stone-balance gate and the early-return text.
  const allActiveBanners = await GachaBanner.getActiveBannersWithCharacters();
  const europeBanners = allActiveBanners.filter(b => b.type === "europe");

  let activeEuropeBanner = null;
  if (europe) {
    if (europeBanners.length === 0) {
      return context.replyText(i18n.__("message.gacha.cross_year_only"));
    }
    activeEuropeBanner = europeBanners[0];
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
  const europeCost =
    activeEuropeBanner && activeEuropeBanner.cost > 0
      ? activeEuropeBanner.cost
      : config.get("gacha.europe_cost");

  // 檢查是否有足夠的女神石
  if (pickup && userOwnStone < pickupCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  } else if (ensure && userOwnStone < ensureCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  } else if (europe && userOwnStone < europeCost) {
    return context.replyText(i18n.__("message.gacha.not_enough_stone"));
  }

  let result;
  try {
    result = await GachaService.runDailyDraw(userId, { tag, pickup, ensure, europe });
  } catch (err) {
    DefaultLogger.warn(`[gacha] runDailyDraw failed for ${userId}: ${err.message}`);
    console.log(err);
    return context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "gacha_daily: transaction error when insert data",
      })
    );
  }

  const bubbles = [];
  bubbles.push(
    GachaTemplate.line.generateGachaResult({
      rewards: result.rewards,
      tag,
      rareCount: result.rareCount,
      hasCooldown: type === "group",
    })
  );

  const allCharactersCount = await GachaModel.getPrincessCharacterCount();

  bubbles.unshift(
    GachaTemplate.line.generateDailyGachaInfo({
      newCharacters: result.newCharacters,
      collectedCount: result.ownCharactersCount + result.newCharacters.length,
      allCount: allCharactersCount,
      ownGodStone: userOwnStone,
      costGodStone: result.godStoneCost,
      gainGodStoneAmount: result.repeatReward,
    })
  );

  await notifyUnlocks(context, userId, result.unlocks);

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

function validateRate(value) {
  const rateValue = parseFloat(value);
  if (isNaN(rateValue) || rateValue < 0)
    throw new GachaException("rate must be a valid number >= 0", 5);
}

function sanitizeImageUrl(url) {
  if (!url) return url;
  const cleaned = url
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
  if (!cleaned.startsWith("https://")) {
    throw new GachaException("headimage_url must start with https://", 4);
  }
  return cleaned;
}

function applyImageUrlSanitize(objParam) {
  const urlKey = Object.keys(objParam).find(k => k.toLowerCase() === "headimage_url");
  if (urlKey && objParam[urlKey]) {
    objParam[urlKey] = sanitizeImageUrl(objParam[urlKey]);
  }
}

async function updateCharacter(req, res) {
  const { id, data } = req.body;
  let result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    let objParam = trimParamter(data);

    if (objParam.rate !== undefined) validateRate(objParam.rate);

    applyImageUrlSanitize(objParam);

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

    validateRate(objParam.rate);

    applyImageUrlSanitize(objParam);

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
