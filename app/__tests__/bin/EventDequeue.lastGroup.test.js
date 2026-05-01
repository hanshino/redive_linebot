const { __testing } = require("../../bin/EventDequeue");
const redis = require("../../src/util/redis");

describe("EventDequeue.handleChatExp — CHAT_USER_LAST_GROUP tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  it("writes CHAT_USER_LAST_GROUP_{userId} with TTL 86400 for group text messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(c => c[0] === "CHAT_USER_LAST_GROUP_Uuser1");
    expect(call).toBeDefined();
    expect(call[1]).toBe("Ggroup1");
    expect(call[2]).toEqual({ EX: 86400 });
  });

  it("does NOT write CHAT_USER_LAST_GROUP for non-group messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "user", userId: "Uuser1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(
      c => typeof c[0] === "string" && c[0].startsWith("CHAT_USER_LAST_GROUP_")
    );
    expect(call).toBeUndefined();
  });

  it("does NOT write CHAT_USER_LAST_GROUP for non-text group messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "sticker" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(
      c => typeof c[0] === "string" && c[0].startsWith("CHAT_USER_LAST_GROUP_")
    );
    expect(call).toBeUndefined();
  });

  it("keeps the existing CHAT_EXP_RECORD lPush behavior", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    expect(redis.lPush).toHaveBeenCalled();
    const [key, payload] = redis.lPush.mock.calls[0];
    expect(key).toBe("CHAT_EXP_RECORD");
    const parsed = JSON.parse(payload);
    expect(parsed.userId).toBe("Uuser1");
    expect(parsed.groupId).toBe("Ggroup1");
  });
});
