// End-to-end wiring of M4: pushEvent -> saveToken -> drain -> lineClient.reply.
// jest.config disables babel transform — jest.mock must precede requires.
// See feedback_jest_mock_hoisting.md

const redis = require("../../src/util/redis");
const broadcastQueue = require("../../src/util/broadcastQueue");
const replyTokenQueue = require("../../src/util/replyTokenQueue");

/**
 * In-memory fake for the subset of redis commands used by broadcastQueue
 * and replyTokenQueue. Wired up by replacing the jest-mock fns with real
 * implementations backed by the local store.
 */
function installFakeRedis() {
  const lists = new Map(); // key -> string[]  (head=index 0)
  const zsets = new Map(); // key -> Array<{score, value}>
  const strings = new Map(); // key -> string  (SET NX targets, incl. drain locks)

  // Real SET NX semantics: first caller gets "OK", everyone after gets null
  // until the key is removed. That is the whole basis of the drain lock, so the
  // fake has to honour it rather than always succeed.
  redis.set.mockImplementation(async (key, value, options) => {
    if (options && options.NX && strings.has(key)) return null;
    strings.set(key, value);
    return "OK";
  });
  redis.del.mockImplementation(async key => (strings.delete(key) ? 1 : 0));

  // The drain lock is released by a compare-and-delete Lua script and re-asserted
  // by a compare-and-PEXPIRE one. Both hinge on the value matching, which is the
  // whole ownership guarantee, so the fake evaluates the comparison for real
  // rather than always succeeding.
  // __tests__/setup.js predates the token lock and has no eval on the mock.
  if (!redis.eval) redis.eval = jest.fn();
  redis.eval.mockImplementation(async (script, { keys, arguments: args }) => {
    const [key] = keys;
    const [token] = args;
    if (strings.get(key) !== token) return 0;
    if (script.includes("DEL")) strings.delete(key);
    return 1;
  });

  redis.lPush.mockImplementation(async (key, value) => {
    const arr = lists.get(key) || [];
    arr.unshift(value);
    lists.set(key, arr);
    return arr.length;
  });
  redis.lRange.mockImplementation(async (key, start, stop) => {
    const arr = lists.get(key) || [];
    const len = arr.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    return arr.slice(s, e + 1);
  });
  redis.lTrim.mockImplementation(async (key, start, stop) => {
    const arr = lists.get(key) || [];
    const len = arr.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    lists.set(key, arr.slice(s, e + 1));
    return "OK";
  });
  redis.expire.mockResolvedValue(1);

  redis.zAdd.mockImplementation(async (key, { score, value }) => {
    const set = zsets.get(key) || [];
    const idx = set.findIndex(m => m.value === value);
    if (idx >= 0) set[idx].score = score;
    else set.push({ score, value });
    set.sort((a, b) => a.score - b.score);
    zsets.set(key, set);
    return 1;
  });
  redis.zRangeByScore.mockImplementation(async (key, min, max) => {
    const set = zsets.get(key) || [];
    const hi = max === "+inf" ? Infinity : Number(max);
    return set.filter(m => m.score >= min && m.score <= hi).map(m => m.value);
  });
  redis.zRem.mockImplementation(async (key, value) => {
    const set = zsets.get(key) || [];
    const idx = set.findIndex(m => m.value === value);
    if (idx >= 0) {
      set.splice(idx, 1);
      return 1;
    }
    return 0;
  });
  redis.zRemRangeByRank.mockImplementation(async (key, start, stop) => {
    const set = zsets.get(key) || [];
    const len = set.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    if (s > e || s >= len) return 0;
    const removed = e - s + 1;
    set.splice(s, removed);
    return removed;
  });
  redis.zRemRangeByScore.mockImplementation(async (key, min, max) => {
    const set = zsets.get(key) || [];
    const before = set.length;
    const kept = set.filter(m => m.score < min || m.score > max);
    zsets.set(key, kept);
    return before - kept.length;
  });

  return { lists, zsets, strings };
}

