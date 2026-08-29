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
const { play, filterPool, summarizePool, fmtRate } = require("../../service/gachaDrawUtil");
const { time } = require("../../middleware/timing");

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
  const bubble = commonTemplate.genActionBubble({
    icon: "🎁",
    title: "轉蛋包包",
    subtitle: "管理你的抽卡紀錄",
    url: bagUri,
    theme: "indigo",
    cta: "開啟包包",
  });

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
  const allActiveBanners = await time("gacha.banners", () =>
    GachaBanner.getActiveBannersWithCharacters()
  );
  const europeBanners = allActiveBanners.filter(b => b.type === "europe");
  const rateUpBanners = allActiveBanners.filter(b => b.type === "rate_up");

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

  const gachaPool = await time("gacha.pool", () => GachaModel.getDatabasePool());
  const filteredPool = filterPool(gachaPool, tag);
  // 是否為公主池
  const isPrincessPool = filteredPool.findIndex(pool => pool.isPrincess == 0) === -1;
  // 暫時恆為 10 次
  times = 10;

  // 不包含每日一抽的普通模擬轉蛋
  const normalGacha = () => {
    const rewards = shuffle(play(filteredPool, times));
    const rareCount = countBy(rewards, "star");
    if (process.env.GACHA_DEBUG_LOG === "1") {
      const summary = summarizePool(filteredPool);
      const bannerIdSet = new Set(rateUpBanners.flatMap(b => b.characterIds || []));
      const bannerHits = rewards.filter(r => bannerIdSet.has(r.id)).length;
      const expectedRainbowPer10 =
        summary.total > 0 ? fmtRate((summary.byStar[3] / summary.total) * times) : 0;
      DefaultLogger.info(
        `[gacha-normal] user=${userId} tag=${tag || "default"} ` +
          `banners=${rateUpBanners.length} bannerCharacters=${bannerIdSet.size} ` +
          `note=banner-rate-up-not-applied ` +
          `pool={"entries":${summary.entries},"total":${fmtRate(summary.total)},` +
          `"star1":${fmtRate(summary.byStar[1])},"star2":${fmtRate(summary.byStar[2])},"star3":${fmtRate(summary.byStar[3])}} ` +
          `silver=${rareCount[1] || 0} gold=${rareCount[2] || 0} rainbow=${rareCount[3] || 0} ` +
          `bannerHits=${bannerHits} expectedRainbowPer10=${expectedRainbowPer10}`
      );
    }
    const bubble = GachaTemplate.line.generateGachaResult({
      rewards,
      tag,
      rareCount,
      hasCooldown: type === "group",
    });
    return time("gacha.reply.normal", () => context.replyFlex("轉蛋結果", bubble));
  };
  // 非公主轉蛋池，無法進行每日一抽，直接抽完並且發送結果
  if (!isPrincessPool) {
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

  const dailyClaimKey = await detectCanDaily(userId);
  if (!dailyClaimKey) {
    return await normalGacha();
  }

  let result;
  try {
    result = await time("gacha.runDaily", () =>
      GachaService.runDailyDraw(userId, { tag, pickup, ensure, europe })
    );
  } catch (err) {
    // 交易失敗時釋放 claim，讓回滾後的每日額度可以重試；程序崩潰則等 TTL 自動釋放。
    if (dailyClaimKey !== true) {
      await redis.del(dailyClaimKey);
      await redis.del(`daily_gacha_${userId}_${moment().format("MMDD")}`);
    }
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

  const allCharactersCount = await time("gacha.allChars", () =>
    GachaModel.getPrincessCharacterCount()
  );

  bubbles.unshift(
    GachaTemplate.line.generateDailyGachaInfo({
      newCharacters: result.newCharacters,
      collectedCount: result.ownCharactersCount + result.newCharacters.length,
      allCount: allCharactersCount,
      costGodStone: result.godStoneCost,
      fragmentRewards: result.fragmentRewards,
    })
  );

  await time("gacha.notify", () => notifyUnlocks(context, userId, result.unlocks));

  return time("gacha.reply.daily", () =>
    context.replyFlex("每日一抽結果", {
      type: "carousel",
      contents: bubbles,
    })
  );
}

/**
 * 檢查是否可以進行每日轉蛋。
 * 成功時回傳搶佔到的 redis claim key（呼叫端在抽卡失敗時需釋放），
 * 額度用盡時回傳 false；測試環境直接回傳 true。
 * @param {String} userId
 * @returns {Promise<String|Boolean>}
 */
async function detectCanDaily(userId) {
  if (process.env.NODE_ENV !== "production") return true;

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
    .whereBetween("created_at", [
      now.clone().startOf("day").toDate(),
      now.clone().endOf("day").toDate(),
    ])
    .count({ count: "*" })
    .first();

  // 轉蛋次數
  const usedCount = Number(get(record, "count", 0));
  // 注意：這裡必須傳 Date 而非 Moment。mysql2 不認得 Moment 物件，
  // 會序列化成 "Mon Aug 03 2026 ..." 而讓 MySQL 丟 ER_WRONG_VALUE。
  const nowDate = now.toDate();
  // 直接用 query builder，不走 base.all() 的 filter：後者以 lodash get(filter, `${key}.operator`)
  // 取運算子，key 帶了 "table.column" 的點號時會被當成路徑解析而找不到 operator，
  // 於是整個 {operator, value} 物件被當成值丟給 knex（ERR_ASSERTION）。
  // 這裡有 join，欄位必須帶表名，所以改用明確的 where 三參數形式。
  const subscribeUser = await SubscribeUser.knex
    .where(SubscribeUser.getColumnName("user_id"), userId)
    .andWhere(SubscribeUser.getColumnName("start_at"), "<=", nowDate)
    .andWhere(SubscribeUser.getColumnName("end_at"), ">", nowDate)
    .join(
      SubscribeCard.table,
      SubscribeCard.getColumnName("key"),
      SubscribeUser.getColumnName("subscribe_card_key")
    );

  const activeSubs = subscribeUser;
  const bonusCount = activeSubs.reduce((acc, data) => {
    const effects = Array.isArray(data.effects)
      ? data.effects
      : typeof data.effects === "string"
        ? JSON.parse(data.effects || "[]")
        : [];
    const gachaEffect = effects.find(effect => effect && effect.type === "gacha_times");
    return acc + get(gachaEffect, "value", 0);
  }, dailyLimit);

  CustomLogger.debug(`detectCanDaily: ${userId} useCount: ${usedCount} bonusCount: ${bonusCount}`);

  if (usedCount >= bonusCount) {
    // 超過每日限制，cache 到今天結束；cache 只作負快取，DB count 仍是權威。
    const ttl = Math.max(60, moment().endOf("day").diff(moment(), "seconds"));
    await redis.set(key, "1", {
      EX: ttl,
    });
    return false;
  }

  // 每個 DB usedCount 對應一個 slot；Redis 遺失時仍會重新從 DB count 對齊，不會多發額度。
  const claimKey = `daily_gacha_claim_${userId}_${now.format("MMDD")}_${usedCount}`;
  const ttl = Math.max(60, moment().endOf("day").diff(moment(), "seconds"));
  const claimed = await redis.set(claimKey, "1", {
    EX: ttl,
    NX: true,
  });
  if (isNull(claimed)) return false;

  if (activeSubs.length === 0) {
    // 無訂閱用戶只有一個每日額度，成功 claim 後以負快取避免重查資料庫。
    await redis.set(key, "1", { EX: ttl });
  }
  return claimKey;
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
