const redis = require("./redis");

const BROADCAST_QUEUE_KEY = groupId => `BROADCAST_QUEUE_${groupId}`;
const TTL_SECONDS = 86400;

/**
 * Push a broadcast event onto the group's queue.
 * M4's drainer consumes these. If groupId is falsy (e.g. the LIFF-originated
 * broadcast has no cached last-group for this user), the event is silently
 * dropped — reply-token delivery requires a group anyway.
 *
 * @param {string|null|undefined} groupId
 * @param {object} event — { type, userId, text, payload, createdAt? }
 * @returns {Promise<boolean>} true if pushed, false if dropped
 */
async function pushEvent(groupId, event) {
  if (!groupId) return false;
  const payload = {
    createdAt: Date.now(),
    ...event,
  };
  const key = BROADCAST_QUEUE_KEY(groupId);
  await redis.lPush(key, JSON.stringify(payload));
  await redis.expire(key, TTL_SECONDS);
  return true;
}

module.exports = { pushEvent, BROADCAST_QUEUE_KEY, TTL_SECONDS };
