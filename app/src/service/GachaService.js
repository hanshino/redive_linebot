const moment = require("moment");
const config = require("config");
const { countBy, shuffle, uniqBy, difference, uniq, pullAt } = require("lodash");

const GachaModel = require("../model/princess/gacha");
const InventoryModel = require("../model/application/Inventory");
const mysql = require("../util/mysql");
const { inventory } = InventoryModel;
const GachaRecord = require("../model/princess/GachaRecord");
const GachaRecordDetail = require("../model/princess/GachaRecordDetail");
const GachaBanner = require("../model/princess/GachaBanner");
const CharacterFragment = require("../model/princess/CharacterFragment");
const SubscribeUser = require("../model/application/SubscribeUser");
const SubscribeCard = require("../model/application/SubscribeCard");

const EventCenterService = require("./EventCenterService");
const SigninService = require("./SigninService");
const AchievementEngine = require("./AchievementEngine");
const {
  play,
  filterPool,
  getRainbowCharater,
  makePickup,
  applyBannerRateUp,
  summarizePool,
  parseRate,
  fmtRate,
} = require("./gachaDrawUtil");
const i18n = require("../util/i18n");
const { DefaultLogger } = require("../util/Logger");
const { time } = require("../middleware/timing");

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

// 「十抽全 1★ 就重抽一次」這個保底的重抽上限。
//
// 原本是無界的 `while (rareCount[1] === 10)`：只要當前池抽不出非 1★，這個條件恆真，
// 迴圈就同步佔住 event loop —— 不是變慢，是整個 bot 停止回應。
// 這種池是一筆資料就能造出來的：gachaDrawUtil.filterPool 在 tag 命中且 isPrincess='0'
// 時走 `return resultPool`，不會像公主池那樣補進其他星級，所以某個 tag 只對到
// 一批非公主的 1★ 角色時，該 tag 的抽卡就會掛死。
//
// 20 的依據（正式池 is_Princess=1 實測權重：1★ 81.433 / 總權重 394.383）：
//   單抽中 1★ 的機率 0.2065 ⇒ 十抽全 1★ 的機率 1.4e-7
//   ⇒ 連續 20 次都全 1★ 是 (1.4e-7)^20 ≈ 1e-138
// 實測 20 萬次十抽，正式池權重下 attempts 從未超過 1，星級分布與原本無界版本
// 相差 < 0.06pp（純隨機雜訊）。要讓這個上限「被看見」，1★ 得吃掉池子九成五以上的
// 權重（1★ 95% 時 P(回傳仍全 1★) 才 3.5e-5；99% 時 0.134）—— 那已經不是設定失誤
// 而是刻意造一個抽不到好東西的池，屆時上限生效反而比掛死正確。
const MAX_PITY_REDRAWS = 20;

function drawRewards(dailyPool, times, { userId, ensure }) {
  let rareCount;
  let rewards;
  let attempts = 0;
  do {
    rewards = shuffle(play(dailyPool, times));
    if (ensure) {
      DefaultLogger.info(`${userId} 使用了保證抽，扣除3000顆女神石，並且將最後一抽強制轉彩！`);
      const rainbowPool = getRainbowCharater(dailyPool);
      rewards.pop();
      rewards.push(...play(rainbowPool, 1));
    }
    rareCount = countBy(rewards, "star");
    attempts++;
    // 條件用 times 而不是寫死的 10：原本的 `=== 10` 在 times !== 10 時永遠不成立，
    // 保底根本不會觸發。目前 times 恆為 10，所以這個修正對現行行為沒有影響。
  } while (rareCount[1] === times && attempts < MAX_PITY_REDRAWS);

  // 用盡上限仍全 1★ ⇒ 直接採用最後一次的結果。
  // 刻意不是「取這幾次裡最好的一次」—— 那會把分布往上偏，等於偷偷加強保底；
  // 保底的語意是「再抽一次試試」而不是「保證不全 1★」，留最後一次才是池子的誠實樣本。
  if (rareCount[1] === times) {
    DefaultLogger.warn(
      `[gacha] 保底重抽 ${attempts} 次仍為全 1★，採用最後一次結果 —— ` +
        `當前池可能抽不出非 1★（entries=${dailyPool.length}）`
    );
  }

  return { rewards, rareCount };
}

const FRAGMENT_BY_STAR = {
  1: "gacha.silver_repeat_reward",
  2: "gacha.gold_repeat_reward",
  3: "gacha.rainbow_repeat_reward",
};

