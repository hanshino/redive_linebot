const redis = require("../src/util/redis");
const { getClient } = require("bottender");
const { DefaultLogger } = require("../src/util/Logger");
const broadcastQueue = require("../src/util/broadcastQueue");
const replyTokenQueue = require("../src/util/replyTokenQueue");

const KEY_PREFIX = "BROADCAST_QUEUE_";

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await drainAll();
  } catch (err) {
    console.error("[BroadcastQueueDrainer]", err);
  } finally {
    running = false;
  }
}

async function drainAll() {
  const lineClient = getClient("line");
  const iterator = redis.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 100 });

  for await (const key of iterator) {
    const groupId = key.slice(KEY_PREFIX.length);
    try {
      await broadcastQueue.drain(groupId, {
        lineClient,
        replyTokenQueue,
        logger: DefaultLogger,
      });
    } catch (err) {
      // One bad key must not abort the sweep — other groups still need draining.
      console.error(`[BroadcastQueueDrainer] drain failed for ${groupId}`, err);
    }
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit(0));
}
