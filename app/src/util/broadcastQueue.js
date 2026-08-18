const crypto = require("crypto");
const redis = require("./redis");

const BROADCAST_QUEUE_KEY = groupId => `BROADCAST_QUEUE_${groupId}`;
const DRAIN_LOCK_KEY = groupId => `BROADCAST_DRAIN_LOCK_${groupId}`;
const TTL_SECONDS = 86400;
// LINE `reply` accepts up to 5 messages per call.
const MAX_BATCH = 5;
// Long enough to cover one LINE reply round-trip, short enough that a crashed
// drainer only stalls this group until the next sweep.
const LOCK_TTL_SECONDS = 10;

// Compare-and-delete. A plain DEL is unsafe: if our critical section outran the
// TTL, the key we would delete belongs to the successor that legitimately took
// over, and deleting it lets a third drainer in while the successor is mid-send.
const RELEASE_LOCK_LUA =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

// Verify-and-extend in one round trip. A bare GET compare would still leave a
// gap: the TTL could lapse between the check and the lTrim. Re-arming the TTL in
// the same atomic script is the smaller correct option — one eval instead of a
// GET plus a race — and it hands the lTrim a full fresh window.
const RENEW_LOCK_LUA =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end';

/**
 * Push a broadcast event onto the group's queue. The drainer consumes these.
 * If groupId is falsy the event is silently dropped — reply-token delivery
 * requires a concrete source.
 *
 * @param {string|null|undefined} groupId
 * @param {object} event — { type, userId, text, payload, createdAt? }
 * @returns {Promise<boolean>} true if pushed, false if dropped
 */
async function pushEvent(groupId, event) {
  if (!groupId) return false;
  const payload = { createdAt: Date.now(), ...event };
  const key = BROADCAST_QUEUE_KEY(groupId);
  await redis.lPush(key, JSON.stringify(payload));
  await redis.expire(key, TTL_SECONDS);
  return true;
}

function formatMessage(event) {
  if (event && event.flex && event.flex.altText && event.flex.contents) {
    return { type: "flex", altText: event.flex.altText, contents: event.flex.contents };
  }
  return { type: "text", text: event && event.text ? event.text : "[空事件]" };
}

function parseOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function logError(logger, message, meta) {
  if (logger && typeof logger.error === "function") {
    logger.error(`[broadcastQueue.drain] ${message}`, meta);
  }
}

/**
 * Re-assert ownership and re-arm the TTL atomically.
 * @returns {Promise<boolean>} true if the lock is still ours
 */
async function renewLock(lockKey, lockToken, logger, groupId) {
  try {
    const renewed = await redis.eval(RENEW_LOCK_LUA, {
      keys: [lockKey],
      arguments: [lockToken, String(LOCK_TTL_SECONDS * 1000)],
    });
    return Number(renewed) === 1;
  } catch (err) {
    // Can't prove we still own it, so treat it as lost: the destructive lTrim
    // must never run on an unverified lock.
    logError(logger, "lock renew failed", { groupId, err: err && err.message });
    return false;
  }
}

/** Compare-and-delete; never throws, a stuck lock still expires by TTL. */
async function releaseLock(lockKey, lockToken, logger, groupId) {
  try {
    await redis.eval(RELEASE_LOCK_LUA, { keys: [lockKey], arguments: [lockToken] });
  } catch (err) {
    logError(logger, "lock release failed", { groupId, err: err && err.message });
  }
}

/**
 * Drain up to MAX_BATCH oldest events from a group's queue using a fresh
 * reply token. Unparseable entries are skipped but still counted toward the
 * lTrim so they don't pile up. On reply failure the slice is left intact so
 * the next drain cycle retries.
 *
 * Concurrency: EventDequeue fires a drain per inbound group message while the
 * 30s cron sweeps the same keys, so two drains can overlap on one group. Each
 * would pull its own fresh reply token, send the same slice, and lTrim twice —
 * duplicate messages plus events discarded that were never delivered. A
 * per-group Redis NX lock serialises them; the loser does nothing.
 *
 * The queue is only read once the lock is held. Reading first would let both
 * callers capture the same slice before either could be turned away.
 *
 * The lock value is a per-call random token, and it is released — compare-and-
 * delete — in a finally, so success and failure both free the group immediately
 * instead of waiting out the TTL. The TTL is only the crash backstop now.
 *
 * The token alone does not close the whole hole: a reply that outruns
 * LOCK_TTL_SECONDS lets a successor legitimately acquire while we are still
 * holding the slice we read. So ownership is re-asserted right before lTrim,
 * the one destructive step; if the lock is no longer ours we do not trim,
 * because the successor may already have claimed that slice.
 *
 * @param {string} groupId
 * @param {{lineClient:{reply:Function}, replyTokenQueue:{pullFreshToken:Function}, logger?:{error:Function}}} deps
 * @returns {Promise<{drained:number, reason?:string}>}
 */
async function drain(groupId, deps) {
  if (!groupId) return { drained: 0 };
  const { lineClient, replyTokenQueue, logger } = deps;
  const key = BROADCAST_QUEUE_KEY(groupId);
  const lockKey = DRAIN_LOCK_KEY(groupId);
  const lockToken = crypto.randomUUID();

  let lockAcquired;
  try {
    lockAcquired = await redis.set(lockKey, lockToken, {
      EX: LOCK_TTL_SECONDS,
      NX: true,
    });
  } catch (err) {
    // Fail safe: an unreachable lock must stop the drain, never fall through to
    // an unlocked one. The events stay queued for the next cycle.
    logError(logger, "lock failed", { groupId, err: err && err.message });
    return { drained: 0, reason: "lock_failed" };
  }
  if (!lockAcquired) return { drained: 0, reason: "locked" };

  try {
    const raws = await redis.lRange(key, -MAX_BATCH, -1);
    if (!raws || raws.length === 0) return { drained: 0 };

    const token = await replyTokenQueue.pullFreshToken(groupId);
    if (!token) return { drained: 0, reason: "no_token" };

    // lRange returned newest-to-oldest within the tail slice; reverse for
    // chronological (oldest-first) display order.
    const events = raws.map(parseOrNull).filter(Boolean).reverse();
    const messages = events.map(formatMessage);

    try {
      await lineClient.reply(token, messages);
    } catch (err) {
      logError(logger, "reply failed", { groupId, err: err && err.message });
      return { drained: 0, reason: "reply_failed" };
    }

    if (!(await renewLock(lockKey, lockToken, logger, groupId))) {
      // Lost the lock mid-flight. Trimming now could delete a slice the current
      // owner is about to deliver, or events pushed after ours. Leaving them
      // queued risks a duplicate announcement next cycle — at-least-once beats
      // silently dropping a cycle-clear.
      logError(logger, "lock lost before trim, skipping lTrim", { groupId });
      return { drained: 0, reason: "lock_lost" };
    }

    await redis.lTrim(key, 0, -(raws.length + 1));
    return { drained: raws.length };
  } finally {
    await releaseLock(lockKey, lockToken, logger, groupId);
  }
}

module.exports = {
  pushEvent,
  drain,
  formatMessage,
  BROADCAST_QUEUE_KEY,
  DRAIN_LOCK_KEY,
  TTL_SECONDS,
  LOCK_TTL_SECONDS,
  MAX_BATCH,
};