describe("M4 integration: push -> drain -> reply", () => {
  let store;
  let lineClient;

  beforeEach(() => {
    jest.clearAllMocks();
    store = installFakeRedis();
    lineClient = { reply: jest.fn().mockResolvedValue({}) };
  });

  it("pushes a trial_pass event and a fresh token, then drains to LINE reply", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gxyz", {
      type: "trial_pass",
      userId: "Uabc",
      text: "通過了 ★1 的試煉，永久解放 永久 XP +1%",
    });
    await replyTokenQueue.saveToken("Gxyz", "token-fresh", now);

    const result = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 1 });
    expect(lineClient.reply).toHaveBeenCalledTimes(1);
    const [tokenArg, messages] = lineClient.reply.mock.calls[0];
    expect(tokenArg).toBe("token-fresh");
    expect(messages).toEqual([{ type: "text", text: "通過了 ★1 的試煉，永久解放 永久 XP +1%" }]);

    // token consumed (zRem'd)
    expect(store.zsets.get("REPLY_TOKEN_QUEUE_Gxyz")).toEqual([]);
    // queue drained
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
  });

  it("preserves events when no fresh token exists (drain is a no-op)", async () => {
    await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "完成第 1 次轉生" });

    const result = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 0, reason: "no_token" });
    expect(lineClient.reply).not.toHaveBeenCalled();
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toHaveLength(1);
  });

  it("drops expired tokens (>55s old) and falls through to no_token", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "x" });
    // Token scored 60s in the past — replyTokenQueue.pullFreshToken should skip it
    await replyTokenQueue.saveToken("Gxyz", "token-stale", now - 60000);

    // saveToken itself should have already ZREMRANGEBYSCORE'd the stale token,
    // leaving the zset empty — drain sees no_token.
    const result = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });
    expect(result.reason).toBe("no_token");
  });

  it("drains multiple events in chronological order from a single reply call", async () => {
    const now = Date.now();
    // Push in chronological order — lPush means newer → head
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_enter", text: "event-1" });
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "event-2" });
    await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "event-3" });
    await replyTokenQueue.saveToken("Gxyz", "tok", now);

    await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });

    const [, messages] = lineClient.reply.mock.calls[0];
    expect(messages.map(m => m.text)).toEqual(["event-1", "event-2", "event-3"]);
  });

  it("reply API failure leaves queue + next call retries successfully", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "retry-me" });
    await replyTokenQueue.saveToken("Gxyz", "tok-1", now);
    await replyTokenQueue.saveToken("Gxyz", "tok-2", now + 100);

    lineClient.reply.mockRejectedValueOnce(new Error("Invalid reply token"));
    const first = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });
    expect(first.reason).toBe("reply_failed");
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toHaveLength(1);

    // The failed attempt released its own lock on the way out, so the immediate
    // retry is not turned away — no waiting out the TTL.
    expect(store.strings.has("BROADCAST_DRAIN_LOCK_Gxyz")).toBe(false);

    // Next drain picks up the other still-fresh token and succeeds
    const second = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });
    expect(second).toEqual({ drained: 1 });
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
  });
});

/**
 * The production hazard: EventDequeue drains on every inbound group message
 * (fire-and-forget) while the 30s cron sweeps the same keys. Without a lock both
 * read the same slice, pull two *different* fresh tokens, reply twice, and lTrim
 * twice — users see duplicates and later events are deleted unsent.
 */
