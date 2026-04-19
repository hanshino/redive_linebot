const moment = require("moment");
const config = require("config");
const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const GachaService = require("../src/service/GachaService");
const SubscriptionService = require("../src/service/SubscriptionService");
const GachaModel = require("../src/model/princess/gacha");
const GachaBanner = require("../src/model/princess/GachaBanner");

const VALID_MODES = ["normal", "pickup", "ensure", "europe"];

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

  // Fetch once per batch — banner state is stable across a run, so per-user
  // re-fetches would be pure overhead.
  const europeBanners = await GachaBanner.getActiveBannersWithCharacters({ type: "europe" });
  const activeEuropeBanner = europeBanners && europeBanners.length > 0 ? europeBanners[0] : null;
  const context = { activeEuropeBanner };

  const counters = { success: 0, failed: 0, skipped: 0 };
  await impl.runBatched(targets, concurrency, t => impl.drawForUser(t, runDate, counters, context));

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
 * 一併帶出 auto_daily_gacha_mode 供 drawForUser 使用。
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
    .select("su.user_id", "sc.key as card_key", "uap.auto_daily_gacha_mode")
    .distinct();

  return rows;
}

function costForMode(mode, activeEuropeBanner) {
  return GachaService.resolveCost(
    mode === "pickup",
    mode === "ensure",
    mode === "europe",
    activeEuropeBanner
  ).amount;
}

function optsForMode(mode) {
  switch (mode) {
    case "pickup":
      return { pickup: true };
    case "ensure":
      return { ensure: true };
    case "europe":
      return { europe: true };
    case "normal":
    default:
      return {};
  }
}

function normalizeMode(raw) {
  return VALID_MODES.includes(raw) ? raw : "normal";
}

async function drawForUser(target, runDate, counters, context = {}) {
  const userId = target.user_id;
  const perStart = Date.now();
  const activeEuropeBanner = context.activeEuropeBanner || null;
  const requestedMode = normalizeMode(target.auto_daily_gacha_mode);

  // europe is period-limited: without an active europe banner, degrade the
  // whole day to normal (matches controller-level behaviour for /歐洲抽).
  let workingMode = requestedMode;
  let fallbackReason = null;
  if (requestedMode === "europe" && !activeEuropeBanner) {
    workingMode = "normal";
    fallbackReason = "europe_unavailable";
  }

  try {
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
    const breakdown = { normal: 0, pickup: 0, ensure: 0, europe: 0 };
    const modeCost = costForMode(workingMode, activeEuropeBanner);

    for (let i = 0; i < quota.remaining; i++) {
      let roundMode = workingMode;
      if (modeCost > 0) {
        // Re-read balance before each round — prior rounds (and any concurrent
        // manual /抽) will have updated the stone count.
        const stoneRaw = await GachaModel.getUserGodStoneCount(userId);
        const stone = parseInt(stoneRaw) || 0;
        if (stone < modeCost) {
          roundMode = "normal";
          if (!fallbackReason) fallbackReason = "insufficient_stone";
        }
      }

      const result = await GachaService.runDailyDraw(userId, optsForMode(roundMode));
      accumulate(aggregated, result);
      breakdown[roundMode]++;
    }

    counters.success++;
    return upsertLog(userId, runDate, {
      status: "success",
      pulls_made: aggregated.rewards.length,
      reward_summary: summarizeAggregate(aggregated, quota, {
        modeRequested: requestedMode,
        breakdown,
        fallbackReason,
      }),
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

function summarizeAggregate(agg, quota, modeMeta = {}) {
  const summary = {
    rareCount: agg.rareCount,
    newCharactersCount: agg.newCharactersCount,
    godStoneCost: agg.godStoneCost,
    repeatReward: agg.repeatReward,
    rounds: quota.remaining,
    quota_total: quota.total,
  };
  if (modeMeta.modeRequested !== undefined) {
    summary.mode_requested = modeMeta.modeRequested;
  }
  if (modeMeta.breakdown) {
    summary.mode_breakdown = modeMeta.breakdown;
  }
  if (modeMeta.fallbackReason !== undefined) {
    summary.fallback_reason = modeMeta.fallbackReason;
  }
  return summary;
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
module.exports.costForMode = costForMode;
module.exports.optsForMode = optsForMode;

if (require.main === module) {
  main().then(() => process.exit(0));
}
