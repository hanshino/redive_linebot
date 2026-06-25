// mysql + bottender mocks live in __tests__/setup.js (global setupFile).
// Mock the query module so the controller is tested in isolation (no real DB).
// jest.mock is NOT hoisted here (jest config has transform:{}), so it must come
// before requiring the controller.
jest.mock("../../../service/topic/query", () => ({
  topUserKeywords: jest.fn(),
  topGroupKeywords: jest.fn(),
}));

const query = require("../../../service/topic/query");
const {
  _internal: { showMyWordCloud, showGroupTopics, resolveDays },
} = require("../topic");

function makeContext({
  type = "group",
  userId = "U" + "a".repeat(32),
  groupId = "C" + "b".repeat(32),
} = {}) {
  return {
    event: { source: { type, userId, groupId } },
    replyFlex: jest.fn().mockResolvedValue({}),
    replyText: jest.fn().mockResolvedValue({}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("topic controller — /我的文字雲", () => {
  it("queries top user keywords and replies a flex with the right altText", async () => {
    query.topUserKeywords.mockResolvedValue([
      { keyword: "凱留", count: 40 },
      { keyword: "課金", count: 12 },
    ]);
    const context = makeContext({ type: "group" });

    await showMyWordCloud(context, {});

    expect(query.topUserKeywords).toHaveBeenCalledWith(context.event.source.userId, {
      groupId: context.event.source.groupId,
      days: 30,
    });
    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    const [altText, bubble] = context.replyFlex.mock.calls[0];
    expect(altText).toBe("我的文字雲");
    expect(bubble.type).toBe("bubble");
  });

  it("aggregates across all groups when used in a 1:1 chat (groupId = null)", async () => {
    query.topUserKeywords.mockResolvedValue([{ keyword: "笑死", count: 5 }]);
    const context = makeContext({ type: "user" });

    await showMyWordCloud(context, {});

    expect(query.topUserKeywords).toHaveBeenCalledWith(context.event.source.userId, {
      groupId: null,
      days: 30,
    });
  });

  it("honors the '7' argument to query a 7-day window", async () => {
    query.topUserKeywords.mockResolvedValue([{ keyword: "凱留", count: 3 }]);
    const context = makeContext({ type: "group" });

    await showMyWordCloud(context, { match: { groups: { days: "7" } } });

    expect(query.topUserKeywords).toHaveBeenCalledWith(
      context.event.source.userId,
      expect.objectContaining({ days: 7 })
    );
  });

  it("replies text (not flex) when there is no data", async () => {
    query.topUserKeywords.mockResolvedValue([]);
    const context = makeContext({ type: "group" });

    await showMyWordCloud(context, {});

    expect(context.replyFlex).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
  });
});

describe("topic controller — /群組話題", () => {
  it("queries group keywords and replies a flex inside a group", async () => {
    query.topGroupKeywords.mockResolvedValue([{ keyword: "世界王", count: 80, userCount: 9 }]);
    const context = makeContext({ type: "group" });

    await showGroupTopics(context, {});

    expect(query.topGroupKeywords).toHaveBeenCalledWith(context.event.source.groupId, { days: 30 });
    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    expect(context.replyFlex.mock.calls[0][0]).toBe("群組話題");
  });

  it("replies the guard message when used outside a group", async () => {
    const context = makeContext({ type: "user" });

    await showGroupTopics(context, {});

    expect(query.topGroupKeywords).not.toHaveBeenCalled();
    expect(context.replyFlex).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyText.mock.calls[0][0]).toMatch(/群組/);
  });

  it("replies text when the group has no data", async () => {
    query.topGroupKeywords.mockResolvedValue([]);
    const context = makeContext({ type: "group" });

    await showGroupTopics(context, {});

    expect(context.replyFlex).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
  });
});

describe("topic controller — resolveDays", () => {
  it("returns 7 only for the exact '7' arg, else 30", () => {
    expect(resolveDays({ match: { groups: { days: "7" } } })).toBe(7);
    expect(resolveDays({ match: { groups: { days: "30" } } })).toBe(30);
    expect(resolveDays({ match: { groups: { days: "14" } } })).toBe(30);
    expect(resolveDays({})).toBe(30);
  });
});
