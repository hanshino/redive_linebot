const moment = require("moment");
const config = require("config");
const { countBy, shuffle, uniqBy, difference, sum, uniq, pullAt } = require("lodash");

const GachaModel = require("../model/princess/gacha");
const InventoryModel = require("../model/application/Inventory");
const { inventory } = InventoryModel;
const GachaRecord = require("../model/princess/GachaRecord");
const GachaRecordDetail = require("../model/princess/GachaRecordDetail");
const GachaBanner = require("../model/princess/GachaBanner");
const signModel = require("../model/application/SigninDays");
const SubscribeUser = require("../model/application/SubscribeUser");
const SubscribeCard = require("../model/application/SubscribeCard");

const EventCenterService = require("./EventCenterService");
const AchievementEngine = require("./AchievementEngine");
const {
  play,
  filterPool,
  getRainbowCharater,
  makePickup,
  applyBannerRateUp,
} = require("./gachaDrawUtil");
const i18n = require("../util/i18n");
const { DefaultLogger } = require("../util/Logger");

async function handleSignin(userId) {
  const userData = await signModel.first({ filter: { user_id: userId } });
  const now = moment();

  if (!userData) {
    return await signModel.create({ user_id: userId, last_signin_at: now.toDate() });
  }

  const latsSigninAt = moment(userData.last_signin_at);
  const updateData = { last_signin_at: now.toDate() };

  if (now.isSame(latsSigninAt, "day")) {
    return;
  } else if (now.diff(latsSigninAt, "days") > 1) {
    updateData.sum_days = 1;
  } else {
    updateData.sum_days = userData.sum_days + 1;
  }

  await signModel.update(userId, updateData, { pk: "user_id" });
}

function resolveCost(pickup, ensure, europe, activeEuropeBanner) {
  if (pickup) {
    return {
      amount: config.get("gacha.pick_up_cost"),
      note: i18n.__("message.gacha.pick_up_cost_note"),
    };
  }
  if (ensure) {
    return {
      amount: config.get("gacha.ensure_cost"),
      note: i18n.__("message.gacha.ensure_cost_note"),
    };
  }
  if (europe) {
    const amount =
      activeEuropeBanner && activeEuropeBanner.cost > 0
        ? activeEuropeBanner.cost
        : config.get("gacha.europe_cost");
    return { amount, note: i18n.__("message.gacha.europe_cost_note") };
  }
  return { amount: 0, note: "" };
}

function buildDailyPool(filteredPool, rateUpBanners, { pickup, ensure, europe }) {
  let pool = filteredPool;
  for (const banner of rateUpBanners) {
    if (banner.characterIds.length > 0) {
      pool = applyBannerRateUp(pool, banner.characterIds, banner.rate_boost);
    }
  }
  if (pickup) return makePickup(pool, 200);
  if (ensure) return pool;
  if (europe) return pool.filter(data => data.star == "3");
  return pool;
}

function drawRewards(dailyPool, times, { userId, ensure }) {
  let rareCount;
  let rewards;
  do {
    rewards = shuffle(play(dailyPool, times));
    if (ensure) {
      DefaultLogger.info(`${userId} 使用了保證抽，扣除3000顆女神石，並且將最後一抽強制轉彩！`);
      const rainbowPool = getRainbowCharater(dailyPool);
      rewards.pop();
      rewards.push(...play(rainbowPool, 1));
    }
    rareCount = countBy(rewards, "star");
  } while (rareCount[1] === 10);
  return { rewards, rareCount };
}

function computeRepeatReward(uniqRewards, duplicateItems) {
  return sum(
    duplicateItems.map(id => {
      const target = uniqRewards.find(r => r.id === id);
      switch (parseInt(target.star)) {
        case 1:
          return config.get("gacha.silver_repeat_reward");
        case 2:
          return config.get("gacha.gold_repeat_reward");
        case 3:
          return config.get("gacha.rainbow_repeat_reward");
        default:
          return 0;
      }
    })
  );
}

/**
 * 執行每日一抽的完整流水線（資料層，不涉及任何 Bottender context / reply 動作）。
 * Caller（controller 或 cron）負責：pre-flight（detectCanDaily、cooldown、訂閱效果）、
 * 成功後的回覆 flex 訊息、以及 notifyUnlocks。Service 只回傳原始資料 + unlocks。
 *
 * @param {string} userId LINE User ID
 * @param {Object} [opts]
 * @param {string} [opts.tag]       轉蛋池標籤（undefined 即為預設公主池）
 * @param {boolean} [opts.pickup]   祈願（花費女神石提升彩率）
 * @param {boolean} [opts.ensure]   保證（最後一抽必彩）
 * @param {boolean} [opts.europe]   歐洲（只彩池）
 * @returns {Promise<{
 *   rewards: Array,
 *   rareCount: Object,
 *   newCharacters: Array,
 *   ownCharactersCount: number,
 *   repeatReward: number,
 *   godStoneCost: number,
 *   unlocks: Array
 * }>}
 */
