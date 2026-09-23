if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const config = require("config");
const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const SubscriptionService = require("../src/service/SubscriptionService");
const SeasonService = require("../src/service/WorldBossSeasonService");
const BattleService = require("../src/service/WorldBossBattleService");
const AttackService = require("../src/service/WorldBossAttackService");
const MinigameService = require("../src/service/MinigameService");
const EquipmentService = require("../src/service/EquipmentService");
const WorldBossRound = require("../src/model/application/WorldBossRound");

const VALID_MODES = ["standard", "skill"];
// 每次「打錯目標」（ROUND_STALE／ROUND_CLEARED）允許重新挑目標的次數上限，避免與其他
// 玩家的併發攻擊造成無限重試。
const RETRY_BOUND = 3;
// 這三種錯誤代表「整個賽季當下不可用」，不是這個玩家的問題 —— 一旦出現，後面所有玩家
// 一定會遇到同樣的錯誤，繼續跑只是把同一件事再記錄一次 log，所以整批中止並只記一次。
const ABORT_BATCH_CODES = new Set(["NO_ACTIVE_SEASON", "SEASON_ENDED", "NO_ACTIVE_ROUND"]);

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await run();
  } catch (err) {
    DefaultLogger.error(`[AutoWorldBossAttack] top-level error: ${err && err.message}`);
  }
  running = false;
}

async function run() {
  const start = Date.now();

  const status = await SeasonService.getBattleStatus();
  if (!status || status.ended) {
    DefaultLogger.info("cron.auto_world_boss.abort reason=no_active_season");
    return;
  }
  const seasonId = status.season.id;

  const targets = await impl.loadTargets();
  DefaultLogger.info(`cron.auto_world_boss.start target_count=${targets.length}`);

  // 依規格逐一序列處理：每次攻擊本來就要搶賽季列的全域鎖，並行只會互相排隊，
  // 不會加速，反而讓「整批中止」的判斷變複雜。
  const counters = { hits: 0, usersAttacked: 0, usersSkipped: 0, usersFailed: 0 };
  for (const target of targets) {
    const outcome = await impl.attackForUser(target, seasonId, counters);
    if (outcome && outcome.abortBatch) {
      DefaultLogger.error(
        `cron.auto_world_boss.abort reason=${outcome.error} last_user_id=${target.user_id}`
      );
      break;
    }
  }

  const durationMs = Date.now() - start;
  DefaultLogger.info(
    `cron.auto_world_boss.complete duration_ms=${durationMs} target_count=${targets.length} ` +
      `hits=${counters.hits} users_attacked=${counters.usersAttacked} ` +
      `users_skipped=${counters.usersSkipped} users_failed=${counters.usersFailed}`
  );
}

/**
 * 找出今晚代打的目標使用者：有效訂閱（start_at <= now < end_at）+ 卡的 effects 陣列含
 * auto_world_boss + user_auto_preference.auto_world_boss 未被明確關閉。
 * `COALESCE(uap.auto_world_boss, 1) = 1`：沒有 preference 列（LEFT JOIN 為 NULL），或該列
 * 是本功能上線前建立、欄位為 NULL/未填，一律視為「預設開啟」；只有明確存了 0 才排除，
 * 對齊 AutoPreferenceController.loadPreference 的預設開啟語意。
 * 只有 month_plus 卡種帶 auto_world_boss effect，但同一玩家理論上不會同時持有兩張
 * 都帶這個 effect 的有效訂閱，.distinct() 只是防禦寫法、不依賴這個假設。
 */
async function loadTargets() {
  const now = new Date();
  return mysql("subscribe_user as su")
    .innerJoin("subscribe_card as sc", "su.subscribe_card_key", "sc.key")
    .leftJoin("user_auto_preference as uap", "uap.user_id", "su.user_id")
    .where("su.start_at", "<=", now)
    .where("su.end_at", ">", now)
    .whereRaw("COALESCE(uap.auto_world_boss, 1) = 1")
    .whereRaw("JSON_SEARCH(sc.effects, 'one', 'auto_world_boss', NULL, '$[*].type') IS NOT NULL")
    .select("su.user_id", "uap.auto_world_boss_mode")
    .distinct();
}

/**
 * 每一擊都要重新挑「當前 cycle 內尚未擊破、血量最低」的目標 —— HP 與 cycle 都可能因
 * 這次批次前面幾擊而改變，不能沿用上一擊挑到的名單。
 * @param {Array<Object>} rounds WorldBossRound.listCurrentCycle(seasonId) 回傳的 rounds
 * @returns {?Object} 挑中的 round row，找不到（全部已破或無 round）回 null
 */
function pickLowestHpRound(rounds) {
  const uncleared = (rounds || []).filter(
    round => !round.cleared_at && BigInt(round.current_hp) > 0n
  );
  if (!uncleared.length) return null;
  return uncleared.reduce((lowest, round) =>
    BigInt(round.current_hp) < BigInt(lowest.current_hp) ? round : lowest
  );
}

