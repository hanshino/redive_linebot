const redis = require("../../src/util/redis");
const { handleTopicAnalysis } = require("../../bin/EventDequeue").__testing;

function groupTextEvent({
  userId = "Uaaa",
  groupId = "Gbbb",
  ts = 1700000000000,
  text = "今天凱留又爆死了",
} = {}) {
  return {
    source: { type: "group", userId, groupId },
    type: "message",
    message: { type: "text", text },
    timestamp: ts,
  };
}

describe("EventDequeue.handleTopicAnalysis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.lPush.mockResolvedValue(0);
  });

  it("enqueues the minimal payload for a group text event", async () => {
    await handleTopicAnalysis(
      groupTextEvent({
        userId: "Uaaa",
        groupId: "Gbbb",
        ts: 1782090000000,
        text: "今天凱留又爆死了",
      })
    );

    expect(redis.lPush).toHaveBeenCalledTimes(1);
    const [key, raw] = redis.lPush.mock.calls[0];
    expect(key).toBe("TOPIC_ANALYSIS_RECORD");
    expect(JSON.parse(raw)).toEqual({
      userId: "Uaaa",
      groupId: "Gbbb",
      text: "今天凱留又爆死了",
      ts: 1782090000000,
    });
  });

  it("ignores non-group events", async () => {
    await handleTopicAnalysis({
      source: { type: "user", userId: "Uaaa" },
      type: "message",
      message: { type: "text", text: "今天凱留又爆死了" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    await handleTopicAnalysis({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "follow",
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-text messages", async () => {
    await handleTopicAnalysis({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "message",
      message: { type: "sticker" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores events missing userId or groupId", async () => {
    await handleTopicAnalysis({
      source: { type: "group", groupId: "Gbbb" },
      type: "message",
      message: { type: "text", text: "今天凱留又爆死了" },
      timestamp: 1700000000000,
    });
    await handleTopicAnalysis({
      source: { type: "group", userId: "Uaaa" },
      type: "message",
      message: { type: "text", text: "今天凱留又爆死了" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("skips command-prefixed messages (/, #, .)", async () => {
    for (const text of ["/gacha", "#榜單", ".help"]) {
      await handleTopicAnalysis(groupTextEvent({ text }));
    }
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("skips empty / whitespace-only text", async () => {
    for (const text of ["", " ", "\t\n"]) {
      await handleTopicAnalysis(groupTextEvent({ text }));
    }
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("enqueues single-char messages (lone 「哦」 is a countable utterance)", async () => {
    await handleTopicAnalysis(groupTextEvent({ text: "哦" }));
    expect(redis.lPush).toHaveBeenCalledTimes(1);
    expect(JSON.parse(redis.lPush.mock.calls[0][1]).text).toBe("哦");
  });

  it("enqueues when trimmed length is exactly 2", async () => {
    await handleTopicAnalysis(groupTextEvent({ text: " 笑死 " }));
    expect(redis.lPush).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(redis.lPush.mock.calls[0][1]);
    // text is enqueued raw (untrimmed) — the analyzer cron owns normalization.
    expect(payload.text).toBe(" 笑死 ");
  });

  describe("TOPIC_ANALYSIS_PAUSED kill-switch", () => {
    it("short-circuits when flag is '1'", async () => {
      redis.get.mockImplementation(key =>
        Promise.resolve(key === "TOPIC_ANALYSIS_PAUSED" ? "1" : null)
      );
      await handleTopicAnalysis(groupTextEvent());
      expect(redis.lPush).not.toHaveBeenCalled();
    });

    it("still records when flag is '0'", async () => {
      redis.get.mockImplementation(key =>
        Promise.resolve(key === "TOPIC_ANALYSIS_PAUSED" ? "0" : null)
      );
      await handleTopicAnalysis(groupTextEvent());
      expect(redis.lPush).toHaveBeenCalledTimes(1);
    });
  });

  describe("isolation — must never throw", () => {
    it("swallows redis.lPush rejection", async () => {
      redis.lPush.mockRejectedValue(new Error("redis down"));
      await expect(handleTopicAnalysis(groupTextEvent())).resolves.toBeUndefined();
    });

    it("swallows redis.get rejection", async () => {
      redis.get.mockRejectedValue(new Error("redis down"));
      await expect(handleTopicAnalysis(groupTextEvent())).resolves.toBeUndefined();
      expect(redis.lPush).not.toHaveBeenCalled();
    });

    it("swallows malformed event (missing source)", async () => {
      await expect(handleTopicAnalysis({})).resolves.toBeUndefined();
      expect(redis.lPush).not.toHaveBeenCalled();
    });
  });
});
