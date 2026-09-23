const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");
const { toUtc8Date } = require("../util/date");
const AchievementEngine = require("./AchievementEngine");
const JankenAutoMatchOutbox = require("../model/application/JankenAutoMatchOutbox");

const TABLE = JankenAutoMatchOutbox.table;
const EVENT_NAMES = new Set(JankenAutoMatchOutbox.EVENT_NAMES);
const DEFAULT_LIMIT = 100;
const DEFAULT_BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const MAX_SKIPPED_CANDIDATES = 1000;
const FAILURE_RECORDED = Symbol("outboxFailureRecorded");
const LOGGABLE_DRIVER_CODES = new Set([
  "ER_DUP_ENTRY",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
]);

function applyEligibleAt(query, nowMs) {
  return query.where(builder =>
    builder
      .whereNull("last_error")
      .orWhereRaw("last_error NOT LIKE '%\"retry_at_ms\":%'")
      .orWhereRaw(
        "CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(last_error, '\"retry_at_ms\":', -1), '}', 1) " +
          "AS UNSIGNED) <= ?",
        [nowMs]
      )
  );
}

function safeErrorCode(error) {
  const message = error && error.message;
  if (typeof message === "string" && message.includes("definition revision mismatch")) {
    return "ACHIEVEMENT_TRACKING_REVISION_MISMATCH";
  }
  if (typeof message === "string" && message.includes("tracked Redis payload malformed")) {
    return "ACHIEVEMENT_TRACKED_PAYLOAD_MALFORMED";
  }
  if (error && LOGGABLE_DRIVER_CODES.has(error.code)) return error.code;
  return "ACHIEVEMENT_EVALUATION_FAILED";
}

function parsePayload(payload) {
  if (payload === null || payload === undefined) return {};
  let parsed = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      throw new Error("janken auto-match outbox payload malformed", { cause: error });
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("janken auto-match outbox payload malformed");
  }
  return parsed;
}

function eventContext(row) {
  const payload = parsePayload(row.payload);
  const context = {
    // `date` follows AchievementEngine's existing dated-context convention (SigninService).
    date: toUtc8Date(row.run_date),
    occurredAt: new Date(row.occurred_at),
  };
  // AchievementEngine 的既有猜拳 strategy 只讀這兩個 payload 欄位；不透傳任意 JSON。
  if (row.event_name === "janken_win" && payload.streak !== undefined) {
    context.streak = payload.streak;
  }
  if (payload.feature !== undefined) context.feature = payload.feature;
  return context;
}

async function peekCandidate(nowMs, excludedIds) {
  let query = mysql(TABLE).whereNull("processed_at");
  applyEligibleAt(query, nowMs);
  if (excludedIds.length > 0) query = query.whereNotIn("id", excludedIds);
  return query.orderBy("id", "asc").first();
}

async function lockCandidate(trx, candidateId, nowMs) {
  const query = trx(TABLE).where({ id: candidateId }).whereNull("processed_at");
  applyEligibleAt(query, nowMs);
  return query.forUpdate().skipLocked().first();
}

async function ensureUserLockOutsideTransaction(userId) {
  const exists = await mysql("achievement_user_lock").where({ user_id: userId }).first();
  if (!exists) await AchievementEngine.ensureUserLock(userId);
}

function backoffMs(attempts, baseBackoffMs) {
  return Math.min(baseBackoffMs * 2 ** Math.min(Math.max(attempts - 1, 0), 10), MAX_BACKOFF_MS);
}

async function recordFailure(candidateId, error, now, baseBackoffMs) {
  await mysql.transaction(async trx => {
    const row = await trx(TABLE).where({ id: candidateId }).forUpdate().first();
    if (!row || row.processed_at) return;
    const attempts = Number(row.attempts || 0) + 1;
    await trx(TABLE)
      .where({ id: candidateId, processed_at: null })
      .update({
        attempts,
        last_error: JSON.stringify({
          code: safeErrorCode(error),
          retry_at_ms: now.getTime() + backoffMs(attempts, baseBackoffMs),
        }),
      });
  });
}

/**
 * 處理一列 pending outbox。先在 trx 外 peek 同一 candidate 並 autocommit ensure 它的 user mutex，
 * 再於 trx 內只鎖該 candidate id；若已被其他 worker 鎖住，SKIP LOCKED 後改看下一個 id。
 * strict achievement effect 與 processed_at 共用同一 transaction。
 */
exports.processNext = async ({
  now = new Date(),
  baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
} = {}) => {
  const drainNow = new Date(now);
  if (Number.isNaN(drainNow.getTime())) throw new Error("Invalid outbox drain time");
  if (!Number.isSafeInteger(baseBackoffMs) || baseBackoffMs < 1) {
    throw new Error("baseBackoffMs must be a positive safe integer");
  }

  const excludedIds = [];
  // ponytail: bounded locked-row scan; a later cron tick resumes if >1000 rows are locked.
  while (excludedIds.length < MAX_SKIPPED_CANDIDATES) {
    const candidate = await peekCandidate(drainNow.getTime(), excludedIds);
    if (!candidate) return null;

    try {
      // Must remain outside the effect transaction. Ensuring exactly the peeked user's row avoids
      // both INSERT-IGNORE lock upgrade deadlocks and ensuring A before SKIP LOCKED selects B.
      await ensureUserLockOutsideTransaction(candidate.user_id);
      const result = await mysql.transaction(async trx => {
        const row = await lockCandidate(trx, candidate.id, drainNow.getTime());
        if (!row) return null;
        if (!EVENT_NAMES.has(row.event_name)) {
          throw new Error("unsupported janken auto-match outbox event");
        }

        await AchievementEngine.evaluateInTransaction(
          trx,
          row.user_id,
          row.event_name,
          eventContext(row)
        );
        const marked = await trx(TABLE).where({ id: row.id, processed_at: null }).update({
          processed_at: drainNow,
          last_error: null,
        });
        if (marked !== 1) throw new Error("outbox processed marker update failed");
        return {
          status: "processed",
          id: row.id,
          matchId: row.match_id,
          eventName: row.event_name,
        };
      });
      if (result) return result;
      excludedIds.push(candidate.id);
    } catch (error) {
      await recordFailure(candidate.id, error, drainNow, baseBackoffMs);
      DefaultLogger.warn(`[JankenAutoMatchOutbox] id=${candidate.id} code=${safeErrorCode(error)}`);
      const recordedError = error instanceof Error ? error : new Error("outbox processing failed");
      recordedError[FAILURE_RECORDED] = true;
      throw recordedError;
    }
  }
  return null;
};

/** Drain at most `limit` rows. A failed row gets durable backoff and never blocks later rows. */
exports.drain = async ({ limit = DEFAULT_LIMIT, now, baseBackoffMs } = {}) => {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  const drainNow = now === undefined ? new Date() : new Date(now);
  if (Number.isNaN(drainNow.getTime())) throw new Error("Invalid outbox drain time");
  let processed = 0;
  let failed = 0;

  while (processed + failed < limit) {
    try {
      const result = await exports.processNext({ now: drainNow, baseBackoffMs });
      if (!result) break;
      processed += 1;
    } catch (error) {
      if (!error || !error[FAILURE_RECORDED]) throw error;
      failed += 1;
    }
  }
  return { processed, failed };
};