/**
 * 把重複角色換算成「角色專屬碎片」。數量規則沿用既有的 *_repeat_reward config
 * （1/10/50）—— 產品刻意讓碎片數等於原本的女神石數，所以不另開一組 config。
 *
 * 同一角色在同次抽卡重複多張時彙總成單一 amount：碎片是餘額而不是流水，
 * 一角色一筆 upsert 才不會對同一列打多次相同的 UPDATE。
 *
 * @param {Array} uniqRewards 本次抽到的角色（已去重），需含 id / name / star
 * @param {Array<Number>} duplicateItems 重複的角色 id，每張一個元素
 * @returns {Array<{itemId:Number, name:String, amount:Number}>} amount 由多至少
 */
function computeFragmentRewards(uniqRewards, duplicateItems) {
  const byItemId = new Map();

  for (const id of duplicateItems) {
    const target = uniqRewards.find(r => r.id === id);
    const configKey = FRAGMENT_BY_STAR[parseInt(target.star)];
    if (!configKey) continue;

    const amount = config.get(configKey);
    const entry = byItemId.get(id);
    if (entry) entry.amount += amount;
    else byItemId.set(id, { itemId: id, name: target.name, amount });
  }

  return [...byItemId.values()].sort((a, b) => b.amount - a.amount || a.itemId - b.itemId);
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
 *   fragmentRewards: Array<{itemId:number, name:string, amount:number}>,
 *   godStoneCost: number,
 *   unlocks: Array
 * }>}
 */
