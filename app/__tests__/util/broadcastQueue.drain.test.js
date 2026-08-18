// jest.config disables babel transform — jest.mock must precede requires.
// See feedback_jest_mock_hoisting.md
jest.mock("../../src/util/replyTokenQueue", () => ({
  saveToken: jest.fn(),
  pullFreshToken: jest.fn(),
}));

const redis = require("../../src/util/redis");
const replyTokenQueue = require("../../src/util/replyTokenQueue");
const broadcastQueue = require("../../src/util/broadcastQueue");

function makeLineClient() {
  return { reply: jest.fn().mockResolvedValue({}) };
}

function ev(type, text, extra = {}) {
  return JSON.stringify({ type, text, ...extra });
}

// The lock value written by drain (a random ownership token).
function lockToken() {
  return redis.set.mock.calls[0][1];
}

// The Lua scripts are distinguished by the command they run.
function evalCallsFor(command) {
  return redis.eval.mock.calls.filter(([script]) => script.includes(command));
}

describe("broadcastQueue.formatMessage", () => {
  it("produces a LINE text message from event.text", () => {
    const msg = broadcastQueue.formatMessage({ type: "trial_enter", text: "踏入了 ★1 的試煉" });
    expect(msg).toEqual({ type: "text", text: "踏入了 ★1 的試煉" });
  });

  it("falls back to [空事件] when text is missing", () => {
    const msg = broadcastQueue.formatMessage({ type: "unknown" });
    expect(msg.type).toBe("text");
    expect(msg.text).toBe("[空事件]");
  });

  it("produces a LINE flex message when event.flex is provided", () => {
    const flex = {
      altText: "alt",
      contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [] } },
    };
    const msg = broadcastQueue.formatMessage({ type: "lv_50_cta", flex });
    expect(msg).toEqual({ type: "flex", altText: "alt", contents: flex.contents });
  });

  it("falls back to text when flex is missing required fields", () => {
    const msg = broadcastQueue.formatMessage({
      type: "lv_50_cta",
      flex: { altText: "alt" },
      text: "fallback",
    });
    expect(msg).toEqual({ type: "text", text: "fallback" });
  });
});