/**
 * 單一玩家的代打迴圈：花光「今天剩餘」的世界王攻擊額度，不管手動已經打掉多少
 * （額度本身就是唯一權威，BattleService.attack 的交易內重算保證同一天重跑不會超打）。
 *
 * 回傳 `{ abortBatch: true, error }` 代表整批要中止；其餘情況一律 `{ abortBatch: false }`，
 * 呼叫端會繼續處理下一位玩家。
 */
async function attackForUser(target, seasonId, counters) {
  const userId = target.user_id;
  const requestedMode = VALID_MODES.includes(target.auto_world_boss_mode)
    ? target.auto_world_boss_mode
    : "standard";

  // 攻擊前重新確認資格（比照 AutoGacha 的 stillActive）：批次載入到實際攻擊之間，
  // 訂閱可能剛好過期或使用者關掉了偏好。
  const stillActive = await SubscriptionService.hasEffect(userId, "auto_world_boss").catch(
    () => false
  );
  if (!stillActive) {
    counters.usersSkipped++;
    return { abortBatch: false };
  }

  let progress;
  let bonuses;
  try {
    [progress, bonuses] = await Promise.all([
      MinigameService.findByUserId(userId),
      EquipmentService.getEquipmentBonuses(userId),
    ]);
  } catch (err) {
    counters.usersFailed++;
    DefaultLogger.error(
      `[AutoWorldBossAttack] load progress/equipment failed for ${userId}: ${err && err.message}`
    );
    return { abortBatch: false };
  }
  const resolvedProgress = progress || { level: 1, job_key: "adventurer" };
  const { standardCost, skillCost } = AttackService.resolveCosts(resolvedProgress, bonuses);

  // 安全上限：cost 至少為 1，理論上一天最多打 dailyLimit 次；實務上 standard/skill cost
  // 遠大於 1，這個上限只是防止任何未預期的 0-cost 情境造成無限迴圈。
  const dailyLimit = config.get("worldboss.daily_cost_limit");
  let hitsThisUser = 0;

  for (let i = 0; i < dailyLimit; i++) {
    let daily;
    try {
      daily = await BattleService.getRemainingDailyCost(userId);
    } catch (err) {
      counters.usersFailed++;
      DefaultLogger.error(
        `[AutoWorldBossAttack] quota check failed for ${userId}: ${err && err.message}`
      );
      break;
    }

    // 技能額度不夠時才降級普通攻擊；額度連普通攻擊都不夠就整個停止（規格明定的收尾條件）。
    if (daily.remaining < standardCost) break;
    const attackType =
      requestedMode === "skill" && daily.remaining >= skillCost ? "skill" : "standard";

    let attackSucceeded = false;
    let abortSignal = null;
    for (let retry = 0; retry < RETRY_BOUND; retry++) {
      let rounds;
      try {
        ({ rounds } = await WorldBossRound.listCurrentCycle(seasonId));
      } catch (err) {
        counters.usersFailed++;
        DefaultLogger.error(
          `[AutoWorldBossAttack] round lookup failed for ${userId}: ${err && err.message}`
        );
        return { abortBatch: false };
      }
      const targetRound = pickLowestHpRound(rounds);
      if (!targetRound) return { abortBatch: true, error: "NO_ACTIVE_ROUND" };

      try {
        await AttackService.autoAttack({ userId, roundId: targetRound.id, attackType });
        attackSucceeded = true;
        hitsThisUser += 1;
        counters.hits += 1;
        break;
      } catch (err) {
        const code = err && err.code;
        if (code === "ROUND_STALE" || code === "ROUND_CLEARED") continue; // re-pick, bounded by RETRY_BOUND
        if (code === "DAILY_LIMIT_EXCEEDED") {
          abortSignal = code;
          break;
        }
        if (ABORT_BATCH_CODES.has(code)) return { abortBatch: true, error: code };
        counters.usersFailed++;
        DefaultLogger.error(
          `[AutoWorldBossAttack] attack failed for ${userId}: ${err && err.message}`
        );
        return { abortBatch: false };
      }
    }

    // 重試次數用盡（連續撞 ROUND_STALE/ROUND_CLEARED）視為這一擊失敗但不影響其他玩家；
    // DAILY_LIMIT_EXCEEDED 則是這位玩家的額度已在別處被搶先用完，同樣停止但不算失敗。
    if (!attackSucceeded && abortSignal !== "DAILY_LIMIT_EXCEEDED") {
      DefaultLogger.error(
        `[AutoWorldBossAttack] retry bound exhausted for ${userId} after ${RETRY_BOUND} attempts`
      );
    }
    if (abortSignal === "DAILY_LIMIT_EXCEEDED" || !attackSucceeded) break;
  }

  if (hitsThisUser > 0) counters.usersAttacked += 1;
  else counters.usersSkipped += 1;
  return { abortBatch: false };
}

const impl = { loadTargets, attackForUser, pickLowestHpRound };

module.exports = main;
module.exports.impl = impl;
module.exports.loadTargets = loadTargets;
module.exports.attackForUser = attackForUser;
module.exports.pickLowestHpRound = pickLowestHpRound;

if (require.main === module) {
  main().then(() => process.exit(0));
}
