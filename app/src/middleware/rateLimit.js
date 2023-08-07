const redis = require("../util/redis");

/**
 * 收到用戶訊息時，最快只能每 0.5 秒回覆一次
 */
module.exports = async (context, { next }) => {
  if (!context.event.isText) return next;
  const { userId } = context.event.source;
  const key = `rate-limit:${userId}`;
  const isSet = await redis.set(key, 1, { PX: 500, NX: true });

  if (!isSet) {
    console.log(`[rate-limit] ${userId} is rate limited`);
    return;
  }

  return next;
};