describe("broadcastQueue.drain", () => {
  let lineClient;

  // __tests__/setup.js predates the ownership-token lock, so its redis mock has
  // no eval. Add it here rather than widening the global mock.
  beforeAll(() => {
    redis.eval = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    lineClient = makeLineClient();
    redis.lRange.mockResolvedValue([]);
    redis.lTrim.mockResolvedValue("OK");
    // Default: this caller wins the per-group drain lock.
    redis.set.mockResolvedValue("OK");
    // Default: renew/release both find the lock still ours.
    redis.eval.mockResolvedValue(1);
  });

  it("takes the per-group NX lock before reading the queue", async () => {
    redis.lRange.mockResolvedValueOnce([ev("trial_pass", "x")]);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce("tok");

    await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(redis.set).toHaveBeenCalledWith("BROADCAST_DRAIN_LOCK_Gabc", expect.any(String), {
      EX: 10,
      NX: true,
    });
    // The value must be an unguessable per-call token, not a constant — a
    // constant makes compare-and-delete meaningless.
    expect(lockToken().length).toBeGreaterThanOrEqual(16);
    // Reading the slice before the lock would let two callers capture it.
    expect(redis.set.mock.invocationCallOrder[0]).toBeLessThan(
      redis.lRange.mock.invocationCallOrder[0]
    );
  });

  it("returns locked and touches nothing when another drain holds the lock", async () => {
    redis.set.mockResolvedValueOnce(null);

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 0, reason: "locked" });
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(replyTokenQueue.pullFreshToken).not.toHaveBeenCalled();
    expect(lineClient.reply).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
    // The loser never owned the lock, so it must not run the release script at
    // all — not even the compare-and-delete, which would be a wasted round trip.
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("fails safe without draining when the lock itself is unreachable", async () => {
    redis.set.mockRejectedValueOnce(new Error("redis unavailable"));
    const logger = { error: jest.fn() };

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue, logger });

    expect(result).toEqual({ drained: 0, reason: "lock_failed" });
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(lineClient.reply).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns drained:0 when queue is empty", async () => {
    redis.lRange.mockResolvedValueOnce([]);
    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });
    expect(result).toEqual({ drained: 0 });
    expect(lineClient.reply).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
  });

  it("returns no_token when queue has events but no fresh token", async () => {
    redis.lRange.mockResolvedValueOnce([ev("trial_pass", "通過 ★1")]);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce(null);
    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });
    expect(result).toEqual({ drained: 0, reason: "no_token" });
    expect(lineClient.reply).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
  });

  it("on success: calls lineClient.reply with oldest-first messages and lTrims", async () => {
    // queue after lPushes:  [newest, ..., oldest]
    // lRange -5 -1 returns the tail slice (oldest 5) in list order = newest-to-oldest within slice.
    // drain must reverse into chronological order for display.
    const raws = [
      ev("trial_pass", "3"), // index -5 (newest among slice)
      ev("trial_pass", "2"),
      ev("trial_pass", "1"), // index -1 (oldest)
    ];
    redis.lRange.mockResolvedValueOnce(raws);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce("tok-fresh");

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 3 });
    expect(lineClient.reply).toHaveBeenCalledWith("tok-fresh", [
      { type: "text", text: "1" },
      { type: "text", text: "2" },
      { type: "text", text: "3" },
    ]);
    expect(redis.lTrim).toHaveBeenCalledWith("BROADCAST_QUEUE_Gabc", 0, -4);
  });

  it("on reply failure: leaves queue intact and logs", async () => {
    redis.lRange.mockResolvedValueOnce([ev("trial_pass", "通過")]);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce("tok-fresh");
    lineClient.reply.mockRejectedValueOnce(new Error("Invalid reply token"));
    const logger = { error: jest.fn() };

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue, logger });

    expect(result).toEqual({ drained: 0, reason: "reply_failed" });
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("never sends more than 5 messages in one reply (LINE limit)", async () => {
    const raws = Array.from({ length: 5 }, (_, i) => ev("x", String(i)));
    redis.lRange.mockResolvedValueOnce(raws);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce("tok");

    await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    const [, messages] = lineClient.reply.mock.calls[0];
    expect(messages.length).toBe(5);
    // ensure lRange was called with -5..-1 (oldest 5)
    expect(redis.lRange).toHaveBeenCalledWith("BROADCAST_QUEUE_Gabc", -5, -1);
  });

  it("skips unparseable entries without throwing", async () => {
    redis.lRange.mockResolvedValueOnce(["not-json", ev("trial_pass", "ok")]);
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce("tok");

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    // Drained counts list-slice length (what we'll lTrim), not message count
    expect(result).toEqual({ drained: 2 });
    const [, messages] = lineClient.reply.mock.calls[0];
    expect(messages).toEqual([{ type: "text", text: "ok" }]);
    expect(redis.lTrim).toHaveBeenCalledWith("BROADCAST_QUEUE_Gabc", 0, -3);
  });

  it("no-ops silently when groupId is falsy", async () => {
    const result = await broadcastQueue.drain(null, { lineClient, replyTokenQueue });
    expect(result).toEqual({ drained: 0 });
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

/**
 * Regression: the lock used to have no explicit release, relying on the 10s TTL,
 * with a comment claiming compare-and-delete only bought latency. It bought
 * correctness. A reply that stalls past the TTL lets a second drainer acquire a
 * fresh lock, read the SAME slice, and send it again; then both lTrim, and the
 * second trim deletes events that were pushed after the slice and never sent.
 */
describe("broadcastQueue.drain lock ownership", () => {
  let lineClient;

  beforeAll(() => {
    redis.eval = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    lineClient = makeLineClient();
    redis.lTrim.mockResolvedValue("OK");
    redis.set.mockResolvedValue("OK");
    redis.eval.mockResolvedValue(1);
    redis.lRange.mockResolvedValue([ev("trial_pass", "x")]);
    replyTokenQueue.pullFreshToken.mockResolvedValue("tok");
  });

  it("releases the lock with compare-and-delete after a successful drain", async () => {
    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 1 });
    const delCalls = evalCallsFor("DEL");
    expect(delCalls).toHaveLength(1);
    const [script, options] = delCalls[0];
    expect(script).toContain('redis.call("GET", KEYS[1]) == ARGV[1]');
    expect(options).toEqual({
      keys: ["BROADCAST_DRAIN_LOCK_Gabc"],
      arguments: [lockToken()],
    });
  });

  it("releases the lock after a failed reply and leaves the slice untrimmed", async () => {
    lineClient.reply.mockRejectedValueOnce(new Error("Invalid reply token"));

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 0, reason: "reply_failed" });
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(evalCallsFor("DEL")).toHaveLength(1);
  });

  it("releases the lock when the queue was empty", async () => {
    redis.lRange.mockResolvedValueOnce([]);

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 0 });
    expect(evalCallsFor("DEL")).toHaveLength(1);
  });

  it("releases the lock when no fresh token was available", async () => {
    replyTokenQueue.pullFreshToken.mockResolvedValueOnce(null);

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(result).toEqual({ drained: 0, reason: "no_token" });
    expect(evalCallsFor("DEL")).toHaveLength(1);
  });

  it("a second drain in the same tick proceeds once the first released", async () => {
    // Model a real lock key: SET NX fails while held, succeeds after the
    // compare-and-delete release.
    let held = null;
    redis.set.mockImplementation(async (key, value, options) => {
      if (options && options.NX && held !== null) return null;
      held = value;
      return "OK";
    });
    redis.eval.mockImplementation(async (script, { arguments: args }) => {
      if (held !== args[0]) return 0;
      if (script.includes("DEL")) held = null;
      return 1;
    });

    const first = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });
    const second = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    expect(first).toEqual({ drained: 1 });
    // Without the release this would have been {drained: 0, reason: "locked"}.
    expect(second).toEqual({ drained: 1 });
    expect(lineClient.reply).toHaveBeenCalledTimes(2);
  });

  it("does NOT lTrim when the lock expired mid-drain and another owner took over", async () => {
    // Ownership check fails: the key now holds someone else's token.
    redis.eval.mockResolvedValue(0);
    const logger = { error: jest.fn() };

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue, logger });

    expect(lineClient.reply).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ drained: 0, reason: "lock_lost" });
    // The whole point: trimming here would delete the successor's slice and any
    // event pushed after ours.
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not delete a lock owned by another drainer", async () => {
    // Lock key mutated to a foreign owner between acquire and release.
    let held = "someone-elses-token";
    redis.eval.mockImplementation(async (script, { arguments: args }) => {
      if (held !== args[0]) return 0;
      if (script.includes("DEL")) held = null;
      return 1;
    });

    await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    // Our compare-and-delete ran but matched nothing, so the foreign lock stands.
    expect(evalCallsFor("DEL")).toHaveLength(1);
    expect(held).toBe("someone-elses-token");
    // And no plain DEL was ever issued against the lock key.
    expect(redis.del).not.toHaveBeenCalledWith("BROADCAST_DRAIN_LOCK_Gabc");
  });

  it("re-asserts ownership between the reply and the lTrim, not before the reply", async () => {
    await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue });

    const renewCall = evalCallsFor("PEXPIRE")[0];
    expect(renewCall[1]).toEqual({
      keys: ["BROADCAST_DRAIN_LOCK_Gabc"],
      arguments: [lockToken(), "10000"],
    });
    const renewOrder = redis.eval.mock.invocationCallOrder[0];
    expect(lineClient.reply.mock.invocationCallOrder[0]).toBeLessThan(renewOrder);
    expect(renewOrder).toBeLessThan(redis.lTrim.mock.invocationCallOrder[0]);
  });

  it("skips the lTrim when the ownership check itself errors", async () => {
    // Can't prove ownership => must not run the destructive step.
    redis.eval.mockRejectedValue(new Error("redis unavailable"));
    const logger = { error: jest.fn() };

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue, logger });

    expect(result).toEqual({ drained: 0, reason: "lock_lost" });
    expect(redis.lTrim).not.toHaveBeenCalled();
  });

  it("still returns the drain result when the release itself fails", async () => {
    redis.eval
      .mockResolvedValueOnce(1) // renew succeeds
      .mockRejectedValueOnce(new Error("redis unavailable")); // release fails
    const logger = { error: jest.fn() };

    const result = await broadcastQueue.drain("Gabc", { lineClient, replyTokenQueue, logger });

    // A failed release is not a failed drain — the TTL still cleans up.
    expect(result).toEqual({ drained: 1 });
    expect(redis.lTrim).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