describe("concurrent drain on one group", () => {
  let store;
  let lineClient;

  // Makes the reply straddle the other drain: the second caller starts while the
  // first is still awaiting LINE, which is exactly the real interleaving.
  function gatedLineClient() {
    let releaseReply;
    const replyStarted = new Promise(resolve => {
      releaseReply = resolve;
    });
    let gate;
    const held = new Promise(resolve => {
      gate = resolve;
    });
    const client = {
      reply: jest.fn(async () => {
        releaseReply();
        await held;
        return {};
      }),
    };
    return { client, replyStarted, release: () => gate() };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    store = installFakeRedis();
    lineClient = { reply: jest.fn().mockResolvedValue({}) };
  });

  it("replies once and trims once when two drains overlap with different tokens", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "event-1" });
    await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "event-2" });
    // Two independent fresh tokens: without the lock each drain would claim one
    // and both would deliver.
    await replyTokenQueue.saveToken("Gxyz", "tok-eventdequeue", now);
    await replyTokenQueue.saveToken("Gxyz", "tok-cron", now + 10);

    const { client, replyStarted, release } = gatedLineClient();
    const first = broadcastQueue.drain("Gxyz", { lineClient: client, replyTokenQueue });
    await replyStarted; // first drain is mid-reply, holding the lock
    const second = await broadcastQueue.drain("Gxyz", { lineClient: client, replyTokenQueue });
    release();
    const firstResult = await first;

    expect(firstResult).toEqual({ drained: 2 });
    expect(second).toEqual({ drained: 0, reason: "locked" });
    expect(client.reply).toHaveBeenCalledTimes(1);
    expect(client.reply.mock.calls[0][1].map(m => m.text)).toEqual(["event-1", "event-2"]);
    expect(redis.lTrim).toHaveBeenCalledTimes(1);
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
    // Exactly one token was consumed: the loser never reached pullFreshToken, so
    // the other is still available for the next cycle.
    expect(store.zsets.get("REPLY_TOKEN_QUEUE_Gxyz").map(m => m.value)).toEqual([
      "tok-eventdequeue",
    ]);
  });

  it("does not delete an event that arrived while a drain was in flight", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "in-batch" });
    await replyTokenQueue.saveToken("Gxyz", "tok-1", now);
    await replyTokenQueue.saveToken("Gxyz", "tok-2", now + 10);

    const { client, replyStarted, release } = gatedLineClient();
    const first = broadcastQueue.drain("Gxyz", { lineClient: client, replyTokenQueue });
    await replyStarted;

    // A new event lands mid-flight; the concurrent drain must not consume it.
    await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "arrived-late" });
    const second = await broadcastQueue.drain("Gxyz", { lineClient: client, replyTokenQueue });
    release();
    await first;

    expect(second.reason).toBe("locked");
    expect(client.reply).toHaveBeenCalledTimes(1);
    expect(client.reply.mock.calls[0][1].map(m => m.text)).toEqual(["in-batch"]);
    // The late event survives the winner's lTrim and is still deliverable.
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz").map(raw => JSON.parse(raw).text)).toEqual([
      "arrived-late",
    ]);

    // The winner released its own lock when it finished, so the late event is
    // deliverable immediately rather than after the TTL.
    expect(store.strings.has("BROADCAST_DRAIN_LOCK_Gxyz")).toBe(false);
    const third = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });
    expect(third).toEqual({ drained: 1 });
    expect(lineClient.reply.mock.calls[0][1].map(m => m.text)).toEqual(["arrived-late"]);
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
  });

  it("serialises a burst of five simultaneous drains into one delivery", async () => {
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "only-once" });
    for (let i = 0; i < 5; i += 1) {
      await replyTokenQueue.saveToken("Gxyz", `tok-${i}`, Date.now() + i);
    }

    const results = await Promise.all(
      Array.from({ length: 5 }, () => broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue }))
    );

    expect(results.filter(r => r.drained === 1)).toHaveLength(1);
    expect(results.filter(r => r.reason === "locked")).toHaveLength(4);
    expect(lineClient.reply).toHaveBeenCalledTimes(1);
    expect(redis.lTrim).toHaveBeenCalledTimes(1);
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
  });

  it("keeps different groups independent — one group's lock never blocks another", async () => {
    const now = Date.now();
    await broadcastQueue.pushEvent("Gone", { type: "prestige", text: "group-one" });
    await broadcastQueue.pushEvent("Gtwo", { type: "prestige", text: "group-two" });
    await replyTokenQueue.saveToken("Gone", "tok-one", now);
    await replyTokenQueue.saveToken("Gtwo", "tok-two", now);

    const [one, two] = await Promise.all([
      broadcastQueue.drain("Gone", { lineClient, replyTokenQueue }),
      broadcastQueue.drain("Gtwo", { lineClient, replyTokenQueue }),
    ]);

    expect(one).toEqual({ drained: 1 });
    expect(two).toEqual({ drained: 1 });
    expect(lineClient.reply).toHaveBeenCalledTimes(2);
    expect(store.lists.get("BROADCAST_QUEUE_Gone")).toEqual([]);
    expect(store.lists.get("BROADCAST_QUEUE_Gtwo")).toEqual([]);
  });

  it("releases the lock at the end of each drain so the next cycle proceeds", async () => {
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "first" });
    await replyTokenQueue.saveToken("Gxyz", "tok-1", Date.now());
    await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });

    // Previously this needed the 10s TTL to lapse; the compare-and-delete
    // release makes the very next drain eligible.
    expect(store.strings.has("BROADCAST_DRAIN_LOCK_Gxyz")).toBe(false);

    await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "second" });
    await replyTokenQueue.saveToken("Gxyz", "tok-2", Date.now());
    expect(await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue })).toEqual({
      drained: 1,
    });
    expect(lineClient.reply).toHaveBeenCalledTimes(2);
    expect(lineClient.reply.mock.calls[1][1].map(m => m.text)).toEqual(["second"]);
  });

  /**
   * The exact bug: a reply that outruns LOCK_TTL_SECONDS. The successor
   * legitimately acquires the lock and claims the same slice; the original
   * drainer must NOT lTrim on its way out, or it deletes events the successor
   * owns plus anything pushed after its own slice.
   */
  it("stalled drainer whose lock was taken over must not lTrim", async () => {
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "in-flight" });
    await replyTokenQueue.saveToken("Gxyz", "tok-1", Date.now());

    const logger = { error: jest.fn() };
    const client = {
      // Mid-reply the TTL lapses and another drainer takes the key. Overwriting
      // the value is exactly what SET NX does after an expiry.
      reply: jest.fn(async () => {
        store.strings.set("BROADCAST_DRAIN_LOCK_Gxyz", "successor-token");
        return {};
      }),
    };

    const result = await broadcastQueue.drain("Gxyz", {
      lineClient: client,
      replyTokenQueue,
      logger,
    });

    expect(result).toEqual({ drained: 0, reason: "lock_lost" });
    expect(redis.lTrim).not.toHaveBeenCalled();
    // The event is still queued — undelivered-looking but not lost.
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toHaveLength(1);
    // The successor's lock is untouched: our release compared and found a
    // foreign token.
    expect(store.strings.get("BROADCAST_DRAIN_LOCK_Gxyz")).toBe("successor-token");
    expect(logger.error).toHaveBeenCalled();
  });

  it("a late event pushed after the read is never trimmed by a lock-lost drainer", async () => {
    await broadcastQueue.pushEvent("Gxyz", { type: "trial_pass", text: "in-batch" });
    await replyTokenQueue.saveToken("Gxyz", "tok-1", Date.now());

    const client = {
      reply: jest.fn(async () => {
        // Lock lapses and is taken over, and a new event lands, both while the
        // reply is in flight.
        store.strings.set("BROADCAST_DRAIN_LOCK_Gxyz", "successor-token");
        await broadcastQueue.pushEvent("Gxyz", { type: "prestige", text: "arrived-late" });
        return {};
      }),
    };

    await broadcastQueue.drain("Gxyz", { lineClient: client, replyTokenQueue });

    // The old TTL-only code would lTrim(0, -2) here and silently delete
    // "arrived-late", which was never sent.
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz").map(raw => JSON.parse(raw).text)).toEqual([
      "arrived-late",
      "in-batch",
    ]);
  });
});
