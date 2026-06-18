const { EMPTY_MENTION_REPLY, createAiResponder } = require("../../../src/service/ai/AiResponder");

function makeMessage(overrides = {}) {
  return {
    groupId: "G1",
    speakerId: "U1",
    speakerName: "Alice",
    text: "救命",
    ...overrides,
  };
}

function makeConversationLog() {
  const target = {
    id: "target",
    role: "human",
    speakerName: "Alice",
    text: "救命",
  };
  return {
    recordHumanMessage: jest.fn().mockResolvedValue(target),
    recordSelfReply: jest.fn().mockResolvedValue({ id: "self", role: "self" }),
    getRecentMessages: jest.fn().mockResolvedValue([{ id: "old", role: "human", text: "舊訊息" }]),
    buildPromptContext: jest.fn((messages, targetMessage) => ({
      targetMessage,
      contextMessages: messages,
    })),
    reset: jest.fn().mockResolvedValue(undefined),
  };
}

describe("AiResponder", () => {
  it("returns the empty mention reply without calling Gemini", async () => {
    const conversationLog = makeConversationLog();
    const geminiClient = { generateReply: jest.fn() };
    const responder = createAiResponder({ conversationLog, geminiClient });

    const result = await responder.respondToMention(makeMessage({ text: "   " }));

    expect(result).toEqual({ action: "reply", text: EMPTY_MENTION_REPLY });
    expect(conversationLog.recordHumanMessage).not.toHaveBeenCalled();
    expect(geminiClient.generateReply).not.toHaveBeenCalled();
  });

  it("records target, asks Gemini with prompt context, and records self reply", async () => {
    const conversationLog = makeConversationLog();
    const geminiClient = { generateReply: jest.fn().mockResolvedValue("可以，先講狀況") };
    const responder = createAiResponder({ conversationLog, geminiClient });

    const result = await responder.respondToMention(makeMessage());

    expect(conversationLog.recordHumanMessage).toHaveBeenCalledWith("G1", {
      speakerId: "U1",
      speakerName: "Alice",
      text: "救命",
    });
    expect(conversationLog.buildPromptContext).toHaveBeenCalledWith(
      [{ id: "old", role: "human", text: "舊訊息" }],
      expect.objectContaining({ id: "target" })
    );
    expect(geminiClient.generateReply).toHaveBeenCalledWith({
      targetMessage: expect.objectContaining({ id: "target" }),
      contextMessages: [{ id: "old", role: "human", text: "舊訊息" }],
    });
    expect(conversationLog.recordSelfReply).toHaveBeenCalledWith("G1", {
      speakerName: "布丁",
      text: "可以，先講狀況",
    });
    expect(result).toEqual({ action: "reply", text: "可以，先講狀況" });
  });

  it("stays silent when Gemini fails", async () => {
    const conversationLog = makeConversationLog();
    const geminiClient = { generateReply: jest.fn().mockRejectedValue(new Error("quota")) };
    const responder = createAiResponder({ conversationLog, geminiClient });

    await expect(responder.respondToMention(makeMessage())).resolves.toEqual({ action: "silent" });
    expect(conversationLog.recordSelfReply).not.toHaveBeenCalled();
  });

  it("keeps passive logging short and non-blocking", async () => {
    const conversationLog = makeConversationLog();
    const responder = createAiResponder({
      conversationLog,
      geminiClient: { generateReply: jest.fn() },
    });

    await expect(
      responder.recordPassiveMessage(makeMessage({ text: "x".repeat(101) }))
    ).resolves.toEqual({
      recorded: false,
    });
    expect(conversationLog.recordHumanMessage).not.toHaveBeenCalled();
  });
});
