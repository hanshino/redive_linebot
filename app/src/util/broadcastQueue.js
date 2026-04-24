const redis = require("./redis");

const BROADCAST_QUEUE_KEY = groupId => `BROADCAST_QUEUE_${groupId}`;
const TTL_SECONDS = 86400;
// LINE `reply` accepts up to 5 messages per call.
const MAX_BATCH = 5;

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
  return { type: "text", text: event && event.text ? event.text : "[空事件]" };
}

function parseOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Drain up to MAX_BATCH oldest events from a group's queue using a fresh
 * reply token. Unparseable entries are skipped but still counted toward the
 * lTrim so they don't pile up. On reply failure the slice is left intact so
 * the next drain cycle retries.
 *
 * @param {string} groupId
 * @param {{lineClient:{reply:Function}, replyTokenQueue:{pullFreshToken:Function}, logger?:{error:Function}}} deps
 * @returns {Promise<{drained:number, reason?:string}>}
 */
async function drain(groupId, deps) {
  if (!groupId) return { drained: 0 };
  const { lineClient, replyTokenQueue, logger } = deps;
  const key = BROADCAST_QUEUE_KEY(groupId);

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
    await redis.lTrim(key, 0, -(raws.length + 1));
    return { drained: raws.length };
  } catch (err) {
    if (logger && typeof logger.error === "function") {
      logger.error("[broadcastQueue.drain] reply failed", {
        groupId,
        err: err && err.message,
      });
    }
    return { drained: 0, reason: "reply_failed" };
  }
}

module.exports = {
  pushEvent,
  drain,
  formatMessage,
  BROADCAST_QUEUE_KEY,
  TTL_SECONDS,
  MAX_BATCH,
};
