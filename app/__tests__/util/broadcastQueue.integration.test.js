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

  return { lists, zsets };
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

    // Next drain picks up the other still-fresh token and succeeds
    const second = await broadcastQueue.drain("Gxyz", { lineClient, replyTokenQueue });
    expect(second).toEqual({ drained: 1 });
    expect(store.lists.get("BROADCAST_QUEUE_Gxyz")).toEqual([]);
  });
});
