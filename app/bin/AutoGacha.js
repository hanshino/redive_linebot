const moment = require("moment");
const config = require("config");
const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const GachaService = require("../src/service/GachaService");
const SubscriptionService = require("../src/service/SubscriptionService");

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await run();
  } catch (err) {
    DefaultLogger.error(`[AutoGacha] top-level error: ${err.message}`);
  }
  running = false;
}

async function run() {
  const concurrency = config.get("autoGacha.concurrency") || 8;
  const runDate = moment().format("YYYY-MM-DD");
  const start = Date.now();

  const targets = await impl.loadTargets();
  DefaultLogger.info(`cron.auto_gacha.start target_count=${targets.length}`);

  const counters = { success: 0, failed: 0, skipped: 0 };
  await impl.runBatched(targets, concurrency, t => impl.drawForUser(t, runDate, counters));

  const durationMs = Date.now() - start;
  DefaultLogger.info(
    `cron.auto_gacha.complete duration_ms=${durationMs} ` +
      `target_count=${targets.length} success=${counters.success} ` +
      `failed=${counters.failed} skipped=${counters.skipped}`
  );
}

/**
 * 找出今晚代抽的目標使用者：有效訂閱 + 卡包含 auto_daily_gacha effect +
 * user_auto_preference.auto_daily_gacha=1 + 今日尚未抽過。
 */
async function loadTargets() {
  const now = new Date();
  const startOfDay = moment().startOf("day").toDate();
  const endOfDay = moment().endOf("day").toDate();

  const rows = await mysql("subscribe_user as su")
    .innerJoin("subscribe_card as sc", "su.subscribe_card_key", "sc.key")
    .innerJoin("user_auto_preference as uap", "uap.user_id", "su.user_id")
    .leftJoin("gacha_record as gr", function () {
      this.on("gr.user_id", "=", "su.user_id")
        .andOn("gr.created_at", ">=", mysql.raw("?", [startOfDay]))
        .andOn("gr.created_at", "<=", mysql.raw("?", [endOfDay]));
    })
    .where("su.start_at", "<=", now)
    .where("su.end_at", ">", now)
    .where("uap.auto_daily_gacha", 1)
    .whereNull("gr.id")
    .whereRaw("JSON_SEARCH(sc.effects, 'one', 'auto_daily_gacha', NULL, '$[*].type') IS NOT NULL")
    .select("su.user_id", "sc.key as card_key")
    .distinct();

  return rows;
}

async function drawForUser(target, runDate, counters) {
  const userId = target.user_id;
  const perStart = Date.now();

  try {
    // Explicit re-check: subscription may have expired between loadTargets and now
    const stillActive = await SubscriptionService.hasEffect(userId, "auto_daily_gacha");
    if (!stillActive) {
      counters.skipped++;
      return upsertLog(userId, runDate, {
        status: "skipped",
        pulls_made: 0,
        error: "subscription_expired_between_load_and_draw",
        duration_ms: Date.now() - perStart,
      });
    }

    // Quota gate: subscribers get base + gacha_times bonus pulls per day. Cron
    // must deliver the full remaining quota so we don't short-change month/season
    // card holders compared to the manual `/抽` path.
    const quota = await GachaService.getRemainingDailyQuota(userId);
    if (quota.remaining === 0) {
      counters.skipped++;
      return upsertLog(userId, runDate, {
        status: "skipped",
        pulls_made: 0,
        error: "already_pulled",
        duration_ms: Date.now() - perStart,
      });
    }

    const aggregated = emptyAggregate();
    for (let i = 0; i < quota.remaining; i++) {
      const result = await GachaService.runDailyDraw(userId);
      accumulate(aggregated, result);
    }
    counters.success++;
    return upsertLog(userId, runDate, {
      status: "success",
      pulls_made: aggregated.rewards.length,
      reward_summary: summarizeAggregate(aggregated, quota),
      error: null,
      duration_ms: Date.now() - perStart,
    });
  } catch (err) {
    counters.failed++;
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 255);
    DefaultLogger.error(`[AutoGacha] draw failed for ${userId}: ${errMsg}`);
    return upsertLog(userId, runDate, {
      status: "failed",
      pulls_made: 0,
      error: errMsg,
      duration_ms: Date.now() - perStart,
    });
  }
}

function emptyAggregate() {
  return {
    rewards: [],
    rareCount: {},
    newCharactersCount: 0,
    godStoneCost: 0,
    repeatReward: 0,
  };
}

function accumulate(agg, result) {
  agg.rewards.push(...(result.rewards || []));
  agg.newCharactersCount += (result.newCharacters || []).length;
  agg.godStoneCost += result.godStoneCost || 0;
  agg.repeatReward += result.repeatReward || 0;
  if (result.rareCount) {
    for (const star of Object.keys(result.rareCount)) {
      const n = Number(result.rareCount[star] || 0);
      if (n) agg.rareCount[star] = (agg.rareCount[star] || 0) + n;
    }
  }
}

function summarizeAggregate(agg, quota) {
  return {
    rareCount: agg.rareCount,
    newCharactersCount: agg.newCharactersCount,
    godStoneCost: agg.godStoneCost,
    repeatReward: agg.repeatReward,
    rounds: quota.remaining,
    quota_total: quota.total,
  };
}

function summarizeRewards(result) {
  const agg = emptyAggregate();
  accumulate(agg, result);
  return summarizeAggregate(agg, { total: 1, remaining: 1 });
}

async function upsertLog(userId, runDate, fields) {
  const row = {
    user_id: userId,
    run_date: runDate,
    status: fields.status,
    pulls_made: fields.pulls_made || 0,
    error: fields.error || null,
    duration_ms: fields.duration_ms || null,
    reward_summary: fields.reward_summary ? JSON.stringify(fields.reward_summary) : null,
  };
  await mysql.raw(
    `INSERT INTO auto_gacha_job_log
      (user_id, run_date, status, pulls_made, error, duration_ms, reward_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       pulls_made = VALUES(pulls_made),
       error = VALUES(error),
       duration_ms = VALUES(duration_ms),
       reward_summary = VALUES(reward_summary)`,
    [
      row.user_id,
      row.run_date,
      row.status,
      row.pulls_made,
      row.error,
      row.duration_ms,
      row.reward_summary,
    ]
  );
}

async function runBatched(items, limit, worker) {
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.allSettled(chunk.map(worker));
  }
}

const impl = { loadTargets, drawForUser, runBatched };

module.exports = main;
module.exports.impl = impl;
module.exports.loadTargets = loadTargets;
module.exports.drawForUser = drawForUser;
module.exports.runBatched = runBatched;
module.exports.summarizeRewards = summarizeRewards;
module.exports.upsertLog = upsertLog;

if (require.main === module) {
  main().then(() => process.exit(0));
}
