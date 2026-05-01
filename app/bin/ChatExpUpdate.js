const redis = require("../src/util/redis");
const pipeline = require("../src/service/chatXp/pipeline");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    const events = await popQueue();
    if (events.length === 0) return;
    await pipeline.processBatch(events);
  } catch (err) {
    console.error(err);
    DefaultLogger.error(err);
  } finally {
    running = false;
  }
}

async function popQueue(max = 1000) {
  const events = [];
  for (let i = 0; i < max; i++) {
    const raw = await redis.rPop("CHAT_EXP_RECORD");
    if (raw === null) break;
    try {
      events.push(JSON.parse(raw));
    } catch {
      // skip malformed payloads — they never re-enter the queue
    }
  }
  return events;
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