async function runDailyDraw(userId, opts = {}) {
  const { tag, pickup = false, ensure = false, europe = false } = opts;
  const times = 10;

  const allActiveBanners = await GachaBanner.getActiveBannersWithCharacters();
  const rateUpBanners = allActiveBanners.filter(b => b.type === "rate_up");
  const europeBanners = allActiveBanners.filter(b => b.type === "europe");
  const activeEuropeBanner = europe && europeBanners.length > 0 ? europeBanners[0] : null;

  const gachaPool = await GachaModel.getDatabasePool();
  const filteredPool = filterPool(gachaPool, tag);
  const dailyPool = buildDailyPool(filteredPool, rateUpBanners, { pickup, ensure, europe });

  const cost = resolveCost(pickup, ensure, europe, activeEuropeBanner);

  const { rewards, rareCount } = drawRewards(dailyPool, times, { userId, ensure });

  const uniqRewards = uniqBy(rewards, "id");
  const rawRewardIds = rewards.map(r => r.id);
  const rewardIds = uniq(rawRewardIds);

  const ownItems = await inventory.knex
    .where({ userId })
    .select("itemId")
    .andWhereNot("itemId", 999)
    .orderBy("itemId", "asc");
  const ownItemIds = ownItems.map(item => item.itemId);
  const ownCharactersCount = ownItemIds.length;

  const duplicateItems = [...rawRewardIds];
  const newItemIds = difference(rewardIds, ownItemIds);
  pullAt(
    duplicateItems,
    newItemIds.map(id => duplicateItems.indexOf(id))
  );

  const repeatReward = computeRepeatReward(uniqRewards, duplicateItems);
  const newCharacters = uniqRewards.filter(r => newItemIds.includes(r.id));

  const trx = await inventory.transaction();
  let gachaRecordId;
  try {
    if (cost.amount > 0) {
      await trx(inventory.table).insert({
        userId,
        itemId: 999,
        itemAmount: -1 * cost.amount,
        note: cost.note,
      });
    }

    if (newCharacters.length > 0) {
      await trx(inventory.table).insert(
        newCharacters.map(character => ({
          userId,
          itemId: character.id,
          itemAmount: 1,
          attributes: JSON.stringify([{ key: "star", value: parseInt(character.star) }]),
          note: i18n.__("message.gacha.new_character_note"),
        }))
      );
    }

    if (repeatReward > 0) {
      await trx(inventory.table).insert({
        userId,
        itemId: 999,
        itemAmount: repeatReward,
        note: i18n.__("message.gacha.repeat_reward_note"),
      });
    }

    const [insertedId] = await trx(GachaRecord.table).insert({
      user_id: userId,
      silver: rareCount[1] || 0,
      gold: rareCount[2] || 0,
      rainbow: rareCount[3] || 0,
      has_new: newCharacters.length > 0 ? 1 : 0,
    });
    gachaRecordId = insertedId;

    if (rewards.length > 0 && gachaRecordId) {
      const newIdSet = new Set(newCharacters.map(c => c.id));
      await trx(GachaRecordDetail.table).insert(
        rewards.map(r => ({
          gacha_record_id: gachaRecordId,
          user_id: userId,
          character_id: r.id,
          star: parseInt(r.star),
          is_new: newIdSet.has(r.id) ? 1 : 0,
        }))
      );
    }

    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }

  await Promise.all([
    handleSignin(userId),
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId }),
  ]);

  const { unlocked } = await AchievementEngine.evaluate(userId, "gacha_pull", {
    threeStarCount: rareCount[3] || 0,
    uniqueCount: ownCharactersCount + newCharacters.length,
    pullType: europe ? "europe" : ensure ? "ensure" : pickup ? "pickup" : undefined,
  }).catch(err => {
    DefaultLogger.warn(
      `GachaService.runDailyDraw achievement.evaluate failed user=${userId}: ${err && err.message}`
    );
    return { unlocked: [] };
  });

  return {
    rewards,
    rareCount,
    newCharacters,
    ownCharactersCount,
    repeatReward,
    godStoneCost: cost.amount,
    unlocks: unlocked || [],
  };
}

/**
 * 回傳使用者今日的每日抽卡配額狀態。邏輯對齊 controller 內的 detectCanDaily：
 * 基礎額度 = config.gacha.daily_limit，每張有效訂閱卡額外加上其 gacha_times effect。
 * @param {string} userId
 * @returns {Promise<{total:number, used:number, remaining:number}>}
 */
async function getRemainingDailyQuota(userId) {
  const base = config.get("gacha.daily_limit");
  const now = moment();

  const subs = await SubscribeUser.all({ filter: { user_id: userId } }).join(
    SubscribeCard.table,
    SubscribeCard.getColumnName("key"),
    SubscribeUser.getColumnName("subscribe_card_key")
  );
  const activeSubs = subs.filter(
    s => moment(s.start_at).isSameOrBefore(now) && moment(s.end_at).isAfter(now)
  );

  const bonus = activeSubs.reduce((acc, sub) => {
    const effects = Array.isArray(sub.effects)
      ? sub.effects
      : typeof sub.effects === "string"
        ? JSON.parse(sub.effects || "[]")
        : [];
    const eff = effects.find(e => e && e.type === "gacha_times");
    return acc + (eff && eff.value ? eff.value : 0);
  }, 0);
  const total = base + bonus;

  const countRow = await GachaRecord.knex
    .where({ user_id: userId })
    .whereBetween("created_at", [now.startOf("day").toDate(), now.endOf("day").toDate()])
    .count({ count: "*" })
    .first();
  const used = Number((countRow && countRow.count) || 0);

  return { total, used, remaining: Math.max(0, total - used) };
}

module.exports = {
  runDailyDraw,
  getRemainingDailyQuota,
  resolveCost,
};
