const {
  createConversationLog,
  parseEvent,
  serializeEvent,
} = require("../../../src/service/ai/ConversationLog");

function makeRedis() {
  return {
    rPush: jest.fn().mockResolvedValue(1),
    lTrim: jest.fn().mockResolvedValue("OK"),
    expire: jest.fn().mockResolvedValue(1),
    lRange: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
  };
}

describe("ConversationLog", () => {
  it("records structured human messages into the existing group session key", async () => {
    const redis = makeRedis();
    const log = createConversationLog({ redisClient: redis });

    const event = await log.recordHumanMessage("G1", {
      speakerId: "U1",
      speakerName: "Alice",
      text: "救命",
    });

    expect(event.role).toBe("human");
    expect(redis.rPush).toHaveBeenCalledTimes(1);
    expect(redis.rPush.mock.calls[0][0]).toBe("group:session:G1");
    expect(JSON.parse(redis.rPush.mock.calls[0][1][0])).toMatchObject({
      role: "human",
      speakerName: "Alice",
      text: "救命",
    });
    expect(redis.lTrim).toHaveBeenCalledWith("group:session:G1", -20, -1);
    expect(redis.expire).toHaveBeenCalledWith("group:session:G1", 3600);
  });

  it("parses legacy plain text entries as human context", () => {
    expect(parseEvent("Alice：舊訊息")).toMatchObject({
      role: "human",
      speakerName: "某個群友",
      text: "Alice：舊訊息",
      source: "legacy",
    });
  });

  it("builds prompt context by separating the target event from history", async () => {
    const target = {
      id: "target",
      role: "human",
      speakerName: "Alice",
      text: "布丁，今天在聊什麼",
    };
    const self = {
      id: "self",
      role: "self",
      speakerName: "布丁",
      text: "前一次回覆",
    };
    const log = createConversationLog({ redisClient: makeRedis() });

    const promptContext = log.buildPromptContext([self, target], target);

    expect(promptContext.targetMessage).toBe(target);
    expect(promptContext.contextMessages).toEqual([self]);
  });

  it("round-trips structured events", () => {
    const event = {
      schema: "ai.conversation_event.v1",
      id: "1",
      role: "self",
      text: "嗨",
    };

    expect(parseEvent(serializeEvent(event))).toEqual(event);
  });
});
