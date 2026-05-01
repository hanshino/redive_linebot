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

  beforeEach(() => {
    jest.clearAllMocks();
    lineClient = makeLineClient();
    redis.lRange.mockResolvedValue([]);
    redis.lTrim.mockResolvedValue("OK");
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
  });
});