async function runDailyDraw(userId, opts = {}) {
  const { tag, pickup = false, ensure = false, europe = false } = opts;
  const times = 10;

  // banners and the gacha pool are independent reads — fetch them concurrently
  // to save one DB round-trip on the hot daily-draw path.
  const [allActiveBanners, gachaPool] = await Promise.all([
    time("rd.banners", () => GachaBanner.getActiveBannersWithCharacters()),
    time("rd.pool", () => GachaModel.getDatabasePool()),
  ]);
  const rateUpBanners = allActiveBanners.filter(b => b.type === "rate_up");
  const europeBanners = allActiveBanners.filter(b => b.type === "europe");
  const activeEuropeBanner = europe && europeBanners.length > 0 ? europeBanners[0] : null;

  const filteredPool = filterPool(gachaPool, tag);
  const dailyPool = buildDailyPool(filteredPool, rateUpBanners, { pickup, ensure, europe });

  const cost = resolveCost(pickup, ensure, europe, activeEuropeBanner);

  const debugEnabled = process.env.GACHA_DEBUG_LOG === "1";
  let debugCtx = null;
  if (debugEnabled) {
    const mode = europe ? "europe" : ensure ? "ensure" : pickup ? "pickup" : "daily";
    const bannerIdSet = new Set(rateUpBanners.flatMap(b => b.characterIds || []));
    const prePool = summarizePool(filteredPool);
    const postPool = summarizePool(dailyPool);
    const bannerMeta = rateUpBanners.map(b => ({
      id: b.id,
      name: b.name,
      rate_boost: b.rate_boost,
      characters: (b.characterIds || []).length,
    }));
    // 在 sum-of-rate 權重池下，per-pull 命中機率 = rate / total，
    // 因此 10 抽期望命中次數（不是百分比）= 10 × rate / total。
    const expectedRainbowPer10 =
      postPool.total > 0 ? fmtRate((postPool.byStar[3] / postPool.total) * times) : 0;
    DefaultLogger.info(
      `[gacha-draw] user=${userId} tag=${tag || "default"} mode=${mode} cost=${cost.amount} ` +
        `banners=${rateUpBanners.length} bannerCharacters=${bannerIdSet.size} ` +
        `bannerMeta=${JSON.stringify(bannerMeta)} ` +
        `pre={"entries":${prePool.entries},"total":${fmtRate(prePool.total)},` +
        `"star1":${fmtRate(prePool.byStar[1])},"star2":${fmtRate(prePool.byStar[2])},"star3":${fmtRate(prePool.byStar[3])}} ` +
        `post={"entries":${postPool.entries},"total":${fmtRate(postPool.total)},` +
        `"star1":${fmtRate(postPool.byStar[1])},"star2":${fmtRate(postPool.byStar[2])},"star3":${fmtRate(postPool.byStar[3])}} ` +
        `expectedRainbowPer10=${expectedRainbowPer10}`
    );

    if (rateUpBanners.length > 0 && postPool.total > 0) {
      const preMap = new Map(filteredPool.map(d => [d.id, d]));
      const postMap = new Map(dailyPool.map(d => [d.id, d]));
      const bannerDetails = rateUpBanners.map(b => ({
        id: b.id,
        name: b.name,
        rate_boost: b.rate_boost,
        characters: (b.characterIds || []).map(cid => {
          const preR = parseRate(preMap.get(cid));
          const postR = parseRate(postMap.get(cid));
          return {
            id: cid,
            preRate: fmtRate(preR),
            postRate: fmtRate(postR),
            shareOfPool: fmtRate((postR / postPool.total) * 100),
            expectedPer10: fmtRate((postR / postPool.total) * times),
          };
        }),
      }));
      DefaultLogger.info(
        `[gacha-banner] user=${userId} mode=${mode} details=${JSON.stringify(bannerDetails)}`
      );
    }

    debugCtx = { mode, bannerIdSet };
  }

  const { rewards, rareCount } = drawRewards(dailyPool, times, { userId, ensure });

  if (debugCtx) {
    const bannerHits = rewards.filter(r => debugCtx.bannerIdSet.has(r.id)).length;
    DefaultLogger.info(
      `[gacha-result] user=${userId} mode=${debugCtx.mode} ` +
        `silver=${rareCount[1] || 0} gold=${rareCount[2] || 0} rainbow=${rareCount[3] || 0} ` +
        `bannerHits=${bannerHits}`
    );
  }

  const uniqRewards = uniqBy(rewards, "id");
  const rawRewardIds = rewards.map(r => r.id);
  const rewardIds = uniq(rawRewardIds);

  const ownItems = await time("rd.inventory", () =>
    inventory.knex
      .where({ userId })
      .select("itemId")
      .andWhereNot("itemId", 999)
      .orderBy("itemId", "asc")
  );
  const ownItemIds = ownItems.map(item => item.itemId);
  const ownCharactersCount = ownItemIds.length;

  const duplicateItems = [...rawRewardIds];
  const newItemIds = difference(rewardIds, ownItemIds);
  pullAt(
    duplicateItems,
    newItemIds.map(id => duplicateItems.indexOf(id))
  );

  const fragmentRewards = computeFragmentRewards(uniqRewards, duplicateItems);
  const newCharacters = uniqRewards.filter(r => newItemIds.includes(r.id));

  let signinCreated = false;
  let signinDate = null;
  await time("rd.tx", async () => {
    await mysql.transaction(async trx => {
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

      // 重複角色改發該角色專屬碎片，不再入帳女神石。必須用同一個 trx —— 碎片是資產，
      // 抽卡紀錄回滾了碎片就不能留下。
      for (const fragment of fragmentRewards) {
        await CharacterFragment.increase(userId, fragment.itemId, fragment.amount, trx);
      }

      const [insertedId] = await trx(GachaRecord.table).insert({
        user_id: userId,
        silver: rareCount[1] || 0,
        gold: rareCount[2] || 0,
        rainbow: rareCount[3] || 0,
        has_new: newCharacters.length > 0 ? 1 : 0,
      });
      const gachaRecordId = insertedId;

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

      // 簽到與轉蛋紀錄同進同退：交易回滾時不會留下「有簽到、沒轉蛋」的孤兒列。
      const signin = await SigninService.recordNormal(userId, { trx });
      signinCreated = signin.created;
      signinDate = signin.date;
    });
  });

  await time("rd.side", () =>
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId })
  );

  // 成就評估必須在 commit 之後 —— 交易內查 streak/total 會讀到未提交的狀態。
  // 只有真的新增了 ledger 才評估，同一天重抽不重複觸發。
  const signinUnlocks = signinCreated
    ? await time("rd.signinAchievement", () =>
        SigninService.evaluateAchievements(userId, {
          source: "normal",
          date: signinDate,
        }).then(r => r.unlocked || [])
      )
    : [];

  const { unlocked } = await time("rd.achievement", () =>
    AchievementEngine.evaluate(userId, "gacha_pull", {
      threeStarCount: rareCount[3] || 0,
      uniqueCount: ownCharactersCount + newCharacters.length,
      pullType: europe ? "europe" : ensure ? "ensure" : pickup ? "pickup" : undefined,
      feature: "gacha",
    }).catch(err => {
      DefaultLogger.warn(
        `GachaService.runDailyDraw achievement.evaluate failed user=${userId}: ${err && err.message}`
      );
      return { unlocked: [] };
    })
  );

  return {
    rewards,
    rareCount,
    newCharacters,
    ownCharactersCount,
    fragmentRewards,
    godStoneCost: cost.amount,
    unlocks: [...(unlocked || []), ...signinUnlocks],
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
  computeFragmentRewards,
  drawRewards,
  MAX_PITY_REDRAWS,
};
