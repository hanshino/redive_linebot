const redis = require("../../src/util/redis");
const { handleChatExp } = require("../../bin/EventDequeue").__testing;

function groupTextEvent({
  userId = "Uaaa",
  groupId = "Gbbb",
  ts = 1700000000000,
  text = "hi",
} = {}) {
  return {
    source: { type: "group", userId, groupId },
    type: "message",
    message: { type: "text", text },
    timestamp: ts,
  };
}

describe("EventDequeue.handleChatExp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue();
    redis.lPush.mockResolvedValue();
  });

  it("ignores non-group events", async () => {
    await handleChatExp({
      source: { type: "user", userId: "Uaaa" },
      type: "message",
      message: { type: "text" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-text messages", async () => {
    await handleChatExp({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "message",
      message: { type: "sticker" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    await handleChatExp({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "follow",
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("pushes new-shape payload with null timeSinceLastMsg on first message", async () => {
    redis.get.mockResolvedValue(null);

    await handleChatExp(groupTextEvent({ userId: "Uaaa", groupId: "Gbbb", ts: 1700000000000 }));

    const pushCall = redis.lPush.mock.calls.find(c => c[0] === "CHAT_EXP_RECORD");
    expect(pushCall).toBeDefined();
    const payload = JSON.parse(pushCall[1]);
    expect(payload).toEqual(
      expect.objectContaining({
        userId: "Uaaa",
        groupId: "Gbbb",
        ts: 1700000000000,
        timeSinceLastMsg: null,
      })
    );
    expect(typeof payload.groupCount).toBe("number");
  });

  it("computes timeSinceLastMsg from previous touch TS", async () => {
    redis.get.mockImplementation(key => {
      if (key === "CHAT_TOUCH_TIMESTAMP_Uaaa") return Promise.resolve("1699999997000");
      return Promise.resolve(null);
    });

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    const pushCall = redis.lPush.mock.calls.find(c => c[0] === "CHAT_EXP_RECORD");
    const payload = JSON.parse(pushCall[1]);
    expect(payload.timeSinceLastMsg).toBe(3000);
  });

  it("sets CHAT_TOUCH_TIMESTAMP_{userId} with 10s TTL", async () => {
    redis.get.mockResolvedValue(null);

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    expect(redis.set).toHaveBeenCalledWith("CHAT_TOUCH_TIMESTAMP_Uaaa", "1700000000000", {
      EX: 10,
    });
  });

  it("always updates touch TS even when timeSinceLastMsg < 1s", async () => {
    redis.get.mockImplementation(key => {
      if (key === "CHAT_TOUCH_TIMESTAMP_Uaaa") return Promise.resolve("1699999999500");
      return Promise.resolve(null);
    });

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    expect(redis.set).toHaveBeenCalledWith("CHAT_TOUCH_TIMESTAMP_Uaaa", "1700000000000", {
      EX: 10,
    });
  });

  describe("CHAT_XP_PAUSED kill-switch", () => {
    it("short-circuits when flag is '1' — no touch TS, no XP push", async () => {
      redis.get.mockImplementation(key => Promise.resolve(key === "CHAT_XP_PAUSED" ? "1" : null));

      await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.lPush).not.toHaveBeenCalled();
    });

    it("still records when flag is missing", async () => {
      redis.get.mockResolvedValue(null);

      await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

      expect(redis.lPush).toHaveBeenCalledWith("CHAT_EXP_RECORD", expect.any(String));
    });

    it("still records when flag is '0'", async () => {
      redis.get.mockImplementation(key => Promise.resolve(key === "CHAT_XP_PAUSED" ? "0" : null));

      await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

      expect(redis.lPush).toHaveBeenCalledWith("CHAT_EXP_RECORD", expect.any(String));
    });
  });
});
