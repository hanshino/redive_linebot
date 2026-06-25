// Topic-analysis aggregation cron — the consumer side of the chat word-cloud
// pipeline (see docs/plans/2026-06-22-topic-heat-keywords-concept.md).
//
// Drains TOPIC_ANALYSIS_RECORD (produced by handleTopicAnalysis in
// bin/EventDequeue.js), runs each text through the jieba analyzer, aggregates
// keyword counts in memory by (group, user, UTC+8 date, keyword), then
// increment-upserts into topic_daily.
//
// Why a separate cron and not inline in EventDequeue: jieba is CPU work and
// EventDequeue's path also lands reply tokens / drains broadcasts — keeping the
// heavy lifting behind its own queue + kill-switch isolates the reply-critical
// path. Mirrors the ChatExpUpdate.js structure exactly.

const redis = require("../src/util/redis");
const knex = require("../src/util/mysql");
const { toUtc8Date } = require("../src/util/date");
const { createAnalyzer, loadStopwords } = require("../src/service/topic/analyzer");
const seed = require("../src/service/topic/dictionary.seed");
const { DefaultLogger } = require("../src/util/Logger");

const QUEUE_KEY = "TOPIC_ANALYSIS_RECORD";
const TABLE = "topic_daily";
const UNIQUE_KEYS = ["group_id", "user_id", "stat_date", "keyword"];
const INSERT_CHUNK = 500;

// Build the analyzer ONCE at module load. Constructing the Jieba instance and
// loading the user dict is not free, so it must not happen per batch.
const analyzer = createAnalyzer({
  aliases: seed.aliases,
  slang: seed.slang,
  stopwords: loadStopwords(),
});

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    const events = await popQueue();
    if (events.length === 0) return;
    const counts = aggregate(events, analyzer);
    const rows = buildRows(counts);
    await upsertRows(rows, knex);
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
    const raw = await redis.rPop(QUEUE_KEY);
    if (raw === null) break;
    try {
      events.push(JSON.parse(raw));
    } catch {
      // skip malformed payloads — they never re-enter the queue
    }
  }
  return events;
}

// ts (ms epoch) -> UTC+8 calendar date "YYYY-MM-DD". Derived PER EVENT because
// the queue can lag across a day boundary; "today" would mis-bucket backlog.
function statDateUtc8(ts) {
  return toUtc8Date(ts);
}

// Pure in-memory aggregation: events -> Map keyed "group|user|date|keyword"
// -> message_count. The analyzer already dedupes keywords within a single
// message, so each distinct keyword a message yields contributes +1.
function aggregate(events, agg) {
  const counts = new Map();
  for (const event of events) {
    if (!event) continue;
    const { userId, groupId, text, ts } = event;
    if (!userId || !groupId) continue;

    const keywords = agg.extract(text || "");
    if (keywords.length === 0) continue;

    const statDate = statDateUtc8(ts);
    for (const keyword of keywords) {
      const key = `${groupId}|${userId}|${statDate}|${keyword}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

// Map -> insert rows. Keys are split from the LEFT for the first three fixed
// fields and the remainder is the keyword, so keywords that themselves contain
// "|" survive intact.
function buildRows(counts) {
  const rows = [];
  for (const [key, message_count] of counts) {
    const first = key.indexOf("|");
    const second = key.indexOf("|", first + 1);
    const third = key.indexOf("|", second + 1);
    rows.push({
      group_id: key.slice(0, first),
      user_id: key.slice(first + 1, second),
      stat_date: key.slice(second + 1, third),
      keyword: key.slice(third + 1),
      message_count,
    });
  }
  return rows;
}

// Increment-upsert into topic_daily, chunked. The merge expression produces
// MySQL `ON DUPLICATE KEY UPDATE message_count = message_count + VALUES(message_count)`,
// so re-running on an existing (group,user,date,keyword) adds the batch delta
// rather than overwriting. db is injectable for testing.
async function upsertRows(rows, db = knex) {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    await db(TABLE)
      .insert(chunk)
      .onConflict(UNIQUE_KEYS)
      .merge({ message_count: db.raw("message_count + VALUES(message_count)") });
  }
}

module.exports.__testing = { aggregate, buildRows, popQueue, statDateUtc8, upsertRows };

if (require.main === module) {
  main().then(() => process.exit(0));
}
